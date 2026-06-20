import Link from "next/link";
import {
  CalendarRange,
  FileDown,
  Gauge,
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
import {
  canViewBillabilityKpi,
  canViewPersonReports,
} from "@/lib/permissions";

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
    href: "/reports/billability",
    title: "KPI fakturovatelnosti",
    description: "Podíl fakturovatelných hodin na odpracovaných.",
    icon: Gauge,
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
  const result = await safeQuery(
    { canViewPersonReports: false, canViewBillabilityKpi: false },
    async () => {
      const currentUser = await getCurrentUser();
      return {
        canViewPersonReports: canViewPersonReports(currentUser),
        canViewBillabilityKpi: canViewBillabilityKpi(currentUser),
      };
    },
  );

  const allowed = (entry: ReportEntry) => {
    if (entry.href.startsWith("/reports/by-person")) {
      return result.data.canViewPersonReports;
    }
    if (entry.href.startsWith("/reports/billability")) {
      return result.data.canViewBillabilityKpi;
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
                className="flex gap-3 rounded-lg border border-[#d4e2dc] p-4 transition hover:border-[#B9DCC6] hover:bg-[#EEF5F1]/60"
              >
                <Icon
                  className="mt-0.5 h-5 w-5 shrink-0 text-[#072924]"
                  aria-hidden="true"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-[#072924]">
                    {entry.title}
                    {entry.gated ? (
                      <Lock className="h-3.5 w-3.5 text-[#5f756e]" aria-hidden="true" />
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm text-[#5f756e]">
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
          {exports.map((entry) => {
            const Icon = entry.icon;
            return (
              <div
                key={entry.href}
                className="flex flex-col gap-3 rounded-lg border border-[#d4e2dc] p-4"
              >
                <span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-[#072924]">
                    <Icon
                      className="h-5 w-5 shrink-0 text-[#072924]"
                      aria-hidden="true"
                    />
                    {entry.title}
                  </span>
                  <span className="mt-1 block text-sm text-[#5f756e]">
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
