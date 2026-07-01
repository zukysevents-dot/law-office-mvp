import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";

import {
  addDashboardWidget,
  resetDashboardWidgets,
} from "@/app/actions/dashboard-widgets";
import { ConfirmActionForm } from "@/components/confirm-action-form";
import {
  DashboardLayoutEditor,
  type EditorWidget,
} from "@/components/dashboard-layout-editor";
import { Field, SelectInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import {
  dashboardTableColumns,
  dashboardWidgetSizeLabels,
  dashboardWidgetSizes,
  dashboardWidgetTypeLabels,
  dashboardWidgetTypes,
  ensureDefaultDashboardWidgets,
  getVisibleDashboardColumns,
  isDashboardTableWidget,
} from "@/lib/dashboard-widgets";
import { safeQuery } from "@/lib/db-safe";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type DashboardSettingsData = {
  userName: string;
  widgets: EditorWidget[];
};

const sizeOptions = dashboardWidgetSizes.map((size) => ({
  value: size,
  label: dashboardWidgetSizeLabels[size],
}));

export default async function DashboardSettingsPage() {
  const result = await safeQuery<DashboardSettingsData>(
    {
      userName: "",
      widgets: [],
    },
    async () => {
      const currentUser = await getCurrentUser();
      const prisma = getPrisma();

      await ensureDefaultDashboardWidgets(currentUser.id);

      const widgets = await prisma.dashboardWidget.findMany({
        where: { userId: currentUser.id },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          type: true,
          title: true,
          size: true,
          visible: true,
          config: true,
        },
      });

      return {
        userName: currentUser.name,
        widgets: widgets.map((widget) => {
          const selected = getVisibleDashboardColumns(widget.type, widget.config);
          return {
            id: widget.id,
            typeLabel: dashboardWidgetTypeLabels[widget.type],
            title: widget.title,
            size: widget.size,
            visible: widget.visible,
            isTable: isDashboardTableWidget(widget.type),
            columns: (dashboardTableColumns[widget.type] ?? []).map((column) => ({
              key: column.key,
              label: column.label,
              selected: selected.includes(column.key),
            })),
          } satisfies EditorWidget;
        }),
      };
    },
  );

  return (
    <>
      <PageHeader
        title="Nastavení dashboardu"
        description={
          result.data.userName
            ? `Konfigurace widgetů pro uživatele ${result.data.userName}.`
            : "Konfigurace widgetů pro aktuálního uživatele."
        }
        action={
          <ButtonLink href="/dashboard" variant="ghost">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Zpět na dashboard
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <Section title="Přidat widget">
        <form
          action={addDashboardWidget}
          className="grid min-w-0 gap-3 md:grid-cols-[1fr_auto]"
          data-testid="add-dashboard-widget-form"
        >
          <Field label="Typ widgetu">
            <SelectInput name="type" data-testid="dashboard-widget-type">
              {dashboardWidgetTypes.map((type) => (
                <option key={type} value={type}>
                  {dashboardWidgetTypeLabels[type]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Button type="submit" className="self-end">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Přidat widget
          </Button>
        </form>
      </Section>
      <Section title="Widgety" className="grid min-w-0 gap-4 overflow-x-hidden">
        {result.data.widgets.length > 0 ? (
          <DashboardLayoutEditor
            widgets={result.data.widgets}
            sizes={sizeOptions}
          />
        ) : (
          <EmptyState>Dashboard zatím nemá uložené žádné widgety.</EmptyState>
        )}
      </Section>
      <Section title="Reset konfigurace">
        <div
          className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          data-testid="dashboard-reset-section"
        >
          <p className="text-sm leading-6 text-[#5f756e]">
            Reset smaže pouze osobní konfiguraci dashboardu a znovu vytvoří
            výchozí widgety. Nezasahuje do právních dat.
          </p>
          <ConfirmActionForm
            action={resetDashboardWidgets}
            label="Resetovat dashboard"
            message="Opravdu chcete resetovat dashboard do výchozího nastavení?"
            variant="danger"
          />
        </div>
      </Section>
      <p className="text-xs text-[#5f756e]">
        <Link href="/dashboard" className="text-[#072924] underline">
          Dashboard
        </Link>{" "}
        se po uložení automaticky aktualizuje.
      </p>
    </>
  );
}
