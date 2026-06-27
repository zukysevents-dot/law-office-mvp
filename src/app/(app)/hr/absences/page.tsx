import {
  approveAbsence,
  cancelAbsence,
  rejectAbsence,
  requestAbsence,
} from "@/app/actions/hr";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { HrAbsenceType, ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatDateUtc } from "@/lib/format";
import { hrAbsenceStatusLabels, hrAbsenceTypeLabels } from "@/lib/labels";
import {
  andWhere,
  canManageHr,
  hrAbsenceVisibilityWhere,
  hrEmployeeVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { LIST_QUERY_LIMIT } from "@/lib/query-limits";
import { hrAbsenceStatusTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

const requestInclude = {
  employee: { select: { firstName: true, lastName: true } },
} satisfies Prisma.HrAbsenceRequestInclude;

type RequestRow = Prisma.HrAbsenceRequestGetPayload<{
  include: typeof requestInclude;
}>;

type Data = {
  requests: RequestRow[];
  employees: Array<{ id: string; firstName: string; lastName: string }>;
  canManage: boolean;
};

const emptyData: Data = { requests: [], employees: [], canManage: false };

export default async function HrAbsencesPage() {
  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.HR_ATTENDANCE);
    const prisma = getPrisma();

    const [requests, employees] = await Promise.all([
      prisma.hrAbsenceRequest.findMany({
        where: hrAbsenceVisibilityWhere(currentUser),
        orderBy: { createdAt: "desc" },
        include: requestInclude,
        take: 200,
      }),
      prisma.hrEmployee.findMany({
        where: andWhere(
          { archivedAt: null },
          hrEmployeeVisibilityWhere(currentUser),
        ),
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
        take: LIST_QUERY_LIMIT,
      }),
    ]);

    return { requests, employees, canManage: canManageHr(currentUser) };
  });

  const data = result.data ?? emptyData;

  return (
    <>
      <PageHeader
        title="Absence"
        description="Žádosti o dovolenou a další absence, schvalování a saldo."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {data.employees.length > 0 ? (
        <Section title="Nová žádost o absenci">
          <form action={requestAbsence} className="grid gap-4 sm:max-w-2xl">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Zaměstnanec">
                <SelectInput name="employeeId" required>
                  {data.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.lastName} {employee.firstName}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Typ">
                <SelectInput name="type" defaultValue={HrAbsenceType.VACATION}>
                  {Object.values(HrAbsenceType).map((type) => (
                    <option key={type} value={type}>
                      {hrAbsenceTypeLabels[type]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Od">
                <TextInput name="startDate" type="date" required />
              </Field>
              <Field label="Do">
                <TextInput name="endDate" type="date" required />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-[#072924]">
              <input
                type="checkbox"
                name="halfDay"
                className="h-4 w-4 rounded border-[#cfe0d7] text-[#072924] focus:ring-[#B9DCC6]"
              />
              <span>Půldenní (jen pro jeden den)</span>
            </label>
            <Field label="Poznámka (volitelné)">
              <TextArea name="note" />
            </Field>
            <div>
              <Button type="submit">Podat žádost</Button>
            </div>
          </form>
          <p className="mt-2 text-xs text-stone-400">
            Hodiny dovolené se počítají z pracovních dnů a fondu zaměstnance; saldo
            se odečte až po schválení.
          </p>
        </Section>
      ) : null}

      <Section title="Žádosti">
        {data.requests.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Zaměstnanec</th>
                  <th>Typ</th>
                  <th>Období</th>
                  <th>Hodiny</th>
                  <th>Stav</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {data.requests.map((request) => {
                  const isPending = request.status === "PENDING";
                  const isApproved = request.status === "APPROVED";
                  return (
                    <tr key={request.id}>
                      <td className="font-medium text-stone-950">
                        {request.employee.lastName} {request.employee.firstName}
                      </td>
                      <td>{hrAbsenceTypeLabels[request.type]}</td>
                      <td>
                        {formatDateUtc(request.startDate)} –{" "}
                        {formatDateUtc(request.endDate)}
                        {request.halfDay ? " (½)" : ""}
                      </td>
                      <td>{Number(request.requestedHours)} h</td>
                      <td>
                        <Badge tone={hrAbsenceStatusTone(request.status)}>
                          {hrAbsenceStatusLabels[request.status]}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {data.canManage && isPending ? (
                            <>
                              <form action={approveAbsence}>
                                <input type="hidden" name="requestId" value={request.id} />
                                <Button type="submit" variant="secondary">
                                  Schválit
                                </Button>
                              </form>
                              <form action={rejectAbsence}>
                                <input type="hidden" name="requestId" value={request.id} />
                                <Button type="submit" variant="ghost">
                                  Zamítnout
                                </Button>
                              </form>
                            </>
                          ) : null}
                          {isPending || (isApproved && data.canManage) ? (
                            <form action={cancelAbsence}>
                              <input type="hidden" name="requestId" value={request.id} />
                              <Button type="submit" variant="ghost">
                                Zrušit
                              </Button>
                            </form>
                          ) : null}
                          {!isPending && !(isApproved && data.canManage) ? "—" : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Zatím nejsou žádné žádosti o absenci.</EmptyState>
        )}
      </Section>
    </>
  );
}
