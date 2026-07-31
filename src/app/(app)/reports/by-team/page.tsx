import { Field, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatHours, formatMoney } from "@/lib/format";
import { canViewAllLegalData } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type TeamRow = {
  id: string;
  name: string;
  people: Set<string>;
  hours: number;
  amount: number;
  legalAreas: Map<string, number>;
};

type ReportData = {
  allowed: boolean;
  rows: Array<{
    id: string;
    name: string;
    people: number;
    hours: number;
    amount: number;
    legalAreas: string;
  }>;
};

function dateBoundary(value: string, end: boolean) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`)
    : undefined;
}

export default async function TeamReportPage({
  searchParams,
}: {
  searchParams: Promise<{ dateFrom?: string; dateTo?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const defaultFrom = `${now.getUTCFullYear()}-01-01`;
  const dateFrom = params.dateFrom ?? defaultFrom;
  const dateTo = params.dateTo ?? now.toISOString().slice(0, 10);

  const result = await safeQuery<ReportData>(
    { allowed: false, rows: [] },
    async () => {
      const currentUser = await getCurrentUser();
      if (!canViewAllLegalData(currentUser)) {
        return { allowed: false, rows: [] };
      }
      const prisma = getPrisma();
      const [teams, memberships, logs] = await Promise.all([
        prisma.legalTeam.findMany({
          where: { organizationId: currentUser.organizationId, archivedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.legalTeamMember.findMany({
          where: { organizationId: currentUser.organizationId },
          select: { legalTeamId: true, userId: true },
        }),
        prisma.workLog.findMany({
          where: {
            organizationId: currentUser.organizationId,
            archivedAt: null,
            workDate: {
              gte: dateBoundary(dateFrom, false),
              lte: dateBoundary(dateTo, true),
            },
          },
          select: {
            userId: true,
            hours: true,
            amountCzk: true,
            legalArea: true,
          },
          take: 10000,
        }),
      ]);

      const membershipByUser = new Map(
        memberships.map((membership) => [membership.userId, membership.legalTeamId]),
      );
      const rows = new Map<string, TeamRow>(
        teams.map((team) => [
          team.id,
          {
            id: team.id,
            name: team.name,
            people: new Set<string>(),
            hours: 0,
            amount: 0,
            legalAreas: new Map<string, number>(),
          },
        ]),
      );
      rows.set("unassigned", {
        id: "unassigned",
        name: "Bez týmu",
        people: new Set<string>(),
        hours: 0,
        amount: 0,
        legalAreas: new Map<string, number>(),
      });

      for (const log of logs) {
        const teamId = (log.userId && membershipByUser.get(log.userId)) || "unassigned";
        const row = rows.get(teamId) ?? rows.get("unassigned")!;
        if (log.userId) row.people.add(log.userId);
        const hours = Number(log.hours ?? 0);
        row.hours += hours;
        row.amount += Number(log.amountCzk ?? 0);
        const area = log.legalArea ?? "Bez právní oblasti";
        row.legalAreas.set(area, (row.legalAreas.get(area) ?? 0) + hours);
      }

      return {
        allowed: true,
        rows: [...rows.values()]
          .filter((row) => row.id !== "unassigned" || row.hours > 0)
          .map((row) => ({
            id: row.id,
            name: row.name,
            people: row.people.size,
            hours: row.hours,
            amount: row.amount,
            legalAreas: [...row.legalAreas.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([area, hours]) => `${area}: ${formatHours(hours)} h`)
              .join(" · "),
          })),
      };
    },
  );

  return (
    <>
      <PageHeader
        title="Reporting podle právních týmů"
        description="Výkon týmů podle období, hodin, částky a právních oblastí."
        action={<ButtonLink href="/reports" variant="secondary">Zpět na reporty</ButtonLink>}
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      {!result.data.allowed && result.databaseReady ? (
        <Section><EmptyState>Report je dostupný pouze vedení kanceláře.</EmptyState></Section>
      ) : (
        <>
          <Section title="Období">
            <form className="flex flex-wrap items-end gap-3">
              <Field label="Od">
                <TextInput name="dateFrom" type="date" defaultValue={dateFrom} />
              </Field>
              <Field label="Do">
                <TextInput name="dateTo" type="date" defaultValue={dateTo} />
              </Field>
              <Button type="submit" variant="secondary">Použít</Button>
            </form>
          </Section>
          <Section title="Právní týmy">
            {result.data.rows.length > 0 ? (
              <div className="table-scroll">
                <table className="w-max min-w-full">
                  <thead>
                    <tr>
                      <th>Tým</th>
                      <th>Aktivní lidé</th>
                      <th>Hodiny</th>
                      <th>Částka</th>
                      <th>Právní oblasti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="font-medium text-[#072924]">{row.name}</td>
                        <td>{row.people}</td>
                        <td>{formatHours(row.hours)}</td>
                        <td>{formatMoney(row.amount)}</td>
                        <td className="max-w-xl whitespace-normal">{row.legalAreas || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Ve zvoleném období nejsou žádné výkazy.</EmptyState>
            )}
          </Section>
        </>
      )}
    </>
  );
}
