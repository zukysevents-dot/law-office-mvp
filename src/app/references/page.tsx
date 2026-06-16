import Link from "next/link";
import { Plus, Search } from "lucide-react";

import {
  archiveReference,
  restoreReference,
} from "@/app/actions/references";
import { ArchiveActionForm } from "@/components/archive-action-form";
import { ColumnVisibilityPanel } from "@/components/column-visibility-panel";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { ReferenceForm } from "@/components/reference-form";
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
import { safeQuery } from "@/lib/db-safe";
import { formatDate, formatMoney } from "@/lib/format";
import { legalAreaOptions } from "@/lib/labels";
import { getPrisma } from "@/lib/prisma";
import {
  getCurrentTableView,
  getDefaultTableView,
} from "@/lib/table-view-preference-service";
import type { TableViewState } from "@/lib/table-view-preferences";

export const dynamic = "force-dynamic";

type ReferencesProps = {
  searchParams: Promise<{
    q?: string;
    legalArea?: string;
    minValue?: string;
    maxValue?: string;
    period?: string;
    archive?: string;
  }>;
};

type ReferenceRow = {
  id: string;
  title: string;
  legalArea: string | null;
  valueCzk: unknown;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  project: { id: string; name: string } | null;
  case: { id: string; name: string; fileNumber: string | null } | null;
  subject: { id: string; name: string } | null;
};

type ReferencesData = {
  references: ReferenceRow[];
  projects: Array<{ id: string; name: string }>;
  cases: Array<{ id: string; name: string; project: { name: string } }>;
  subjects: Array<{ id: string; name: string; ico: string | null }>;
  tableView: TableViewState;
};

