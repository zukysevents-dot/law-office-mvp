import Link from "next/link";

import { createDocument } from "@/app/actions/documents";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentKind } from "@/generated/prisma/enums";
import { documentKindLabels } from "@/lib/labels";
import { documentKindTone } from "@/lib/status-tones";

type DocumentRow = {
  id: string;
  kind: DocumentKind;
  name: string;
  storageUrl: string | null;
  currentVersion: { version: number } | null;
};

type TemplateOption = { id: string; name: string };

export function CaseDocumentsSection({
  caseId,
  documents,
  templates,
  canManage,
}: {
  caseId: string;
  documents: DocumentRow[];
  templates: TemplateOption[];
  canManage: boolean;
}) {
  return (
    <Section title="Dokumenty">
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
                  <td className="font-medium text-stone-950">
                    <Link
                      href={`/documents/${document.id}`}
                      className="text-[#072924] underline-offset-2 hover:underline"
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
                        className="text-[#072924] underline-offset-2 hover:underline"
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
        <EmptyState>Spis zatím nemá evidované dokumenty.</EmptyState>
      )}

      {canManage ? (
        <>
          {templates.length > 0 ? (
            <form
              action={`/documents/generate`}
              method="get"
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="caseId" value={caseId} />
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
            <input type="hidden" name="caseId" value={caseId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Název dokumentu">
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
              <Field label="Odkaz do SharePointu (http/https)">
                <TextInput name="storageUrl" type="url" required />
              </Field>
              <Field label="Poznámka k verzi (volitelné)">
                <TextInput name="note" />
              </Field>
            </div>
            <Field label="Popis (volitelné)">
              <TextArea name="description" />
            </Field>
            <div>
              <Button type="submit">Evidovat dokument</Button>
            </div>
          </form>
        </>
      ) : null}
      <p className="mt-2 text-xs text-stone-400">
        Soubory zůstávají v SharePointu kanceláře; zde evidujeme jen odkaz a
        metadata. Verzování probíhá přidáním nového odkazu na detailu dokumentu.
      </p>
    </Section>
  );
}
