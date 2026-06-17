import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { createSubject } from "@/app/actions/subjects";
import { ColumnVisibilityPanel } from "@/components/column-visibility-panel";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import {
  archiveFilterLabels,
  archivedWhere,
  archiveFilterValue,
} from "@/lib/archive-filter";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDate, formatMoney } from "@/lib/format";
import { feeTypeLabels, options, subjectTypeLabels } from "@/lib/labels";
import { andWhere, subjectVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  getCurrentTableView,
  getDefaultTableView,
} from "@/lib/table-view-preference-service";
import type { TableViewState } from "@/lib/table-view-preferences";

export const dynamic = "force-dynamic";

type SubjectsPageProps = {
  searchParams: Promise<{ q?: string; archive?: string }>;
};

type SubjectRow = {
  id: string;
  name: string;
  type: keyof typeof subjectTypeLabels;
  ico: string | null;
  dic: string | null;
  address: string | null;
  legalForm: string | null;
  statutoryBody: string | null;
  status: string;
  insolvencyStatus: string | null;
  riskFlag: boolean;
  feeType: keyof typeof feeTypeLabels | null;
  hourlyRate: unknown;
  flatFee: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type SubjectsPageData = {
  subjects: SubjectRow[];
  tableView: TableViewState;
};

export default async function SubjectsPage({ searchParams }: SubjectsPageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const archive = archiveFilterValue(params.archive);

  const result = await safeQuery<SubjectsPageData>(
    { subjects: [], tableView: getDefaultTableView("subjects") },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const tableView = await getCurrentTableView("subjects");
      const subjects = await prisma.subject.findMany({
        where: andWhere(
          archivedWhere(archive),
          subjectVisibilityWhere(currentUser),
          {
            ...(query
              ? {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { ico: { contains: query, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
        ),
        orderBy: { name: "asc" },
      });

      return { subjects, tableView };
    },
  );
  const visibleColumnSet = new Set(result.data.tableView.visibleColumns);

  return (
    <>
      <PageHeader
        title="Subjekty"
        description="Jednotná evidence osob a organizací bez duplicitní klientské tabulky."
        action={
          <ButtonLink href="#new-subject">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nový subjekt
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <Section>
        <form className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="relative flex-1 md:self-end">
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-stone-400"
              aria-hidden="true"
            />
            <TextInput
              name="q"
              defaultValue={query}
              placeholder="Název nebo IČO"
              className="pl-9"
            />
          </div>
          <Field label="Archiv">
            <SelectInput name="archive" defaultValue={archive}>
              {Object.entries(archiveFilterLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Button type="submit" variant="secondary" className="md:self-end">
            Hledat
          </Button>
        </form>
      </Section>
      <Section title="Seznam subjektů">
        <ColumnVisibilityPanel
          tableKey="subjects"
          columns={result.data.tableView.columns}
          visibleColumns={result.data.tableView.visibleColumns}
        />
        {result.data.subjects.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  {result.data.tableView.columns
                    .filter((column) => visibleColumnSet.has(column.id))
                    .map((column) => (
                      <th key={column.id}>{column.label}</th>
                    ))}
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {result.data.subjects.map((subject) => (
                  <tr key={subject.id}>
                    {visibleColumnSet.has("name") ? (
                      <td className="max-w-xs">
                        <Link
                          href={`/subjects/${subject.id}`}
                          className="font-medium text-emerald-950 hover:underline"
                        >
                          {subject.name}
                        </Link>
                      </td>
                    ) : null}
                    {visibleColumnSet.has("type") ? (
                      <td>{subjectTypeLabels[subject.type]}</td>
                    ) : null}
                    {visibleColumnSet.has("ico") ? (
                      <td className="font-mono text-sm">{subject.ico ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("dic") ? (
                      <td className="font-mono text-sm">{subject.dic ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("address") ? (
                      <td className="max-w-sm">{subject.address ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("legalForm") ? (
                      <td>{subject.legalForm ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("statutoryBody") ? (
                      <td className="max-w-sm">{subject.statutoryBody ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("status") ? (
                      <td>{subject.status}</td>
                    ) : null}
                    {visibleColumnSet.has("insolvencyStatus") ? (
                      <td>{subject.insolvencyStatus ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("riskFlag") ? (
                      <td>
                        {subject.riskFlag ? (
                          <Badge tone="red">Riziko</Badge>
                        ) : (
                          <Badge tone="green">Bez rizika</Badge>
                        )}
                      </td>
                    ) : null}
                    {visibleColumnSet.has("feeType") ? (
                      <td>
                        {subject.feeType ? feeTypeLabels[subject.feeType] : "—"}
                      </td>
                    ) : null}
                    {visibleColumnSet.has("hourlyRate") ? (
                      <td>{formatMoney(subject.hourlyRate as never)}</td>
                    ) : null}
                    {visibleColumnSet.has("flatFee") ? (
                      <td>{formatMoney(subject.flatFee as never)}</td>
                    ) : null}
                    {visibleColumnSet.has("createdAt") ? (
                      <td>{formatDate(subject.createdAt)}</td>
                    ) : null}
                    {visibleColumnSet.has("updatedAt") ? (
                      <td>{formatDate(subject.updatedAt)}</td>
                    ) : null}
                    <td>
                      <ButtonLink
                        href={`/subjects/${subject.id}`}
                        variant="ghost"
                        className="h-8 px-3"
                      >
                        Detail
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Žádné subjekty neodpovídají zadání.</EmptyState>
        )}
      </Section>
      <Section title="Nový subjekt" className="scroll-mt-6" id="new-subject">
        <form action={createSubject} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Typ">
              <SelectInput name="type" defaultValue="COMPANY">
                {options.subjectTypes.map((type) => (
                  <option key={type} value={type}>
                    {subjectTypeLabels[type]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Název" className="md:col-span-2">
              <TextInput name="name" required />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="IČO">
              <TextInput name="ico" />
            </Field>
            <Field label="DIČ">
              <TextInput name="dic" />
            </Field>
            <Field label="Právní forma">
              <TextInput name="legalForm" />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Adresa">
              <TextInput name="address" />
            </Field>
            <Field label="Statutární orgán">
              <TextInput name="statutoryBody" />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Stav">
              <TextInput name="status" defaultValue="ACTIVE" />
            </Field>
            <Field label="Insolvenční stav">
              <TextInput name="insolvencyStatus" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
            <input
              type="checkbox"
              name="riskFlag"
              className="h-4 w-4 rounded border-stone-300 text-emerald-950"
            />
            Rizikový subjekt
          </label>
          <Field label="Interní poznámka">
            <TextArea name="internalNote" />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="URL smlouvy o poskytování právních služeb">
              <TextInput name="legalServicesContractUrl" type="url" />
            </Field>
            <Field label="Typ odměny">
              <SelectInput name="feeType" defaultValue="HOURLY">
                {options.feeTypes.map((feeType) => (
                  <option key={feeType} value={feeType}>
                    {feeTypeLabels[feeType]}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Hodinová sazba">
              <TextInput name="hourlyRate" type="number" min="0" step="0.01" />
            </Field>
            <Field label="Paušální odměna">
              <TextInput name="flatFee" type="number" min="0" step="0.01" />
            </Field>
          </div>
          <Field label="Poznámka k odměně">
            <TextArea name="feeNote" />
          </Field>
          <div>
            <Button type="submit">Vytvořit subjekt</Button>
          </div>
        </form>
      </Section>
    </>
  );
}
