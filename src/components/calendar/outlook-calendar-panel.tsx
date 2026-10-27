"use client";

import { RefreshCw, Unlink } from "lucide-react";
import { useActionState, useState, useTransition, type ReactNode } from "react";

import {
  disconnectOutlookCalendar,
  saveOutlookCalendarUrl,
  type OutlookFormState,
} from "@/app/actions/calendar";
import { Field, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { ConfirmDialogButton } from "@/components/ui/confirm-dialog";
import { requestOutlookRefresh } from "@/lib/calendar/outlook-refresh-client";
import type { OutlookFeedSummary } from "@/lib/calendar/outlook-summary";

const initialState: OutlookFormState = { ok: false };

const fetchedAtFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Prague",
});

function formatFetchedAt(iso: string | null) {
  return iso ? fetchedAtFormatter.format(new Date(iso)) : "zatím nikdy";
}

function Notice({
  tone,
  role,
  children,
}: {
  tone: "amber" | "green" | "red" | "blue";
  role?: "status" | "alert";
  children: ReactNode;
}) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-[#bcd6ef] bg-[#e6f0fa] text-[#0b3a6e]",
  } as const;
  return (
    <p role={role} className={`rounded-md border px-3 py-2 text-sm leading-6 ${tones[tone]}`}>
      {children}
    </p>
  );
}

function HowTo() {
  return (
    <div className="grid gap-2 text-sm leading-6 text-[#2c3a45]">
      <p>
        Události z vašeho Outlook kalendáře se zobrazí v kalendáři iuriverse. Uvidíte je
        jen vy a jsou jen pro čtení – upravujete je dál v Outlooku.
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          V Outlooku na webu (Outlook.com nebo Microsoft 365) otevřete Nastavení →
          Kalendář → Sdílené kalendáře.
        </li>
        <li>
          V části Publikovat kalendář vyberte kalendář, oprávnění „Může zobrazit všechny
          podrobnosti“ a klikněte na Publikovat.
        </li>
        <li>Zkopírujte odkaz ICS (končí na .ics) a vložte ho sem.</li>
      </ol>
      <p className="text-xs leading-5 text-[#566673]">
        Outlook publikovaný kalendář aktualizuje se zpožděním (obvykle desítky minut).
        iuriverse si ho stahuje nejvýše jednou za 10 minut.
      </p>
      <p className="text-xs leading-5 text-[#566673]">
        Odkaz je tajný – kdo ho zná, vidí váš kalendář. Pokud unikne, zrušte v Outlooku
        publikování a vytvořte nový odkaz.
      </p>
    </div>
  );
}

/**
 * Connect / refresh / replace / disconnect the user's own Outlook calendar
 * (published ICS link). Used in the calendar's „Outlook" dialog and in
 * /settings → „Můj kalendář".
 */
