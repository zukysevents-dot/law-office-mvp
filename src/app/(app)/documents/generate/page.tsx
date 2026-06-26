import { notFound } from "next/navigation";

import { createDocument } from "@/app/actions/documents";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { DocumentKind, ModuleKey, SubjectRole } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import {
  buildTemplateContext,
  renderTemplate,
} from "@/lib/documents/templates";
import { assertModuleEnabled } from "@/lib/entitlements";
import { documentKindLabels } from "@/lib/labels";
import {
  andWhere,
  assertCanManageDocuments,
  caseVisibilityWhere,
  documentTemplateVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Data = {
  caseId: string;
  caseName: string;
  templateId: string;
  templateName: string;
  templateKind: DocumentKind;
  generated: string;
};

export default async function GenerateDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ caseId?: string; templateId?: string }>;
}) {
  const { caseId, templateId } = await searchParams;

  const result = await safeQuery<Data | null>(null, async () => {
    if (!caseId || !templateId) {
      return null;
    }
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);
    assertCanManageDocuments(currentUser);

    const prisma = getPrisma();
    const [legalCase, template, organization] = await Promise.all([
      prisma.case.findFirst({
        where: andWhere({ id: caseId }, caseVisibilityWhere(currentUser)),
        select: {
          id: true,
          name: true,
          fileNumber: true,
          responsibleUser: { select: { name: true } },
          project: {
            select: {
              name: true,
              mainSubject: {
                select: { name: true, ico: true, dic: true, address: true },
              },
            },
          },
          subjectRelations: {
            where: { role: SubjectRole.COUNTERPARTY },
            take: 1,
            select: { subject: { select: { name: true, ico: true } } },
          },
        },
      }),
      prisma.documentTemplate.findFirst({
        where: andWhere(
          { id: templateId },
          documentTemplateVisibilityWhere(currentUser),
        ),
        select: { id: true, name: true, kind: true, bodyTemplate: true },
      }),
      prisma.organization.findUnique({
        where: { id: currentUser.organizationId ?? "" },
        select: { name: true },
      }),
    ]);

    if (!legalCase || !template) {
      return null;
    }

    // Accepted invariant: access is gated on caseVisibilityWhere, and whoever
    // works a case legitimately needs that case's client and counterparty details
    // (name/IČO/DIČ/address) to draft documents. We therefore surface them from
    // the case context without an additional per-subject visibility check — the
    // case is org-scoped, so this is not a cross-org leak.
    const counterparty = legalCase.subjectRelations[0]?.subject ?? null;
    const context = buildTemplateContext({
      caseName: legalCase.name,
      fileNumber: legalCase.fileNumber,
      projectName: legalCase.project?.name ?? null,
      client: legalCase.project?.mainSubject ?? null,
      counterparty,
      lawyerName: legalCase.responsibleUser?.name ?? null,
      orgName: organization?.name ?? "",
      today: new Date(),
    });

    return {
      caseId: legalCase.id,
      caseName: legalCase.name,
      templateId: template.id,
      templateName: template.name,
      templateKind: template.kind,
      generated: renderTemplate(template.bodyTemplate, context),
    };
  });

  if (result.databaseReady && !result.data) {
    notFound();
  }

  const data = result.data;

  return (
    <>
      <PageHeader
        title="Generování dokumentu"
        description="Text vygenerovaný ze šablony s předvyplněnými údaji spisu."
        action={
          data ? (
            <ButtonLink href={`/cases/${data.caseId}`} variant="secondary">
              Zpět na spis
            </ButtonLink>
          ) : null
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {data ? (
        <>
          <Section title={`Náhled — ${data.templateName}`}>
            <TextArea
              readOnly
              rows={16}
              defaultValue={data.generated}
              className="font-mono text-xs"
            />
            <p className="mt-2 text-xs text-stone-400">
              Text zkopírujte do dokumentu, uložte do SharePointu a níže
              zaevidujte odkaz. Systém negeneruje binární soubor.
            </p>
          </Section>

          <Section title="Zaevidovat vygenerovaný dokument">
            <form action={createDocument} className="grid gap-4 sm:max-w-2xl">
              <input type="hidden" name="caseId" value={data.caseId} />
              <input type="hidden" name="sourceTemplateId" value={data.templateId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Název dokumentu">
                  <TextInput
                    name="name"
                    defaultValue={`${data.templateName} — ${data.caseName}`}
                    required
                  />
                </Field>
                <Field label="Typ">
                  <SelectInput name="kind" defaultValue={data.templateKind}>
                    {Object.values(DocumentKind).map((kind) => (
                      <option key={kind} value={kind}>
                        {documentKindLabels[kind]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
              <Field label="Odkaz do SharePointu (http/https)">
                <TextInput name="storageUrl" type="url" required />
              </Field>
              <Field label="Poznámka k verzi (volitelné)">
                <TextInput name="note" />
              </Field>
              <div>
                <Button type="submit">Zaevidovat dokument</Button>
              </div>
            </form>
          </Section>
        </>
      ) : null}
    </>
  );
}
