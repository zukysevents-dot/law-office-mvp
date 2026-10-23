"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Search } from "lucide-react";

import { lookupAres, type AresStatutorySuggestion } from "@/app/actions/ares";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import {
  SubjectStatutoryEditor,
  type StatutoryRowState,
  type SubjectLinkOption,
} from "@/components/subject-form/subject-statutory-editor";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SubjectType } from "@/generated/prisma/enums";
import { normalizeIco } from "@/lib/ares/ico";
import {
  nationalitySuggestions,
  options,
  subjectTypeLabels,
} from "@/lib/labels";
import {
  BIRTH_NUMBER_INPUT_PATTERN,
  parseBirthNumber,
} from "@/lib/subjects/birth-number";
import {
  capitalizeName,
  composeSubjectName,
  personPartOfTradeName,
  splitPersonName,
} from "@/lib/subjects/person-name";

type NoticeTone = "ok" | "warning" | "error" | "info";

const noticeStyles: Record<NoticeTone, string> = {
  ok: "border-[#17A2A2] bg-[#17A2A2]/30 text-[#0e1822]",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-[#dce4e8] bg-[#F4F7F8] text-[#0e1822]",
};

function Notice({
  tone,
  children,
  role,
}: {
  tone: NoticeTone;
  children: ReactNode;
  role?: "status" | "alert";
}) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <p
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${noticeStyles[tone]}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export type SubjectFormDefaults = {
  type?: SubjectType;
  name?: string;
  ico?: string;
  dic?: string;
  legalForm?: string;
  address?: string;
  deliveryAddress?: string;
  titleBefore?: string;
  firstName?: string;
  lastName?: string;
  titleAfter?: string;
  /** "YYYY-MM-DD" */
  birthDate?: string;
  birthNumber?: string;
  nationality?: string;
  tradeName?: string;
  status?: string;
  insolvencyStatus?: string;
  riskFlag?: boolean;
};

export type StatutoryDefault = Omit<StatutoryRowState, "key">;

const NATIONALITY_LIST_ID = "subject-nationality-suggestions";

/** "2022-11-16" → "16. 11. 2022" (no Intl/Prisma import in the client bundle). */
function formatDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? `${day}. ${month}. ${year}` : value;
}

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase("cs-CZ") === b.trim().toLocaleLowerCase("cs-CZ");

/**
 * Type-aware identity, address and status part of the subject form, plus the
 * statutory bodies (whose state lives here so the ARES lookup can offer to
 * pre-fill them). Lives inside the parent server-action `<form>`: inputs keep
 * their `name`, buttons are `type="button"`. Fields that do not belong to the
 * selected type are not rendered, so they are not submitted.
 */
