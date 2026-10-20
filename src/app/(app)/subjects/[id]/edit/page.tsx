import { notFound } from "next/navigation";

import { updateSubject } from "@/app/actions/subjects";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import {
  SubjectContactsEditor,
  type ContactDefault,
} from "@/components/subject-form/subject-contacts-editor";
import { SubjectFormFields } from "@/components/subject-form/subject-form-fields";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { SubjectContactType, SubjectType } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { numberInputValue } from "@/lib/form-values";
import { feeTypeLabels, options } from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import { canEditRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { mergeLegacyEmail } from "@/lib/subjects/contacts";
import { personPartOfTradeName, splitPersonName } from "@/lib/subjects/person-name";
import { mergeLegacyStatutory } from "@/lib/subjects/statutory";
import { subjectFormErrorMessage } from "@/lib/subjects/subject-input";

export const dynamic = "force-dynamic";

type SubjectEditProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const day = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

async function loadSubject(id: string) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const subject = await prisma.subject.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { position: "asc" } },
      statutoryBodies: { orderBy: { position: "asc" } },
    },
  });

  if (!subject || !canEditRecord(currentUser, "Subject", subject)) {
    return null;
  }

  // Candidates for "Propojený subjekt" of a statutory body: active subjects of
  // the same office, never the subject itself.
  const linkOptions = await prisma.subject.findMany({
    where: {
      organizationId: subject.organizationId,
      archivedAt: null,
      id: { not: subject.id },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, ico: true },
    take: 1000,
  });

  return { subject, linkOptions };
}

export default async function SubjectEditPage({
  params,
  searchParams,
}: SubjectEditProps) {
  const { id } = await params;
  const { error } = await searchParams;
  const result = await safeQuery(null, () => loadSubject(id));

  if (result.databaseReady && !result.data) {
    notFound();
  }

  const subject = result.data?.subject ?? null;
  const linkOptions = result.data?.linkOptions ?? [];
  const errorMessage = subjectFormErrorMessage(error);

  // Older persons have only the free-text name: pre-fill the parts once.
  const isNatural =
    subject?.type === SubjectType.PERSON || subject?.type === SubjectType.ENTREPRENEUR;
  const needsSplit = Boolean(
    subject && isNatural && !subject.firstName && !subject.lastName,
  );
  const split = needsSplit
    ? splitPersonName(personPartOfTradeName(subject?.tradeName || subject?.name || ""))
    : null;
  // A legacy sole trader's free-text name may be a trade name ("Petr Dvořák –
  // Truhlářství"): keep it as the trade name so the display name is unchanged.
  const legacyTradeName =
    needsSplit && subject?.type === SubjectType.ENTREPRENEUR && !subject.tradeName
      ? subject.name
      : undefined;

  const contacts: ContactDefault[] = subject
    ? mergeLegacyEmail(subject.contacts, subject.email).map((contact) => ({
        id: contact.id ?? null,
        type: contact.type as SubjectContactType,
        value: contact.value,
        label: contact.label ?? null,
        isPrimary: contact.isPrimary,
      }))
    : [];
  const statutory = subject
    ? mergeLegacyStatutory(subject.statutoryBodies, subject.statutoryBody).map(
        (row) => ({
          id: "id" in row ? (row.id ?? null) : null,
          name: row.name,
          function: row.function ?? "",
          actingMethod: "actingMethod" in row ? (row.actingMethod ?? "") : "",
          validFrom: day(row.validFrom),
          validTo: day(row.validTo),
          linkedSubjectId: "linkedSubjectId" in row ? (row.linkedSubjectId ?? "") : "",
        }),
      )
    : [];

  return (
    <>
      <PageHeader
        title="Upravit subjekt"
        description="Úprava základních, kontaktních, rizikových a smluvních údajů subjektu."
        action={
          <ButtonLink href={`/subjects/${id}`} variant="secondary">
            Zpět na detail
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      {subject ? (
        <Section>
          {errorMessage ? (
            <p
              role="alert"
              className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {errorMessage}
            </p>
          ) : null}
          <form action={updateSubject} className="grid gap-4">
            <input type="hidden" name="id" value={subject.id} />
            <SubjectFormFields
              defaults={{
                type: subject.type,
                name: subject.name,
                ico: subject.ico ?? undefined,
                dic: subject.dic ?? undefined,
                legalForm: subject.legalForm ?? undefined,
                address: subject.address ?? undefined,
                deliveryAddress: subject.deliveryAddress ?? undefined,
                titleBefore: split?.titleBefore ?? subject.titleBefore ?? undefined,
                firstName: split?.firstName ?? subject.firstName ?? undefined,
                lastName: split?.lastName ?? subject.lastName ?? undefined,
                titleAfter: split?.titleAfter ?? subject.titleAfter ?? undefined,
                birthDate: day(subject.birthDate) || undefined,
                birthNumber: subject.birthNumber ?? undefined,
                nationality: subject.nationality ?? undefined,
                tradeName: subject.tradeName ?? legacyTradeName,
                status: subject.status,
                insolvencyStatus: subject.insolvencyStatus ?? undefined,
                riskFlag: subject.riskFlag,
              }}
              statutory={statutory}
              linkOptions={linkOptions}
              nameSplitNotice={needsSplit}
              contactsSlot={<SubjectContactsEditor defaults={contacts} />}
            />
            <Field label="SharePoint URL">
              <TextInput
                name="sharepointUrl"
                type="url"
                defaultValue={subject.sharepointUrl ?? ""}
              />
            </Field>
            <Field label="Interní poznámka">
              <TextArea
                name="internalNote"
                defaultValue={subject.internalNote ?? ""}
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="URL smlouvy o poskytování právních služeb">
                <TextInput
                  name="legalServicesContractUrl"
                  type="url"
                  defaultValue={subject.legalServicesContractUrl ?? ""}
                />
              </Field>
              <Field label="Typ odměny">
                <SelectInput name="feeType" defaultValue={subject.feeType ?? "HOURLY"}>
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
                <TextInput
                  name="hourlyRate"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={numberInputValue(subject.hourlyRate)}
                />
              </Field>
              <Field label="Paušální odměna">
                <TextInput
                  name="flatFee"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={numberInputValue(subject.flatFee)}
                />
              </Field>
            </div>
            <Field label="Poznámka k odměně">
              <TextArea name="feeNote" defaultValue={subject.feeNote ?? ""} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" pendingLabel="Ukládám…">Uložit subjekt</Button>
              <ButtonLink href={`/subjects/${subject.id}`} variant="ghost">
                Zrušit
              </ButtonLink>
            </div>
          </form>
        </Section>
      ) : (
        <EmptyState>Editace subjektu není dostupná bez databáze.</EmptyState>
      )}
    </>
  );
}
