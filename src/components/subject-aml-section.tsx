import { assessRisk, recordIdentification } from "@/app/actions/aml";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import {
  SanctionsScreeningPanel,
  type ScreeningWithMatches,
} from "@/components/sanctions-screening-panel";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AmlAssessment, AmlIdentification } from "@/generated/prisma/client";
import { AmlRiskLevel } from "@/generated/prisma/enums";
import { documentTypeOptions } from "@/lib/aml";
import { formatDate } from "@/lib/format";
import { amlRiskLevelLabels } from "@/lib/labels";
import { amlRiskLevelTone } from "@/lib/status-tones";

// AML/KYC block on the subject detail. Only rendered for ADMIN/PARTNER (the page
// gates it). Document numbers are shown masked; the full value stays encrypted.
export function SubjectAmlSection({
  subjectId,
  identifications,
  assessment,
  screening,
}: {
  subjectId: string;
  identifications: AmlIdentification[];
  assessment: AmlAssessment | null;
  screening: ScreeningWithMatches | null;
}) {
  return (
    <>
      <Section title="AML — hodnocení rizik">
        {assessment ? (
          <dl className="mb-4 grid gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium text-stone-500">Riziko</dt>
              <dd className="mt-1">
                <Badge tone={amlRiskLevelTone(assessment.riskLevel)}>
                  {amlRiskLevelLabels[assessment.riskLevel]}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">PEP</dt>
              <dd className="mt-1 text-sm text-stone-700">
                {assessment.isPep ? "Ano" : "Ne"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Sankce</dt>
              <dd className="mt-1 text-sm text-stone-700">
                {assessment.hasSanctions ? "Shoda" : "Bez shody"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">
                Revize do
              </dt>
              <dd className="mt-1 text-sm text-stone-700">
                {formatDate(assessment.reviewDueAt)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mb-4 text-sm text-stone-600">
            Klient zatím nebyl hodnocen.
          </p>
        )}

        <form action={assessRisk} className="grid gap-4 sm:max-w-2xl">
          <input type="hidden" name="subjectId" value={subjectId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Úroveň rizika">
              <SelectInput
                name="riskLevel"
                defaultValue={assessment?.riskLevel ?? AmlRiskLevel.MEDIUM}
              >
                {Object.values(AmlRiskLevel).map((level) => (
                  <option key={level} value={level}>
                    {amlRiskLevelLabels[level]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Revize do (volitelné, výchozí 12 měsíců)">
              <TextInput
                name="reviewDueAt"
                type="date"
                defaultValue={
                  assessment?.reviewDueAt
                    ? assessment.reviewDueAt.toISOString().slice(0, 10)
                    : ""
                }
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm font-medium text-[#072924]">
              <input
                type="checkbox"
                name="isPep"
                defaultChecked={assessment?.isPep ?? false}
                className="h-4 w-4 rounded border-[#cfe0d7] text-[#072924] focus:ring-[#B9DCC6]"
              />
              <span>Politicky exponovaná osoba (PEP)</span>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-[#072924]">
              <input
                type="checkbox"
                name="hasSanctions"
                defaultChecked={assessment?.hasSanctions ?? false}
                className="h-4 w-4 rounded border-[#cfe0d7] text-[#072924] focus:ring-[#B9DCC6]"
              />
              <span>Shoda na sankčním seznamu</span>
            </label>
          </div>
          <Field label="Výsledek screeningu (volitelné)">
            <TextInput
              name="screeningResult"
              defaultValue={assessment?.screeningResult ?? ""}
            />
          </Field>
          <Field label="Poznámka (volitelné)">
            <TextArea name="note" defaultValue={assessment?.note ?? ""} />
          </Field>
          <div>
            <Button type="submit">Uložit hodnocení</Button>
          </div>
        </form>
      </Section>

      <SanctionsScreeningPanel subjectId={subjectId} screening={screening} />

      <Section title="AML — identifikace klienta">
        {identifications.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Doklad</th>
                  <th>Číslo</th>
                  <th>Platnost do</th>
                  <th>Ověřeno</th>
                </tr>
              </thead>
              <tbody>
                {identifications.map((identification) => (
                  <tr key={identification.id}>
                    <td className="font-medium text-stone-950">
                      {identification.documentType}
                    </td>
                    <td className="font-mono text-xs">
                      {identification.documentNumberMasked}
                    </td>
                    <td>{formatDate(identification.expiresAt)}</td>
                    <td>{formatDate(identification.verifiedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Zatím není evidována žádná identifikace.</EmptyState>
        )}

        <form
          action={recordIdentification}
          className="mt-4 grid gap-4 sm:max-w-2xl"
        >
          <input type="hidden" name="subjectId" value={subjectId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Typ dokladu">
              <SelectInput name="documentType" defaultValue={documentTypeOptions[0]}>
                {documentTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Číslo dokladu">
              <TextInput name="documentNumber" required autoComplete="off" />
            </Field>
            <Field label="Země vydání (volitelné)">
              <TextInput name="issueCountry" defaultValue="Česká republika" />
            </Field>
            <Field label="Způsob ověření (volitelné)">
              <TextInput name="method" placeholder="Osobně / na dálku" />
            </Field>
            <Field label="Vydáno (volitelné)">
              <TextInput name="issuedAt" type="date" />
            </Field>
            <Field label="Platnost do (volitelné)">
              <TextInput name="expiresAt" type="date" defaultValue="" />
            </Field>
            <Field label="Datum ověření (výchozí dnes)">
              <TextInput name="verifiedAt" type="date" />
            </Field>
          </div>
          <Field label="Poznámka (volitelné)">
            <TextArea name="note" />
          </Field>
          <div>
            <Button type="submit">Zaevidovat identifikaci</Button>
          </div>
        </form>
        <p className="mt-2 text-xs text-stone-400">
          Číslo dokladu se ukládá šifrovaně; v přehledu se zobrazuje pouze
          maskované. Dnešní datum se zaznamená jako datum ověření.
        </p>
      </Section>
    </>
  );
}
