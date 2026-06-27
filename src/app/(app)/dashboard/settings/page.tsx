import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Plus } from "lucide-react";

import {
  addDashboardWidget,
  moveDashboardWidget,
  resetDashboardWidgets,
  updateDashboardWidget,
} from "@/app/actions/dashboard-widgets";
import { ConfirmActionForm } from "@/components/confirm-action-form";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
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
import { LIST_QUERY_LIMIT } from "@/lib/query-limits";

export const dynamic = "force-dynamic";

type DashboardSettingsData = {
  userName: string;
  widgets: Array<{
    id: string;
    type: keyof typeof dashboardWidgetTypeLabels;
    title: string;
    position: number;
    size: keyof typeof dashboardWidgetSizeLabels;
    visible: boolean;
    config: unknown;
  }>;
};

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
          position: true,
          size: true,
          visible: true,
          config: true,
        },
        take: LIST_QUERY_LIMIT,
      });

      return {
        userName: currentUser.name,
        widgets,
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
      <Section
        title="Widgety"
        className="grid min-w-0 gap-4 overflow-x-hidden"
      >
        {result.data.widgets.length > 0 ? (
          result.data.widgets.map((widget, index) => {
            const selectedColumns = getVisibleDashboardColumns(
              widget.type,
              widget.config,
            );
            const columns = dashboardTableColumns[widget.type] ?? [];

            return (
              <article
                key={widget.id}
                className="min-w-0 rounded-lg border border-[#d4e2dc] bg-[#EEF5F1]/45 p-4"
                data-testid="dashboard-widget-setting"
                data-widget-id={widget.id}
                data-widget-position={index}
                data-widget-size={widget.size}
                data-widget-type={widget.type}
              >
                <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-[#072924]">
                        {widget.title}
                      </h3>
                      <Badge tone={widget.visible ? "mint" : "neutral"}>
                        {widget.visible ? "Viditelný" : "Skrytý"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-[#5f756e]">
                      {dashboardWidgetTypeLabels[widget.type]} · pořadí{" "}
                      {index + 1}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={moveDashboardWidget}>
                      <input type="hidden" name="id" value={widget.id} />
                      <input type="hidden" name="direction" value="up" />
                      <Button
                        type="submit"
                        variant="ghost"
                        className="h-8 px-3"
                        disabled={index === 0}
                        data-testid="dashboard-widget-move-up"
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        Nahoru
                      </Button>
                    </form>
                    <form action={moveDashboardWidget}>
                      <input type="hidden" name="id" value={widget.id} />
                      <input type="hidden" name="direction" value="down" />
                      <Button
                        type="submit"
                        variant="ghost"
                        className="h-8 px-3"
                        disabled={index === result.data.widgets.length - 1}
                        data-testid="dashboard-widget-move-down"
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                        Dolů
                      </Button>
                    </form>
                  </div>
                </div>
                <form action={updateDashboardWidget} className="mt-4 grid gap-4">
                  <input type="hidden" name="id" value={widget.id} />
                  <div className="grid min-w-0 gap-3 lg:grid-cols-[1fr_220px_160px_auto]">
                    <Field label="Název">
                      <TextInput
                        name="title"
                        defaultValue={widget.title}
                        data-testid="dashboard-widget-title"
                      />
                    </Field>
                    <Field label="Velikost">
                      <SelectInput
                        name="size"
                        defaultValue={widget.size}
                        data-testid="dashboard-widget-size"
                      >
                        {dashboardWidgetSizes.map((size) => (
                          <option key={size} value={size}>
                            {dashboardWidgetSizeLabels[size]}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <label className="flex items-end gap-2 pb-2 text-sm font-medium text-[#072924]">
                      <input
                        type="checkbox"
                        name="visible"
                        defaultChecked={widget.visible}
                        className="h-4 w-4 rounded border-[#cfe0d7]"
                        data-testid="dashboard-widget-visible"
                      />
                      Zobrazit
                    </label>
                    <Button
                      type="submit"
                      variant="secondary"
                      className="self-end"
                      data-testid="dashboard-widget-save"
                    >
                      Uložit
                    </Button>
                  </div>
                  {isDashboardTableWidget(widget.type) ? (
                    <div className="min-w-0">
                      <p className="mb-2 text-sm font-medium text-[#072924]">
                        Viditelné sloupce
                      </p>
                      <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {columns.map((column) => (
                          <label
                            key={column.key}
                            className="flex min-w-0 items-center gap-2 text-sm text-stone-700"
                          >
                            <input
                              type="checkbox"
                              name="columns"
                              value={column.key}
                              defaultChecked={selectedColumns.includes(
                                column.key,
                              )}
                              className="h-4 w-4 shrink-0 rounded border-[#cfe0d7]"
                              data-testid="dashboard-widget-column"
                            />
                            <span className="min-w-0 truncate">
                              {column.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </form>
              </article>
            );
          })
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
