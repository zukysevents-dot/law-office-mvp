import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  auditActionLabel,
  auditEntityTypeLabel,
  buildAuditWhere,
  readAuditFilters,
  type AuditFilters,
} from "@/lib/audit-filters";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDateTime } from "@/lib/format";
import { canViewAllLegalData } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { firstParam } from "@/lib/search-params";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

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
  total: number;
  users: Array<{ id: string; name: string }>;
};

type AuditLogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function auditDetail(value: unknown) {
  if (value === null || value === undefined) {
    return "—";
  }

  const text = JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

// Build a querystring of the currently active (non-empty) filters, optionally
// overriding the page, so links preserve the user's filtering.
function filterQuery(filters: AuditFilters, page?: number) {
  const params = new URLSearchParams();
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.action) params.set("action", filters.action);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (page && page > 1) params.set("page", String(page));
  return params.toString();
}

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const params = await searchParams;
  const filters = readAuditFilters((key) => firstParam(params, key));
  const page = Math.max(1, Number(firstParam(params, "page")) || 1);

  const result = await safeQuery<AuditLogData>(
    { allowed: false, logs: [], total: 0, users: [] },
    async () => {
      const currentUser = await getCurrentUser();

      if (!canViewAllLegalData(currentUser)) {
        return { allowed: false, logs: [], total: 0, users: [] };
      }

      const prisma = getPrisma();
      const where = buildAuditWhere(filters);
      const [logs, total, users] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: PAGE_SIZE,
          skip: (page - 1) * PAGE_SIZE,
          include: {
            changedBy: { select: { name: true, email: true } },
          },
        }),
        prisma.auditLog.count({ where }),
        prisma.user.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);

      return { allowed: true, logs, total, users };
    },
  );

  const { allowed, logs, total, users } = result.data;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(
    filters.entityType ||
      filters.action ||
      filters.userId ||
      filters.dateFrom ||
      filters.dateTo,
  );
  const exportQuery = filterQuery(filters);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Server-side auditní záznamy změn v právních datech s možností filtrování a exportu."
        action={
          allowed ? (
            <ButtonLink
              href={`/audit-log/export${exportQuery ? `?${exportQuery}` : ""}`}
              variant="secondary"
            >
              Exportovat (CSV)
            </ButtonLink>
          ) : undefined
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      {result.databaseReady && !allowed ? (
        <Section title="Přístup odepřen">
          <p className="text-sm text-stone-600">
            Nemáte oprávnění zobrazit audit log.
          </p>
        </Section>
      ) : null}
      {allowed ? (
        <>
          <Section title="Filtry">
            <form className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Entita">
                  <SelectInput name="entityType" defaultValue={filters.entityType}>
                    <option value="">Vše</option>
                    {AUDIT_ENTITY_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {auditEntityTypeLabel(value)}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Akce">
                  <SelectInput name="action" defaultValue={filters.action}>
                    <option value="">Vše</option>
                    {AUDIT_ACTIONS.map((value) => (
                      <option key={value} value={value}>
                        {auditActionLabel(value)}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Uživatel">
                  <SelectInput name="userId" defaultValue={filters.userId}>
                    <option value="">Vše</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Datum od">
                  <TextInput
                    name="dateFrom"
                    type="date"
                    defaultValue={filters.dateFrom}
                  />
                </Field>
                <Field label="Datum do">
                  <TextInput
                    name="dateTo"
                    type="date"
                    defaultValue={filters.dateTo}
                  />
                </Field>
              </div>
              <div>
                <Button type="submit" variant="secondary">
                  Filtrovat
                </Button>
              </div>
            </form>
          </Section>
          <Section title="Auditní záznamy">
            {logs.length > 0 ? (
              <>
                <div className="table-scroll">
                  <table className="w-max min-w-full">
                    <thead>
                      <tr>
                        <th>Datum a čas</th>
                        <th>Uživatel</th>
                        <th>Akce</th>
                        <th>Entita</th>
                        <th>ID entity</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td>{formatDateTime(log.createdAt)}</td>
                          <td>
                            {log.changedBy
                              ? `${log.changedBy.name} (${log.changedBy.email})`
                              : "—"}
                          </td>
                          <td>{auditActionLabel(log.action)}</td>
                          <td>{auditEntityTypeLabel(log.entityType)}</td>
                          <td className="font-mono text-xs">{log.entityId}</td>
                          <td className="max-w-xl break-words font-mono text-xs">
                            {auditDetail(log.newValue ?? log.oldValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-sm text-stone-600">
                  <span>
                    Strana {page} z {totalPages} · celkem {total} záznamů
                  </span>
                  <div className="flex gap-2">
                    {page > 1 ? (
                      <ButtonLink
                        href={`/audit-log${
                          filterQuery(filters, page - 1)
                            ? `?${filterQuery(filters, page - 1)}`
                            : ""
                        }`}
                        variant="ghost"
                      >
                        Předchozí
                      </ButtonLink>
                    ) : null}
                    {page < totalPages ? (
                      <ButtonLink
                        href={`/audit-log?${filterQuery(filters, page + 1)}`}
                        variant="ghost"
                      >
                        Další
                      </ButtonLink>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState>
                {hasFilters
                  ? "Žádné záznamy neodpovídají zvoleným filtrům."
                  : "Audit log zatím neobsahuje žádné záznamy."}
              </EmptyState>
            )}
          </Section>
        </>
      ) : null}
    </>
  );
}
