"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";

import { lookupAres } from "@/app/actions/ares";
import { normalizeIco } from "@/lib/ares/ico";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { SubjectType } from "@/generated/prisma/enums";
import { options, subjectTypeLabels } from "@/lib/labels";

type NoticeTone = "ok" | "warning" | "error";

const noticeStyles: Record<NoticeTone, string> = {
  ok: "border-[#B9DCC6] bg-[#B9DCC6]/30 text-[#072924]",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  error: "border-red-200 bg-red-50 text-red-900",
};

export type SubjectAresDefaults = {
  type?: SubjectType;
  name?: string;
  ico?: string;
  dic?: string;
  legalForm?: string;
  address?: string;
  statutoryBody?: string;
  status?: string;
  insolvencyStatus?: string;
  riskFlag?: boolean;
};

/**
 * Controlled island over the auto-fillable identity fields of the subject form.
 * Lives inside the parent server-action `<form>` — inputs keep their `name`, so
 * submission is unchanged; only the "Načíst z ARES" button needs JS.
 */
export function SubjectAresFields({
  defaults = {},
}: {
  defaults?: SubjectAresDefaults;
}) {
  const [type, setType] = useState<SubjectType>(
    defaults.type ?? SubjectType.COMPANY,
  );
  const [name, setName] = useState(defaults.name ?? "");
  const [ico, setIco] = useState(defaults.ico ?? "");
  // Tracks the latest IČO so an in-flight lookup whose input changed meanwhile
  // can discard its now-stale result instead of overwriting fresh user input.
  const icoRef = useRef(ico);
  const [dic, setDic] = useState(defaults.dic ?? "");
  const [legalForm, setLegalForm] = useState(defaults.legalForm ?? "");
  const [address, setAddress] = useState(defaults.address ?? "");
  const [statutoryBody, setStatutoryBody] = useState(
    defaults.statutoryBody ?? "",
  );
  const [status, setStatus] = useState(defaults.status ?? "ACTIVE");
  const [insolvencyStatus, setInsolvencyStatus] = useState(
    defaults.insolvencyStatus ?? "",
  );
  const [riskFlag, setRiskFlag] = useState(defaults.riskFlag ?? false);

  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const normalizedIco = normalizeIco(ico);
  // PERSON (non-entrepreneur individuals) have no IČO; everything else may.
  const lookupDisabled =
    isPending || type === SubjectType.PERSON || normalizedIco === null;

  function handleLookup() {
    const requested = ico;
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await lookupAres(requested);

        // Discard a stale result if the user edited the IČO mid-flight.
        if (icoRef.current !== requested) {
          return;
        }

        if (result.status === "ok") {
          const fields = result.fields;
          if (fields.name) setName(fields.name);
          if (fields.dic !== null) setDic(fields.dic);
          if (fields.address !== null) setAddress(fields.address);
          if (fields.legalForm !== null) setLegalForm(fields.legalForm);
          // Additive: ARES may raise a risk flag, but auto-fill never clears a
          // flag/note the user set manually.
          if (fields.riskFlag) {
            setRiskFlag(true);
            if (fields.insolvencyStatus)
              setInsolvencyStatus(fields.insolvencyStatus);
          }
          setNotice({
            tone: fields.riskFlag ? "warning" : "ok",
            message: result.message,
          });
        } else {
          setNotice({
            tone: result.status === "error" ? "error" : "warning",
            message: result.message,
          });
        }
      } catch {
        setNotice({ tone: "error", message: "Načtení z ARES se nezdařilo." });
      }
    });
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Typ">
          <SelectInput
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as SubjectType)}
          >
            {options.subjectTypes.map((subjectType) => (
              <option key={subjectType} value={subjectType}>
                {subjectTypeLabels[subjectType]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Název" className="md:col-span-2">
          <TextInput
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="IČO">
          <TextInput
            name="ico"
            value={ico}
            onChange={(event) => {
              setIco(event.target.value);
              icoRef.current = event.target.value;
            }}
            inputMode="numeric"
          />
        </Field>
        <Field label="DIČ">
          <TextInput
            name="dic"
            value={dic}
            onChange={(event) => setDic(event.target.value)}
          />
        </Field>
        <Field label="Právní forma">
          <TextInput
            name="legalForm"
            value={legalForm}
            onChange={(event) => setLegalForm(event.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleLookup}
            disabled={lookupDisabled}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {isPending ? "Načítám z ARES…" : "Načíst z ARES"}
          </Button>
        </div>
        {notice ? (
          <p
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${noticeStyles[notice.tone]}`}
          >
            {notice.tone === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{notice.message}</span>
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Adresa">
          <TextInput
            name="address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </Field>
        <Field label="Statutární orgán">
          <TextInput
            name="statutoryBody"
            value={statutoryBody}
            onChange={(event) => setStatutoryBody(event.target.value)}
          />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Stav">
          <TextInput
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
        </Field>
        <Field label="Insolvenční stav">
          <TextInput
            name="insolvencyStatus"
            value={insolvencyStatus}
            onChange={(event) => setInsolvencyStatus(event.target.value)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
        <input
          type="checkbox"
          name="riskFlag"
          checked={riskFlag}
          onChange={(event) => setRiskFlag(event.target.checked)}
          className="h-4 w-4 rounded border-stone-300 text-emerald-950"
        />
        Rizikový subjekt
      </label>
    </>
  );
}