function numberParam(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function referenceStatus(reference: ReferenceRow): {
  label: string;
  tone: "amber" | "green" | "neutral";
} {
  if (reference.archivedAt) {
    return { label: "Archivovaná", tone: "amber" };
  }

  if (reference.endDate) {
    return { label: "Ukončená", tone: "neutral" };
  }

  return { label: "Probíhající", tone: "green" };
}

export default async function ReferencesPage({ searchParams }: ReferencesProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const legalArea = params.legalArea ?? "";
  const minValue = numberParam(params.minValue);
  const maxValue = numberParam(params.maxValue);
  const period = params.period ?? "";
  const archive = archiveFilterValue(params.archive);

  const result = await safeQuery<ReferencesData>(
    {
      references: [],
      projects: [],
      cases: [],
      subjects: [],
      tableView: getDefaultTableView("references"),
    },
    async () => {
      const prisma = getPrisma();
      const tableView = await getCurrentTableView("references");
      const [references, projects, cases, subjects] = await Promise.all([
        prisma.reference.findMany({
          where: {
            ...archivedWhere(archive),
            ...(query
              ? {
                  OR: [
                    { title: { contains: query, mode: "insensitive" } },
                    { description: { contains: query, mode: "insensitive" } },
                    { legalArea: { contains: query, mode: "insensitive" } },
                    {
                      project: {
                        is: {
                          name: { contains: query, mode: "insensitive" },
                        },
                      },
                    },
                    {
                      case: {
                        is: {
                          name: { contains: query, mode: "insensitive" },
                        },
                      },
                    },
                    {
                      subject: {
                        is: {
                          name: { contains: query, mode: "insensitive" },
                        },
                      },
                    },
                  ],
                }
              : {}),
            ...(legalArea ? { legalArea } : {}),
            ...(minValue !== null || maxValue !== null
              ? {
                  valueCzk: {
                    ...(minValue !== null ? { gte: minValue } : {}),
                    ...(maxValue !== null ? { lte: maxValue } : {}),
                  },
                }
              : {}),
            ...(period === "ongoing" ? { endDate: null } : {}),
            ...(period === "finished" ? { endDate: { not: null } } : {}),
          },
          orderBy: [{ endDate: "asc" }, { startDate: "desc" }],
          include: {
            project: { select: { id: true, name: true } },
            case: { select: { id: true, name: true, fileNumber: true } },
            subject: { select: { id: true, name: true } },
          },
        }),
        prisma.project.findMany({
          where: { archivedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.case.findMany({
          where: { archivedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, project: { select: { name: true } } },
        }),
        prisma.subject.findMany({
          where: { archivedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, ico: true },
        }),
      ]);

      return { references, projects, cases, subjects, tableView };
    },
  );
  const visibleColumnSet = new Set(result.data.tableView.visibleColumns);

  return (
    <>
      <PageHeader
        title="Reference"
        description="Vyhledávání referencí podle právního odvětví, hodnoty a období pro veřejné zakázky i obchodní nabídky."
        action={
          <ButtonLink href="#new-reference">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nová reference
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <Section>
        <form className="grid gap-3 lg:grid-cols-[1.2fr_1fr_0.7fr_0.7fr_0.8fr_0.8fr_auto]">
          <Field label="Vyhledávání">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-stone-400"
                aria-hidden="true"
              />
              <TextInput
                name="q"
                defaultValue={query}
                className="pl-9"
                placeholder="Název, popis, projekt, subjekt"
              />
            </div>
          </Field>
          <Field label="Právní odvětví">
            <SelectInput name="legalArea" defaultValue={legalArea}>
              <option value="">Všechna odvětví</option>
              {legalAreaOptions.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Min. Kč">
            <TextInput name="minValue" defaultValue={params.minValue ?? ""} />
          </Field>
          <Field label="Max. Kč">
            <TextInput name="maxValue" defaultValue={params.maxValue ?? ""} />
          </Field>
          <Field label="Období">
            <SelectInput name="period" defaultValue={period}>
              <option value="">Vše</option>
              <option value="ongoing">Probíhající</option>
              <option value="finished">Ukončené</option>
            </SelectInput>
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
          <Button type="submit" variant="secondary" className="self-end">
            Filtrovat
          </Button>
        </form>
      </Section>
      <Section title="Seznam referencí">
        <ColumnVisibilityPanel
          tableKey="references"
          columns={result.data.tableView.columns}
          visibleColumns={result.data.tableView.visibleColumns}
        />
        {result.data.references.length > 0 ? (
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
                {result.data.references.map((reference) => {
                  const status = referenceStatus(reference);

                  return (
                    <tr key={reference.id}>
                      {visibleColumnSet.has("title") ? (
                        <td className="max-w-xs font-medium text-stone-950">
                          {reference.title}
                        </td>
                      ) : null}
                      {visibleColumnSet.has("subject") ? (
                        <td>
                          {reference.subject ? (
                            <Link
                              href={`/subjects/${reference.subject.id}`}
                              className="text-emerald-950 hover:underline"
                            >
                              {reference.subject.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      ) : null}
                      {visibleColumnSet.has("project") ? (
                        <td>
                          {reference.project ? (
                            <Link
                              href={`/projects/${reference.project.id}`}
                              className="text-emerald-950 hover:underline"
                            >
                              {reference.project.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      ) : null}
                      {visibleColumnSet.has("case") ? (
                        <td>
                          {reference.case ? (
                            <Link
                              href={`/cases/${reference.case.id}`}
                              className="text-emerald-950 hover:underline"
                            >
                              {reference.case.name}
                              {reference.case.fileNumber
                                ? `, ${reference.case.fileNumber}`
                                : ""}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      ) : null}
                      {visibleColumnSet.has("legalArea") ? (
                        <td>{reference.legalArea ?? "—"}</td>
                      ) : null}
                      {visibleColumnSet.has("valueCzk") ? (
                        <td>{formatMoney(reference.valueCzk as never)}</td>
                      ) : null}
                      {visibleColumnSet.has("startDate") ? (
                        <td>{formatDate(reference.startDate)}</td>
                      ) : null}
                      {visibleColumnSet.has("endDate") ? (
                        <td>{reference.endDate ? formatDate(reference.endDate) : "—"}</td>
                      ) : null}
                      {visibleColumnSet.has("status") ? (
                        <td>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>
                      ) : null}
                      {visibleColumnSet.has("description") ? (
                        <td className="max-w-md">{reference.description ?? "—"}</td>
                      ) : null}
                      {visibleColumnSet.has("createdAt") ? (
                        <td>{formatDate(reference.createdAt)}</td>
                      ) : null}
                      {visibleColumnSet.has("updatedAt") ? (
                        <td>{formatDate(reference.updatedAt)}</td>
                      ) : null}
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <ButtonLink
                            href={`/references/${reference.id}/edit`}
                            variant="ghost"
                            className="h-8 px-3"
                          >
                            Upravit
                          </ButtonLink>
                          <ArchiveActionForm
                            action={
                              reference.archivedAt
                                ? restoreReference
                                : archiveReference
                            }
                            id={reference.id}
                            mode={reference.archivedAt ? "restore" : "archive"}
                            buttonClassName="h-8 px-3"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Žádné reference neodpovídají filtrům.</EmptyState>
        )}
      </Section>
      <Section title="Nová reference" id="new-reference" className="scroll-mt-6">
        <ReferenceForm
          returnTo="/references"
          projects={result.data.projects}
          cases={result.data.cases}
          subjects={result.data.subjects}
        />
      </Section>
    </>
  );
}
