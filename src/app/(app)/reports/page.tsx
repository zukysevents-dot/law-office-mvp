import Link from "next/link";
import {
  CalendarRange,
  FileDown,
  Gauge,
  Hourglass,
  Layers,
  Lock,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { canViewTeamReports } from "@/lib/permissions";
import { AccessDenied } from "@/components/access-denied";
import {
  canAccessModule,
  moduleAccessDenial,
} from "@/lib/module-access.server";

export const dynamic = "force-dynamic";

type ReportEntry = {
  href: string;
  title: string;
  description: string;
  icon: typeof Layers;
  gated?: boolean;
};

const reportViews: ReportEntry[] = [
  {
    href: "/reports/hours",
    title: "Měsíční přehled hodin",
    description: "Odpracované hodiny a částky po měsících.",
    icon: CalendarRange,
  },
  {
    href: "/reports/by-legal-area",
    title: "Reporting podle právních oblastí",
    description: "Hodiny a částky rozdělené podle právní oblasti.",
    icon: Layers,
  },
  {
    href: "/reports/by-client",
    title: "Reporting podle klientů",
    description: "Hodiny a částky rozdělené podle klienta.",
    icon: Users,
  },
  {
    href: "/reports/by-person",
    title: "Reporting podle lidí",
    description: "Hodiny a částky rozdělené podle pracovníka.",
    icon: Users,
    gated: true,
  },
  {
    href: "/reports/by-team",
    title: "Reporting podle právních týmů",
    description: "Hodiny, částky a právní oblasti rozdělené podle týmů.",
    icon: Users,
    gated: true,
  },
  {
    href: "/reports/billability",
    title: "KPI fakturovatelnosti",
    description: "Podíl fakturovatelných hodin na odpracovaných.",
    icon: Gauge,
    gated: true,
  },
  {
    href: "/reports/wip",
    title: "Rozpracovanost (WIP)",
    description: "Schválená fakturovatelná práce, která ještě není na faktuře.",
    icon: Hourglass,
    gated: true,
  },
];

const exports: ReportEntry[] = [
  {
    href: "/reports/work-logs/export?format=xlsx",
    title: "Export výkazů práce",
    description: "Všechny viditelné výkazy práce do Excelu.",
    icon: FileDown,
  },
  {
    href: "/reports/references/export?format=xlsx",
    title: "Export referencí",
    description: "Viditelné reference do Excelu.",
    icon: FileDown,
  },
  {
    href: "/reports/tasks/export?format=xlsx",
    title: "Export úkolů",
    description: "Viditelné úkoly do Excelu.",
    icon: FileDown,
  },
];

export default async function ReportsPage() {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.reports");
  if (accessDenied) {
    return <AccessDenied title="Reporty a exporty" message={accessDenied} />;
  }

  const result = await safeQuery(
    {
      canViewPersonReports: false,
      canViewBillabilityKpi: false,
      canExportReferences: false,
      canExportTasks: false,
    },
    async () => {
      const currentUser = await getCurrentUser();
      return {
        canViewPersonReports: canViewTeamReports(currentUser),
        canViewBillabilityKpi: canViewTeamReports(currentUser),
        canExportReferences: await canAccessModule(
          currentUser,
          "module.references",
        ),
        canExportTasks: await canAccessModule(currentUser, "module.tasks"),
      };
    },
  );

  const allowed = (entry: ReportEntry) => {
    if (
      entry.href.startsWith("/reports/by-person") ||
      entry.href.startsWith("/reports/by-team")
    ) {
      return result.data.canViewPersonReports;
    }
    if (entry.href.startsWith("/reports/billability")) {
      return result.data.canViewBillabilityKpi;
    }
    if (entry.href.startsWith("/reports/wip")) {
      return result.data.canViewPersonReports;
    }
    if (entry.href.startsWith("/reports/references/export")) {
      return result.data.canExportReferences;
    }
    if (entry.href.startsWith("/reports/tasks/export")) {
      return result.data.canExportTasks;
    }
    return true;
  };

  const visibleReportViews = reportViews.filter(allowed);

  return (
    <>
      <PageHeader
        title="Reporty a exporty"
        description="Souhrnné reporty odpracovaných hodin a fakturovatelnosti a exporty dat do Excelu nebo CSV."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      <Section title="Reporty">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleReportViews.map((entry) => {
            const Icon = entry.icon;
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className="flex gap-3 rounded-lg border border-[#dce4e8] p-4 transition hover:border-[#17A2A2] hover:bg-[#F4F7F8]/60"
              >
                <Icon
                  className="mt-0.5 h-5 w-5 shrink-0 text-[#0e1822]"
                  aria-hidden="true"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-[#0e1822]">
                    {entry.title}
                    {entry.gated ? (
                      <Lock className="h-3.5 w-3.5 text-[#566673]" aria-hidden="true" />
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm text-[#566673]">
                    {entry.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </Section>
      <Section title="Exporty">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {exports.filter(allowed).map((entry) => {
            const Icon = entry.icon;
            return (
              <div
                key={entry.href}
                className="flex flex-col gap-3 rounded-lg border border-[#dce4e8] p-4"
              >
                <span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-[#0e1822]">
                    <Icon
                      className="h-5 w-5 shrink-0 text-[#0e1822]"
                      aria-hidden="true"
                    />
                    {entry.title}
                  </span>
                  <span className="mt-1 block text-sm text-[#566673]">
                    {entry.description}
                  </span>
                </span>
                <ButtonLink href={entry.href} variant="ghost" className="self-start">
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                  Stáhnout
                </ButtonLink>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
