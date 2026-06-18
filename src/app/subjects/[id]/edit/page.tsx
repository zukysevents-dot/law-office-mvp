import { notFound } from "next/navigation";

import { updateSubject } from "@/app/actions/subjects";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { numberInputValue } from "@/lib/form-values";
import { feeTypeLabels, options, subjectTypeLabels } from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import { canEditRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SubjectEditProps = {
  params: Promise<{ id: string }>;
};

async function loadSubject(id: string) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const subject = await prisma.subject.findUnique({ where: { id } });

  return subject && canEditRecord(currentUser, "Subject", subject)
    ? subject
    : null;
}

export default async function SubjectEditPage({ params }: SubjectEditProps) {
  const { id } = await params;
  const result = await safeQuery(null, () => loadSubject(id));

  if (result.databaseReady && !result.data) {
    notFound();
  }

  const subject = result.data;

  return (
    <>
      <PageHeader
        title="Upravit subjekt"
        description="Úprava základních, rizikových a smluvních údajů subjektu."
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
          <form action={updateSubject} className="grid gap-4">
            <input type="hidden" name="id" value={subject.id} />
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Typ">
                <SelectInput name="type" defaultValue={subject.type}>
                  {options.subjectTypes.map((type) => (
                    <option key={type} value={type}>
                      {subjectTypeLabels[type]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Název" className="md:col-span-2">
                <TextInput name="name" defaultValue={subject.name} required />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="IČO">
                <TextInput name="ico" defaultValue={subject.ico ?? ""} />
              </Field>
              <Field label="DIČ">
                <TextInput name="dic" defaultValue={subject.dic ?? ""} />
              </Field>
              <Field label="Právní forma">
                <TextInput
                  name="legalForm"
                  defaultValue={subject.legalForm ?? ""}
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Adresa">
                <TextInput name="address" defaultValue={subject.address ?? ""} />
              </Field>
              <Field label="Statutární orgán">
                <TextInput
                  name="statutoryBody"
                  defaultValue={subject.statutoryBody ?? ""}
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="E-mail">
                <TextInput
                  name="email"
                  type="email"
                  defaultValue={subject.email ?? ""}
                />
              </Field>
              <Field label="SharePoint URL">
                <TextInput
                  name="sharepointUrl"
                  type="url"
                  defaultValue={subject.sharepointUrl ?? ""}
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Stav">
                <TextInput name="status" defaultValue={subject.status} />
              </Field>
              <Field label="Insolvenční stav">
                <TextInput
                  name="insolvencyStatus"
                  defaultValue={subject.insolvencyStatus ?? ""}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
              <input
                type="checkbox"
                name="riskFlag"
                defaultChecked={subject.riskFlag}
                className="h-4 w-4 rounded border-stone-300 text-emerald-950"
              />
              Rizikový subjekt
            </label>
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
              <Button type="submit">Uložit subjekt</Button>
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