export function SubjectFormFields({
  defaults = {},
  statutory = [],
  linkOptions = [],
  nameSplitNotice = false,
  contactsSlot,
}: {
  defaults?: SubjectFormDefaults;
  statutory?: StatutoryDefault[];
  linkOptions?: SubjectLinkOption[];
  /** Legacy person: name parts were pre-filled from the old free-text name. */
  nameSplitNotice?: boolean;
  /** Contacts editor, rendered between the addresses and statutory bodies. */
  contactsSlot?: ReactNode;
}) {
  const [type, setType] = useState<SubjectType>(defaults.type ?? SubjectType.COMPANY);
  const [name, setName] = useState(defaults.name ?? "");
  const [titleBefore, setTitleBefore] = useState(defaults.titleBefore ?? "");
  const [firstName, setFirstName] = useState(defaults.firstName ?? "");
  const [lastName, setLastName] = useState(defaults.lastName ?? "");
  const [titleAfter, setTitleAfter] = useState(defaults.titleAfter ?? "");
  const [tradeName, setTradeName] = useState(defaults.tradeName ?? "");
  const [birthDate, setBirthDate] = useState(defaults.birthDate ?? "");
  const [birthNumber, setBirthNumber] = useState(defaults.birthNumber ?? "");
  const autoBirthDate = useRef<string | null>(null);
  const [nationality, setNationality] = useState(defaults.nationality ?? "");
  const [ico, setIco] = useState(defaults.ico ?? "");
  // Tracks the latest IČO so an in-flight lookup whose input changed meanwhile
  // can discard its now-stale result instead of overwriting fresh user input.
  const icoRef = useRef(ico);
  const [dic, setDic] = useState(defaults.dic ?? "");
  const [legalForm, setLegalForm] = useState(defaults.legalForm ?? "");
  const [address, setAddress] = useState(defaults.address ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(defaults.deliveryAddress ?? "");
  const [status, setStatus] = useState(defaults.status ?? "ACTIVE");
  const [insolvencyStatus, setInsolvencyStatus] = useState(defaults.insolvencyStatus ?? "");
  const [riskFlag, setRiskFlag] = useState(defaults.riskFlag ?? false);

  const keyCounter = useRef(0);
  const [statutoryRows, setStatutoryRows] = useState<StatutoryRowState[]>(() =>
    statutory.map((row, index) => ({ ...row, key: row.id ?? `n${index}` })),
  );

  const [notices, setNotices] = useState<Array<{ tone: NoticeTone; message: string }>>([]);
  const [birthNumberNotice, setBirthNumberNotice] = useState<{
    tone: NoticeTone;
    message: string;
  } | null>(null);
  const [aresBodies, setAresBodies] = useState<AresStatutorySuggestion[]>([]);
  const [aresDialogOpen, setAresDialogOpen] = useState(false);
  const [aresSelection, setAresSelection] = useState<boolean[]>([]);
  const [isPending, startTransition] = useTransition();

  const isPerson = type === SubjectType.PERSON;
  const isEntrepreneur = type === SubjectType.ENTREPRENEUR;
  const isNatural = isPerson || isEntrepreneur;
  // A person has no IČO/DIČ — keep the fields only for legacy data so the
  // user can see (and clear) them.
  const legacyPersonIds = Boolean(defaults.ico || defaults.dic);
  const showIds = !isPerson || legacyPersonIds;
  const showStatutory =
    type === SubjectType.COMPANY || type === SubjectType.OTHER || statutoryRows.length > 0;

  const normalizedIco = normalizeIco(ico);
  const lookupDisabled = isPending || isPerson || normalizedIco === null;

  const displayName = useMemo(
    () =>
      composeSubjectName(type, {
        name,
        titleBefore,
        firstName,
        lastName,
        titleAfter,
        tradeName,
      }),
    [type, name, titleBefore, firstName, lastName, titleAfter, tradeName],
  );

  const droppedPersonalData =
    (!isNatural && Boolean(firstName || lastName || birthDate || birthNumber || nationality)) ||
    (isEntrepreneur && Boolean(birthNumber || nationality));

  function changeType(next: SubjectType) {
    const nextNatural = next === SubjectType.PERSON || next === SubjectType.ENTREPRENEUR;
    // Carry the name over between the "name" and "name parts" layouts.
    if (nextNatural && !isNatural && !firstName && !lastName && name.trim()) {
      const parts = splitPersonName(name);
      setTitleBefore(parts.titleBefore);
      setFirstName(parts.firstName);
      setLastName(parts.lastName);
      setTitleAfter(parts.titleAfter);
    } else if (!nextNatural && isNatural && !name.trim() && displayName) {
      setName(displayName);
    }
    setType(next);
  }

  function nextStatutoryKey() {
    keyCounter.current += 1;
    return `new${keyCounter.current}`;
  }

  function addStatutoryRow() {
    setStatutoryRows((rows) => [
      ...rows,
      {
        key: nextStatutoryKey(),
        id: null,
        name: "",
        function: "",
        actingMethod: "",
        validFrom: "",
        validTo: "",
        linkedSubjectId: "",
      },
    ]);
  }

  // Checked while typing (as soon as the value has a complete RČ shape), not
  // on blur: a notice appearing on blur shifts the layout under a click on
  // "Uložit" and the click would be lost. Only the shape error waits for blur
  // (the `pattern` blocks the submit anyway).
  function checkBirthNumber(value: string, onBlur = false) {
    const parsed = parseBirthNumber(value);
    if (!parsed) {
      setBirthNumberNotice(null);
      return;
    }
    if (!parsed.ok) {
      setBirthNumberNotice(
        onBlur
          ? {
              tone: "error",
              message: "Rodné číslo musí mít tvar 123456/7890 (9 nebo 10 číslic).",
            }
          : null,
      );
      return;
    }
    if (!parsed.checksumValid || !parsed.dateValid) {
      setBirthNumberNotice({
        tone: "warning",
        message:
          "Rodné číslo nemá platný kontrolní součet nebo datum – zkontrolujte ho. Uložit ho lze i tak.",
      });
      return;
    }
    // Fill an empty date — or replace one we filled ourselves a keystroke ago
    // (a 9-digit prefix decodes to a different century than the full RČ).
    if (parsed.birthDate && (!birthDate || birthDate === autoBirthDate.current)) {
      const filled = parsed.birthDate.toISOString().slice(0, 10);
      autoBirthDate.current = filled;
      setBirthDate(filled);
      setBirthNumberNotice({
        tone: "info",
        message: "Datum narození jsme doplnili z rodného čísla.",
      });
      return;
    }
    setBirthNumberNotice(null);
  }

  function handleLookup() {
    const requested = ico;
    setNotices([]);
    setAresBodies([]);
    startTransition(async () => {
      try {
        const result = await lookupAres(requested);

        // Discard a stale result if the user edited the IČO mid-flight.
        if (icoRef.current !== requested) {
          return;
        }

        if (result.status !== "ok") {
          setNotices([
            {
              tone: result.status === "error" ? "error" : "warning",
              message: result.message,
            },
          ]);
          return;
        }

        const fields = result.fields;
        const messages: Array<{ tone: NoticeTone; message: string }> = [
          { tone: fields.riskFlag ? "warning" : "ok", message: result.message },
        ];

        if (fields.isNaturalPerson) {
          if (type !== SubjectType.ENTREPRENEUR) {
            setType(SubjectType.ENTREPRENEUR);
            messages.push({
              tone: "info",
              message: "Podle ARES jde o fyzickou osobu podnikatele – typ jsme přepnuli.",
            });
          }
          if (fields.tradeName) setTradeName(fields.tradeName);
          if (!firstName.trim() && !lastName.trim() && fields.tradeName) {
            const parts = splitPersonName(personPartOfTradeName(fields.tradeName));
            setTitleBefore(parts.titleBefore);
            setFirstName(capitalizeName(parts.firstName));
            setLastName(capitalizeName(parts.lastName));
            setTitleAfter(parts.titleAfter);
          }
        } else {
          if (type === SubjectType.ENTREPRENEUR) {
            setType(SubjectType.COMPANY);
            messages.push({
              tone: "info",
              message: "Podle ARES jde o právnickou osobu – typ jsme přepnuli.",
            });
          }
          if (fields.name) setName(fields.name);
        }
        if (fields.dic !== null) setDic(fields.dic);
        if (fields.address !== null) setAddress(fields.address);
        if (fields.legalForm !== null) setLegalForm(fields.legalForm);
        // Additive: ARES may raise a risk flag, but auto-fill never clears a
        // flag/note the user set manually.
        if (fields.riskFlag) {
          setRiskFlag(true);
          if (fields.insolvencyStatus) setInsolvencyStatus(fields.insolvencyStatus);
        }
        setNotices(messages);
        setAresBodies(result.statutoryBodies);
      } catch {
        setNotices([{ tone: "error", message: "Načtení z ARES se nezdařilo." }]);
      }
    });
  }

  function openAresDialog() {
    setAresSelection(
      aresBodies.map(
        (body) => !statutoryRows.some((row) => sameName(row.name, body.name)),
      ),
    );
    setAresDialogOpen(true);
  }

  function takeAresBodies() {
    const picked = aresBodies.filter((_, index) => aresSelection[index]);
    setStatutoryRows((rows) => [
      ...rows,
      ...picked.map((body) => ({
        key: nextStatutoryKey(),
        id: null,
        name: body.name,
        function: body.function ?? "",
        actingMethod: body.actingMethod ?? "",
        validFrom: body.validFrom ?? "",
        validTo: "",
        linkedSubjectId:
          body.linkedSubjectId &&
          linkOptions.some((option) => option.id === body.linkedSubjectId)
            ? body.linkedSubjectId
            : "",
      })),
    ]);
    setAresDialogOpen(false);
  }

  const addressLabel = isPerson
    ? "Adresa trvalého bydliště"
    : isEntrepreneur
      ? "Místo podnikání / sídlo"
      : "Sídlo";

  const aresSlot =
    aresBodies.length > 0 ? (
      <div className="flex flex-col gap-2 rounded-md border border-[#17A2A2] bg-[#17A2A2]/10 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-sm text-[#0e1822]">
          V obchodním rejstříku jsme našli statutární orgány ({aresBodies.length}).
        </p>
        <Button type="button" variant="secondary" onClick={openAresDialog}>
          Převzít z ARES…
        </Button>
      </div>
    ) : null;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Typ">
          <SelectInput
            name="type"
            value={type}
            onChange={(event) => changeType(event.target.value as SubjectType)}
          >
            {options.subjectTypes.map((subjectType) => (
              <option key={subjectType} value={subjectType}>
                {subjectTypeLabels[subjectType]}
              </option>
            ))}
          </SelectInput>
        </Field>
        {!isNatural ? (
          <Field label="Název" className="md:col-span-2">
            <TextInput
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
        ) : null}
      </div>

      {isNatural ? (
        <>
          {nameSplitNotice ? (
            <Notice tone="info">
              Jméno a příjmení jsme předvyplnili z dosavadního názvu – zkontrolujte je.
            </Notice>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_8rem]">
            <Field label="Titul před jménem" className="min-w-0">
              <TextInput
                name="titleBefore"
                value={titleBefore}
                placeholder="např. Ing."
                onChange={(event) => setTitleBefore(event.target.value)}
              />
            </Field>
            <Field label="Jméno" className="min-w-0">
              <TextInput
                name="firstName"
                value={firstName}
                required
                autoComplete="off"
                onChange={(event) => setFirstName(event.target.value)}
              />
            </Field>
            <Field label="Příjmení" className="min-w-0">
              <TextInput
                name="lastName"
                value={lastName}
                required
                autoComplete="off"
                onChange={(event) => setLastName(event.target.value)}
              />
            </Field>
            <Field label="Titul za jménem" className="min-w-0">
              <TextInput
                name="titleAfter"
                value={titleAfter}
                placeholder="např. Ph.D."
                onChange={(event) => setTitleAfter(event.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label={isPerson ? "Datum narození" : "Datum narození (volitelné)"}
              className="min-w-0"
            >
              <TextInput
                type="date"
                name="birthDate"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </Field>
            {isPerson ? (
              <>
                <Field label="Rodné číslo" className="min-w-0">
                  <TextInput
                    name="birthNumber"
                    value={birthNumber}
                    placeholder="např. 800101/0006"
                    pattern={BIRTH_NUMBER_INPUT_PATTERN}
                    title="Rodné číslo ve tvaru 123456/7890 (9 nebo 10 číslic)"
                    autoComplete="off"
                    inputMode="numeric"
                    onChange={(event) => {
                      setBirthNumber(event.target.value);
                      checkBirthNumber(event.target.value);
                    }}
                    onBlur={(event) => checkBirthNumber(event.target.value, true)}
                  />
                </Field>
                <Field label="Státní příslušnost" className="min-w-0">
                  <TextInput
                    name="nationality"
                    value={nationality}
                    list={NATIONALITY_LIST_ID}
                    onChange={(event) => setNationality(event.target.value)}
                  />
                </Field>
                <datalist id={NATIONALITY_LIST_ID}>
                  {nationalitySuggestions.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </>
            ) : (
              <Field label="Obchodní firma (volitelné)" className="min-w-0 md:col-span-2">
                <TextInput
                  name="tradeName"
                  value={tradeName}
                  placeholder="vyplňte, jen pokud se liší od jména"
                  onChange={(event) => setTradeName(event.target.value)}
                />
              </Field>
            )}
          </div>
          {birthNumberNotice && isPerson ? (
            <Notice tone={birthNumberNotice.tone}>{birthNumberNotice.message}</Notice>
          ) : null}
          <p className="text-sm text-[#566673]">
            Zobrazované jméno:{" "}
            <span className="font-medium text-[#0e1822]">{displayName || "—"}</span>
          </p>
        </>
      ) : null}

      {droppedPersonalData ? (
        <Notice tone="info">
          Údaje fyzické osoby (rodné číslo, datum narození, …) se u tohoto typu neuloží.
        </Notice>
      ) : null}

      {showIds ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="IČO" className="min-w-0">
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
          <Field label="DIČ" className="min-w-0">
            <TextInput
              name="dic"
              value={dic}
              onChange={(event) => setDic(event.target.value)}
            />
          </Field>
          {!isPerson ? (
            <Field label="Právní forma" className="min-w-0">
              <TextInput
                name="legalForm"
                value={legalForm}
                onChange={(event) => setLegalForm(event.target.value)}
              />
            </Field>
          ) : null}
        </div>
      ) : null}
      {isPerson && legacyPersonIds ? (
        <Notice tone="warning">
          Fyzická osoba nepodnikatel IČO ani DIČ nemá. Pokud podniká, změňte typ
          na Fyzická osoba podnikatel, jinak údaj smažte.
        </Notice>
      ) : null}

      {!isPerson ? (
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
          {notices.map((notice) => (
            <Notice key={notice.message} tone={notice.tone}>
              {notice.message}
            </Notice>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={addressLabel} className="min-w-0">
          <TextInput
            name="address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </Field>
        <Field label="Doručovací adresa (pokud se liší)" className="min-w-0">
          <TextInput
            name="deliveryAddress"
            value={deliveryAddress}
            onChange={(event) => setDeliveryAddress(event.target.value)}
          />
        </Field>
      </div>

      {contactsSlot}

      {showStatutory ? (
        <SubjectStatutoryEditor
          rows={statutoryRows}
          onChange={setStatutoryRows}
          onAdd={addStatutoryRow}
          linkOptions={linkOptions}
          aresSlot={aresSlot}
        />
      ) : aresSlot}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Stav" className="min-w-0">
          <TextInput
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
        </Field>
        <Field label="Insolvenční stav" className="min-w-0">
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

      <Dialog
        open={aresDialogOpen}
        onOpenChange={setAresDialogOpen}
        title="Statutární orgány z ARES"
        description="Vyberte, které statutární orgány z obchodního rejstříku převzít. Převzaté řádky se jen přidají – stávající se nemění."
        size="lg"
      >
        <div className="grid gap-4 p-4 sm:p-5">
          <ul className="grid gap-2">
            {aresBodies.map((body, index) => (
              <li key={`${body.name}-${index}`}>
                <label className="flex items-start gap-3 rounded-md border border-[#dce4e8] p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={aresSelection[index] ?? false}
                    onChange={(event) =>
                      setAresSelection((current) =>
                        current.map((value, i) => (i === index ? event.target.checked : value)),
                      )
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-[#0e1822]">{body.name}</span>
                    <span className="block text-[#566673]">
                      {[
                        body.function,
                        body.validFrom ? `od ${formatDay(body.validFrom)}` : null,
                        statutoryRows.some((row) => sameName(row.name, body.name))
                          ? "už ve formuláři"
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAresDialogOpen(false)}>
              Zrušit
            </Button>
            <Button
              type="button"
              onClick={takeAresBodies}
              disabled={!aresSelection.some(Boolean)}
            >
              Převzít vybrané
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
