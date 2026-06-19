"use server";

import { revalidatePath } from "next/cache";

import {
  DashboardWidgetSize,
  DashboardWidgetType,
} from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import {
  dashboardTableColumns,
  dashboardWidgetConfigForType,
  dashboardWidgetTypeLabels,
  defaultDashboardWidgetData,
  getDefaultDashboardColumns,
  isDashboardTableWidget,
} from "@/lib/dashboard-widgets";
import { checkboxValue, enumValue, optionalString, requiredString } from "@/lib/form";
import { getPrisma } from "@/lib/prisma";

function revalidateDashboard() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
}

export async function addDashboardWidget(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const type = enumValue(
    DashboardWidgetType,
    formData.get("type"),
    DashboardWidgetType.ACTIVE_TASKS,
  );
  const maxPosition = await prisma.dashboardWidget.aggregate({
    where: { userId: currentUser.id },
    _max: { position: true },
  });

  await prisma.dashboardWidget.create({
    data: {
      userId: currentUser.id,
      type,
      title: dashboardWidgetTypeLabels[type],
      position: (maxPosition._max.position ?? -1) + 1,
      size: DashboardWidgetSize.MEDIUM,
      visible: true,
      config: dashboardWidgetConfigForType(type),
    },
  });

  revalidateDashboard();
}

export async function updateDashboardWidget(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const widgetId = requiredString(formData, "id");
  const existingWidget = await prisma.dashboardWidget.findFirstOrThrow({
    where: {
      id: widgetId,
      userId: currentUser.id,
    },
  });
  const size = enumValue(
    DashboardWidgetSize,
    formData.get("size"),
    existingWidget.size,
  );
  const availableColumns = new Set(
    dashboardTableColumns[existingWidget.type]?.map((column) => column.key) ?? [],
  );
  const selectedColumns = formData
    .getAll("columns")
    .filter(
      (column): column is string =>
        typeof column === "string" && availableColumns.has(column),
    );

  await prisma.dashboardWidget.update({
    where: { id: existingWidget.id },
    data: {
      title:
        optionalString(formData, "title") ??
        dashboardWidgetTypeLabels[existingWidget.type],
      size,
      visible: checkboxValue(formData, "visible"),
      config: isDashboardTableWidget(existingWidget.type)
        ? {
            columns:
              selectedColumns.length > 0
                ? selectedColumns
                : getDefaultDashboardColumns(existingWidget.type),
          }
        : dashboardWidgetConfigForType(existingWidget.type),
    },
  });

  revalidateDashboard();
}

export async function moveDashboardWidget(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const widgetId = requiredString(formData, "id");
  const direction = formData.get("direction") === "down" ? "down" : "up";
  const widgets = await prisma.dashboardWidget.findMany({
    where: { userId: currentUser.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      position: true,
    },
  });
  const currentIndex = widgets.findIndex((widget) => widget.id === widgetId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (
    currentIndex === -1 ||
    targetIndex < 0 ||
    targetIndex >= widgets.length
  ) {
    return;
  }

  const currentWidget = widgets[currentIndex];
  const targetWidget = widgets[targetIndex];

  await prisma.$transaction([
    prisma.dashboardWidget.update({
      where: { id: currentWidget.id },
      data: { position: targetWidget.position },
    }),
    prisma.dashboardWidget.update({
      where: { id: targetWidget.id },
      data: { position: currentWidget.position },
    }),
  ]);

  revalidateDashboard();
}

export async function resetDashboardWidgets() {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();

  await prisma.$transaction(async (tx) => {
    await tx.dashboardWidget.deleteMany({
      where: { userId: currentUser.id },
    });
    await tx.dashboardWidget.createMany({
      data: defaultDashboardWidgetData(currentUser.id),
    });
  });

  revalidateDashboard();
}
