import {
  archiveDocumentTemplate,
  createDocumentTemplate,
  updateDocumentTemplate,
} from "@/app/actions/documents";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { DocumentTemplate } from "@/generated/prisma/client";
import { DocumentKind, ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { SUPPORTED_PLACEHOLDERS } from "@/lib/documents/templates";
import { documentKindLabels } from "@/lib/labels";
import {
  andWhere,
  canManageDocumentTemplates,
  documentTemplateVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { documentKindTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

type Data = { templates: DocumentTemplate[]; canManage: boolean };

const emptyData: Data = { templates: [], canManage: false };

export default async function DocumentTemplatesPage() {
  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);

    const templates = await getPrisma().documentTemplate.findMany({
      where: andWhere(
        { archivedAt: null },
        documentTemplateVisibilityWhere(currentUser),
      ),
      orderBy: { name: "asc" },
      take: 500,
    });

    return { templates, canManage: canManageDocumentTemplates(currentUser) };
  });

  const data = result.data ?? emptyData;

  return (
    <>
      <PageHeader
        title="Šablony dokumentů"
        description="Kancelářské šablony s placeholdery pro generování dokumentů."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      <Section title="Šablony">
        {data.templates.length > 0 ? (
          <div className="grid gap-3">
            {data.templates.map((template) => (
              <details
                key={template.id}
                className="rounded-md border border-[#d4e2dc] px-3 py-2"
              >
                <summary className="flex cursor-pointer items-center gap-3 text-sm font-medium text-stone-900">
                  <Badge tone={documentKindTone(template.kind)}>
                    {documentKindLabels[template.kind]}
                  </Badge>
                  {template.name}
                  {!template.active ? (
                    <span className="text-xs text-stone-400">(neaktivní)</span>
                  ) : null}
                </summary>
                {data.canManage ? (
                  <div className="mt-3 grid gap-3">
                    <form
                      action={updateDocumentTemplate}
                      className="grid gap-3 sm:max-w-2xl"
                    >
                      <input type="hidden" name="templateId" value={template.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Název">
                          <TextInput name="name" defaultValue={template.name} required />
                        </Field>
                        <Field label="Typ">
                          <SelectInput name="kind" defaultValue={template.kind}>
                            {Object.values(DocumentKind).map((kind) => (
                              <option key={kind} value={kind}>
                                {documentKindLabels[kind]}
                              </option>
                            ))}
                          </SelectInput>
                        </Field>
                      </div>
                      <Field label="Popis (volitelné)">
                        <TextInput
                          name="description"
                          defaultValue={template.description ?? ""}
                        />
                      </Field>
                      <Field label="Tělo šablony">
                        <TextArea
                          name="bodyTemplate"
                          defaultValue={template.bodyTemplate}
                          rows={8}
                        />
                      </Field>
                      <label className="flex items-center gap-2 text-sm font-medium text-[#072924]">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={template.active}
                          className="h-4 w-4 rounded border-[#cfe0d7] text-[#072924] focus:ring-[#B9DCC6]"
                        />
                        <span>Aktivní</span>
                      </label>
                      <div>
                        <Button type="submit">Uložit šablonu</Button>
                      </div>
                    </form>
                    <form action={archiveDocumentTemplate}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <Button type="submit" variant="ghost">
                        Archivovat šablonu
                      </Button>
                    </form>
                  </div>
                ) : (
                  <pre className="mt-3 whitespace-pre-wrap text-sm text-stone-600">
                    {template.bodyTemplate}
                  </pre>
                )}
              </details>
            ))}
          </div>
        ) : (
          <EmptyState>Zatím nejsou žádné šablony.</EmptyState>
        )}
      </Section>

      {data.canManage ? (
        <Section title="Nová šablona">
          <form action={createDocumentTemplate} className="grid gap-4 sm:max-w-2xl">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Název">
                <TextInput name="name" required />
              </Field>
              <Field label="Typ">
                <SelectInput name="kind" defaultValue={DocumentKind.OTHER}>
                  {Object.values(DocumentKind).map((kind) => (
                    <option key={kind} value={kind}>
                      {documentKindLabels[kind]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <Field label="Popis (volitelné)">
              <TextInput name="description" />
            </Field>
            <Field label="Tělo šablony (placeholdery v {{…}})">
              <TextArea
                name="bodyTemplate"
                rows={8}
                placeholder={"V Praze dne {{today}}\n\nVěc: {{case.name}} ({{case.fileNumber}})\nKlient: {{client.name}}"}
                required
              />
            </Field>
            <div>
              <Button type="submit">Vytvořit šablonu</Button>
            </div>
          </form>
          <div className="mt-4 text-xs text-stone-500">
            <p className="font-medium">Dostupné placeholdery:</p>
            <ul className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {SUPPORTED_PLACEHOLDERS.map((placeholder) => (
                <li key={placeholder.key}>
                  <code className="text-[#072924]">{`{{${placeholder.key}}}`}</code>{" "}
                  — {placeholder.label}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      ) : null}
    </>
  );
}
