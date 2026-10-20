import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { createSubject } from "@/app/actions/subjects";
import { ColumnVisibilityPanel } from "@/components/column-visibility-panel";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { RowClickNav } from "@/components/row-click-nav";
import { Section } from "@/components/section";
import { SubjectContactsEditor } from "@/components/subject-form/subject-contacts-editor";
import { SubjectFormFields } from "@/components/subject-form/subject-form-fields";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import {
  archiveFilterLabels,
  archivedWhere,
  archiveFilterValue,
} from "@/lib/archive-filter";
import { SubjectContactType } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDate, formatMoney } from "@/lib/format";
import { feeTypeLabels, options, subjectTypeLabels } from "@/lib/labels";
import {
  andWhere,
  canManageSubjects,
  canViewRates,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { contactHref } from "@/lib/subjects/contacts";
import { subjectSearchWhere } from "@/lib/subjects/search";
import { subjectFormErrorMessage } from "@/lib/subjects/subject-input";
import {
  getCurrentTableView,
  getDefaultTableView,
  restrictTableView,
} from "@/lib/table-view-preference-service";
import type { TableViewState } from "@/lib/table-view-preferences";

export const dynamic = "force-dynamic";

type SubjectsPageProps = {
  searchParams: Promise<{ q?: string; archive?: string; error?: string }>;
};

type SubjectRow = {
  id: string;
  name: string;
  type: keyof typeof subjectTypeLabels;
  ico: string | null;
  dic: string | null;
  email: string | null;
  contacts: Array<{ type: SubjectContactType; value: string; isPrimary: boolean }>;
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
  linkOptions: Array<{ id: string; name: string; ico: string | null }>;
  tableView: TableViewState;
  canManage: boolean;
  canViewRates: boolean;
};

export default async function SubjectsPage({ searchParams }: SubjectsPageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const archive = archiveFilterValue(params.archive);

  const result = await safeQuery<SubjectsPageData>(
    {
      subjects: [],
      linkOptions: [],
      tableView: getDefaultTableView("subjects"),
      canManage: false,
      canViewRates: false,
    },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const tableView = await getCurrentTableView("subjects");
      const canManage = canManageSubjects(currentUser);
      const [subjects, linkOptions] = await Promise.all([
        prisma.subject.findMany({
          where: andWhere(
            archivedWhere(archive),
            subjectVisibilityWhere(currentUser),
            subjectSearchWhere(query),
          ),
          // The birth number never leaves the detail / edit page.
          omit: { birthNumber: true },
          include: {
            contacts: {
              where: {
                type: { in: [SubjectContactType.EMAIL, SubjectContactType.PHONE] },
              },
              orderBy: { position: "asc" },
              select: { type: true, value: true, isPrimary: true },
            },
          },
          orderBy: { name: "asc" },
        }),
        // "Propojený subjekt" options of the new-subject form's statutory rows.
        canManage
          ? prisma.subject.findMany({
              where: { organizationId: currentUser.organizationId, archivedAt: null },
              orderBy: { name: "asc" },
              select: { id: true, name: true, ico: true },
              take: 1000,
            })
          : Promise.resolve([]),
      ]);

      return {
        subjects,
        linkOptions,
        tableView,
        canManage,
        canViewRates: canViewRates(currentUser),
      };
    },
  );
  const tableView = result.data.canViewRates
    ? result.data.tableView
    : restrictTableView(result.data.tableView, ["hourlyRate", "flatFee"]);
  const visibleColumnSet = new Set(tableView.visibleColumns);

  return (
    <>
      <PageHeader
        title="Subjekty"
        description="Jednotná evidence osob a organizací bez duplicitní klientské tabulky."
        action={result.data.canManage ? (
          <ButtonLink href="#new-subject">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nový subjekt
          </ButtonLink>
        ) : null}
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <Section>
        <form className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <Field label="Hledat" className="min-w-0 flex-1">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-stone-600"
                aria-hidden="true"
              />
              <TextInput
                name="q"
                defaultValue={query}
                placeholder="Název, jméno, IČO, e-mail nebo telefon"
                className="pl-9"
              />
            </div>
          </Field>
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
          {query || archive !== "active" ? (
            <ButtonLink href="/subjects" variant="ghost" className="md:self-end">
              Zrušit filtry
            </ButtonLink>
          ) : null}
        </form>
      </Section>
      <Section title="Seznam subjektů">
        <ColumnVisibilityPanel
          tableKey="subjects"
          columns={tableView.columns}
          visibleColumns={tableView.visibleColumns}
        />
        {result.data.subjects.length > 0 ? (
          <RowClickNav>
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  {tableView.columns
                    .filter((column) => visibleColumnSet.has(column.id))
                    .map((column) => (
                      <th key={column.id}>{column.label}</th>
                    ))}
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {result.data.subjects.map((subject) => (
                  <tr
                    key={subject.id}
                    data-href={`/subjects/${subject.id}`}
                    tabIndex={0}
                    aria-label={`Otevřít subjekt ${subject.name}`}
                    className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-900"
                  >
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
                    {visibleColumnSet.has("email") ? (
                      <td className="max-w-xs break-all">
                        <PrimaryContact
                          subject={subject}
                          type={SubjectContactType.EMAIL}
                        />
                      </td>
                    ) : null}
                    {visibleColumnSet.has("phone") ? (
                      <td className="whitespace-nowrap">
                        <PrimaryContact
                          subject={subject}
                          type={SubjectContactType.PHONE}
                        />
                      </td>
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
          </RowClickNav>
        ) : (
          <EmptyState>Žádné subjekty neodpovídají zadání.</EmptyState>
        )}
      </Section>
      {result.data.canManage ? (
        <Section title="Nový subjekt" className="scroll-mt-6" id="new-subject">
          {subjectFormErrorMessage(params.error) ? (
            <p
              role="alert"
              className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {subjectFormErrorMessage(params.error)}
            </p>
          ) : null}
          <form action={createSubject} className="grid gap-4">
            <SubjectFormFields
              linkOptions={result.data.linkOptions}
              contactsSlot={
                <SubjectContactsEditor
                  defaults={[
                    {
                      id: null,
                      type: SubjectContactType.EMAIL,
                      value: "",
                      label: null,
                      isPrimary: true,
                    },
                    {
                      id: null,
                      type: SubjectContactType.PHONE,
                      value: "",
                      label: null,
                      isPrimary: true,
                    },
                  ]}
                />
              }
            />
            <Field label="SharePoint URL">
              <TextInput name="sharepointUrl" type="url" />
            </Field>
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
              <Button type="submit" pendingLabel="Vytvářím…">Vytvořit subjekt</Button>
            </div>
          </form>
        </Section>
      ) : null}
    </>
  );
}

function PrimaryContact({
  subject,
  type,
}: {
  subject: Pick<SubjectRow, "contacts" | "email">;
  type: SubjectContactType;
}) {
  const rows = subject.contacts.filter((contact) => contact.type === type);
  const value =
    (rows.find((contact) => contact.isPrimary) ?? rows[0])?.value ??
    (type === SubjectContactType.EMAIL ? subject.email : null);
  if (!value) {
    return <>—</>;
  }
  const href = contactHref(type, value);
  return href ? (
    <a href={href} className="text-emerald-950 hover:underline">
      {value}
    </a>
  ) : (
    <>{value}</>
  );
}
