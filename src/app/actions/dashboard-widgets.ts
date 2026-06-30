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
  parseDashboardLayoutPayload,
} from "@/lib/dashboard-widgets";
import { enumValue, requiredString } from "@/lib/form";
import { getPrisma } from "@/lib/prisma";

const MAX_WIDGET_TITLE = 200;

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

// Single-save for the drag-drop dashboard editor: persist order (= submitted
// index) plus each widget's title/size/visibility/columns in one transaction.
// Replaces the per-widget save + up/down moves. Order in the JSON payload is the
// new position; only the user's OWN widgets are touched (updateMany guards by
// userId), foreign/stale ids are ignored.
export async function saveDashboardLayout(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();

  const items = parseDashboardLayoutPayload(requiredString(formData, "payload"));
  if (!items) {
    throw new Error("Neplatná data rozložení dashboardu.");
  }

  const owned = await prisma.dashboardWidget.findMany({
    where: { userId: currentUser.id },
    select: { id: true, type: true },
  });
  const ownedById = new Map(owned.map((widget) => [widget.id, widget.type]));

  const updates = [];
  const seen = new Set<string>();
  let position = 0;
  for (const item of items) {
    const type = ownedById.get(item.id);
    if (!type || seen.has(item.id)) {
      // Foreign / stale id (never write to another user's widget) or a duplicate
      // id in a forged payload (process each widget once).
      continue;
    }
    seen.add(item.id);
    const size = enumValue(DashboardWidgetSize, item.size, DashboardWidgetSize.MEDIUM);
    const title =
      item.title.trim().slice(0, MAX_WIDGET_TITLE) ||
      dashboardWidgetTypeLabels[type];
    const availableColumns = new Set(
      dashboardTableColumns[type]?.map((column) => column.key) ?? [],
    );
    const selectedColumns = item.columns.filter((column) =>
      availableColumns.has(column),
    );
    const config = isDashboardTableWidget(type)
      ? {
          columns:
            selectedColumns.length > 0
              ? selectedColumns
              : getDefaultDashboardColumns(type),
        }
      : dashboardWidgetConfigForType(type);

    updates.push(
      prisma.dashboardWidget.updateMany({
        where: { id: item.id, userId: currentUser.id },
        data: { position, title, size, visible: item.visible, config },
      }),
    );
    position += 1;
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

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
