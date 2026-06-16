import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDate } from "@/lib/format";
import { canViewAuditLog } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AuditLogData = {
  allowed: boolean;
  logs: Array<{
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    oldValue: unknown;
    newValue: unknown;
    createdAt: Date;
    changedBy: { name: string; email: string } | null;
  }>;
};

function auditDetail(value: unknown) {
  if (value === null || value === undefined) {
    return "—";
  }

  const text = JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

export default async function AuditLogPage() {
  const result = await safeQuery<AuditLogData>(
    { allowed: false, logs: [] },
    async () => {
      const currentUser = await getCurrentUser();

      if (!canViewAuditLog(currentUser)) {
        return { allowed: false, logs: [] };
      }

      const prisma = getPrisma();
      const logs = await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          changedBy: { select: { name: true, email: true } },
        },
      });

      return { allowed: true, logs };
    },
  );

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Poslední server-side auditní záznamy změn v právních datech."
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      {result.databaseReady && !result.data.allowed ? (
        <Section title="Přístup odepřen">
          <p className="text-sm text-stone-600">
            Nemáte oprávnění zobrazit audit log.
          </p>
        </Section>
      ) : null}
      {result.data.allowed ? (
        <Section title="Posledních 100 záznamů">
          {result.data.logs.length > 0 ? (
            <div className="table-scroll">
              <table className="w-max min-w-full">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Uživatel</th>
                    <th>Akce</th>
                    <th>Entita</th>
                    <th>ID entity</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDate(log.createdAt)}</td>
                      <td>
                        {log.changedBy
                          ? `${log.changedBy.name} (${log.changedBy.email})`
                          : "—"}
                      </td>
                      <td>{log.action}</td>
                      <td>{log.entityType}</td>
                      <td className="font-mono text-xs">{log.entityId}</td>
                      <td className="max-w-xl break-words font-mono text-xs">
                        {auditDetail(log.newValue ?? log.oldValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>Audit log zatím neobsahuje žádné záznamy.</EmptyState>
          )}
        </Section>
      ) : null}
    </>
  );
}
