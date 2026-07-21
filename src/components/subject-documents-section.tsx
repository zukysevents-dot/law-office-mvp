import Link from "next/link";

import { createDocument } from "@/app/actions/documents";
import { DocumentStorageFields } from "@/components/document-storage-fields";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentKind } from "@/generated/prisma/enums";
import { documentKindLabels } from "@/lib/labels";
import { documentKindTone } from "@/lib/status-tones";

type SubjectDocument = {
  id: string;
  kind: DocumentKind;
  name: string;
  storageUrl: string | null;
  currentVersion: { version: number } | null;
};

export function SubjectDocumentsSection({
  subjectId,
  documents,
  templates,
  canManage,
}: {
  subjectId: string;
  documents: SubjectDocument[];
  templates: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  return (
    <Section title="Smlouvy, plné moci a dokumenty subjektu">
      {documents.length > 0 ? (
        <div className="table-scroll">
          <table className="w-max min-w-full">
            <thead>
              <tr>
                <th>Název</th>
                <th>Typ</th>
                <th>Verze</th>
                <th>Odkaz</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>
                    <Link
                      href={`/documents/${document.id}`}
                      className="font-medium text-[#072924] hover:underline"
                    >
                      {document.name}
                    </Link>
                  </td>
                  <td>
                    <Badge tone={documentKindTone(document.kind)}>
                      {documentKindLabels[document.kind]}
                    </Badge>
                  </td>
                  <td>v{document.currentVersion?.version ?? 1}</td>
                  <td>
                    {document.storageUrl ? (
                      <a
                        href={document.storageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#072924] hover:underline"
                      >
                        Otevřít
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>Subjekt zatím nemá evidované dokumenty.</EmptyState>
      )}

      {canManage ? (
        <>
          {templates.length > 0 ? (
            <form
              action="/documents/generate"
              method="get"
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="subjectId" value={subjectId} />
              <Field label="Generovat ze šablony">
                <SelectInput name="templateId" defaultValue={templates[0].id}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Button type="submit" variant="secondary">
                Generovat
              </Button>
            </form>
          ) : null}
          <form action={createDocument} className="mt-4 grid gap-4 sm:max-w-2xl">
            <input type="hidden" name="subjectId" value={subjectId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Název dokumentu">
                <TextInput name="name" required />
              </Field>
              <Field label="Typ">
                <SelectInput name="kind" defaultValue={DocumentKind.CONTRACT}>
                  {Object.values(DocumentKind).map((kind) => (
                    <option key={kind} value={kind}>
                      {documentKindLabels[kind]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <DocumentStorageFields />
              <Field label="Poznámka k verzi">
                <TextInput name="note" />
              </Field>
            </div>
            <Field label="Popis">
              <TextArea name="description" />
            </Field>
            <div>
              <Button type="submit">Evidovat dokument</Button>
            </div>
          </form>
        </>
      ) : null}
    </Section>
  );
}