export function OutlookCalendarPanel({
  summary: summaryProp,
  onSummaryChange,
}: {
  summary: OutlookFeedSummary;
  /** Called after „Obnovit teď" with the fresh summary (calendar refetch). */
  onSummaryChange?: (summary: OutlookFeedSummary) => void;
}) {
  const [state, formAction] = useActionState(saveOutlookCalendarUrl, initialState);
  const [summary, setSummary] = useState(summaryProp);
  const [previousProp, setPreviousProp] = useState(summaryProp);
  const [replacing, setReplacing] = useState(false);
  const [handledSubmit, setHandledSubmit] = useState<number | undefined>(undefined);
  const [refreshing, startRefresh] = useTransition();
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshInfo, setRefreshInfo] = useState<string | null>(null);

  // The page re-renders after save/disconnect → take the new server summary.
  if (summaryProp !== previousProp) {
    setPreviousProp(summaryProp);
    setSummary(summaryProp);
  }
  // A successful save closes the „Nahradit odkaz" form.
  if (state.ok && state.submittedAt !== handledSubmit) {
    setHandledSubmit(state.submittedAt);
    setReplacing(false);
  }

  // A Route Handler fetch (not a server action), so a slow Outlook server
  // never holds back the calendar's own event fetches.
  function refreshNow() {
    setRefreshError(null);
    setRefreshInfo(null);
    startRefresh(async () => {
      try {
        const result = await requestOutlookRefresh(true);
        if (!result) {
          throw new Error("No refresh result");
        }
        setSummary(result.summary);
        onSummaryChange?.(result.summary);
        if (result.outcome === "throttled") {
          setRefreshInfo(
            "Kalendář byl obnoven před chvílí. Znovu ho můžete obnovit nejdříve za minutu.",
          );
        } else if (result.outcome === "locked") {
          setRefreshInfo("Kalendář se právě obnovuje. Výsledek se za chvíli zobrazí.");
        } else if (result.outcome === "refreshed" || result.outcome === "not-modified") {
          setRefreshInfo("Kalendář je aktuální.");
        }
      } catch {
        setRefreshError("Kalendář se nepodařilo obnovit. Zkuste to prosím později.");
      }
    });
  }

  const showForm = !summary.connected || replacing;

  return (
    <div className="grid gap-4">
      {/* Only while connected: after „Odpojit" the old banner would lie. */}
      {state.ok && state.message && summary.connected ? (
        <Notice tone="green" role="status">
          {state.message}
        </Notice>
      ) : null}

      {summary.connected ? (
        <div className="grid gap-3">
          <div className="grid gap-1 text-sm text-[#2c3a45]">
            <p>
              Propojeno:{" "}
              <strong className="break-all font-semibold text-[#0b3a6e]">
                {summary.urlHint}
              </strong>
            </p>
            <p className="text-[#566673]">
              Naposledy načteno: {formatFetchedAt(summary.fetchedAtIso)}
            </p>
          </div>
          {summary.errorMessage ? (
            <Notice tone="amber" role="status">
              Poslední aktualizace se nezdařila: {summary.errorMessage}
              {summary.fetchedAtIso
                ? ` Zobrazujeme data z ${formatFetchedAt(summary.fetchedAtIso)}.`
                : ""}
            </Notice>
          ) : null}
          {!summary.encrypted ? (
            <Notice tone="amber">
              Odkaz je uložený nešifrovaně (chybí DATA_ENCRYPTION_KEY). Po nastavení klíče
              se při příští aktualizaci zašifruje.
            </Notice>
          ) : null}
          {refreshInfo ? (
            <Notice tone="blue" role="status">
              {refreshInfo}
            </Notice>
          ) : null}
          {refreshError ? (
            <Notice tone="red" role="alert">
              {refreshError}
            </Notice>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={refreshNow}
              pending={refreshing}
              pendingLabel="Obnovuji…"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Obnovit teď
            </Button>
            {!replacing ? (
              <Button type="button" variant="ghost" onClick={() => setReplacing(true)}>
                Nahradit odkaz
              </Button>
            ) : null}
            <form action={disconnectOutlookCalendar} className="inline-flex">
              <ConfirmDialogButton
                label={
                  <>
                    <Unlink className="h-4 w-4" aria-hidden="true" />
                    Odpojit Outlook
                  </>
                }
                title="Odpojit Outlook kalendář"
                message="Odpojit Outlook kalendář? Události z Outlooku zmizí z kalendáře iuriverse. Publikování v Outlooku tím nezrušíte."
                confirmLabel="Odpojit"
                pendingLabel="Odpojuji…"
                variant="danger"
              />
            </form>
          </div>
        </div>
      ) : (
        <HowTo />
      )}

      {showForm ? (
        <form action={formAction} className="grid gap-3">
          {/* The connected block already warns about the unencrypted link. */}
          {!summary.encryptionReady && !(summary.connected && !summary.encrypted) ? (
            <Notice tone="amber">
              Šifrovací klíč (DATA_ENCRYPTION_KEY) není nastaven – odkaz se uloží
              nešifrovaně. Požádejte správce o nastavení klíče.
            </Notice>
          ) : null}
          {state.error ? (
            <Notice tone="red" role="alert">
              {state.error}
            </Notice>
          ) : null}
          <Field label="Odkaz ICS z Outlooku">
            <TextInput
              name="icsUrl"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              required
              placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" pendingLabel="Ověřuji odkaz…">
              {summary.connected ? "Uložit nový odkaz" : "Propojit kalendář"}
            </Button>
            {replacing ? (
              <Button type="button" variant="ghost" onClick={() => setReplacing(false)}>
                Zrušit
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
