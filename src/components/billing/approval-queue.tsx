"use client";

import {
  type ReactNode,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import { bulkDecideWorkLogs, decideWorkLog } from "@/app/actions/billing";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormDoneWatcher } from "@/components/ui/form-done-watcher";
import {
  formatHoursTotal,
  formatItemCount,
  formatItemCountAccusative,
  type BulkDecisionState,
} from "@/lib/billing-approvals";
import type { ApprovalQueueRow } from "@/lib/billing-approvals.server";
import { approvalStatusLabels, billingStatusLabels } from "@/lib/labels";
import { approvalStatusTone, billingStatusTone } from "@/lib/status-tones";

const initialBulkState: BulkDecisionState = { status: "idle" };

type BulkMode = "APPROVE" | "REJECT";

// Rows of the description textarea: enough for the whole text to be visible
// without scrolling (browsers with `field-sizing: content` size it exactly;
// the rest fall back to this estimate).
function descriptionRows(text: string | null) {
  if (!text) {
    return 3;
  }
  const lines = text.split("\n");
  const wrapped = lines.reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / 90)),
    0,
  );
  return Math.min(14, Math.max(3, wrapped + 1));
}

function numberValue(value: number | null) {
  return value === null || value === undefined ? "" : String(value);
}

// One of the per-card decision buttons: while the card form submits, all of
// them are disabled, but only the clicked one shows the spinner and its
// pending text ("Schvaluji…", "Zamítám…").
function DecisionButton({
  value,
  pendingLabel,
  variant,
  children,
}: {
  value: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "danger";
  children: ReactNode;
}) {
  const { pending, data } = useFormStatus();
  const isMine = pending && data?.get("disposition") === value;
  return (
    <Button
      type="submit"
      name="disposition"
      value={value}
      variant={variant}
      className="h-9 px-3"
      pending={pending}
      showPendingIndicator={isMine}
      pendingLabel={isMine ? pendingLabel : undefined}
    >
      {children}
    </Button>
  );
}

/**
 * The approval queue ("Položky ke schválení"): one card per pending work log
 * with the full description on its own line (editable, decided per card via
 * decideWorkLog), plus a selection model for bulk approve / reject
 * (bulkDecideWorkLogs, confirmed in a dialog with the count and total hours).
 */
export function ApprovalQueue({
  rows,
  users,
  canApprove,
  showRates,
  totals,
  capped,
}: {
  rows: ApprovalQueueRow[];
  users: Array<{ id: string; name: string }>;
  canApprove: boolean;
  /** Rate field on the cards — only for approvers with VIEW_RATES. */
  showRates: boolean;
  totals: { count: number; hours: number };
  capped: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<BulkMode | null>(null);
  const [state, formAction] = useActionState(
    bulkDecideWorkLogs,
    initialBulkState,
  );

  // A successful bulk decision clears the selection (adjust state during
  // render, once per result).
  const [seenAt, setSeenAt] = useState(state.at);
  if (state.at !== seenAt) {
    setSeenAt(state.at);
    setConfirm(null);
    if (state.status === "ok") {
      setSelected(new Set());
    }
  }

  // Rows decided elsewhere (single card, another window) drop out of the
  // selection as soon as the page re-renders without them.
  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.id)),
    [rows, selected],
  );
  const selectedHours = selectedRows.reduce((sum, row) => sum + row.hours, 0);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const someSelected = selectedRows.length > 0 && !allSelected;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set());
  }

  const count = selectedRows.length;
  const countLabel = formatItemCountAccusative(count);
  const hoursLabel = formatHoursTotal(selectedHours);

  return (
    <div className="grid gap-4">
      <p className="text-sm text-[#566673]" data-testid="approval-queue-totals">
        Ve frontě: {formatItemCount(totals.count)} ·{" "}
        {formatHoursTotal(totals.hours)}
      </p>

      {state.status !== "idle" && state.message ? (
        state.status === "ok" ? (
          <p
            key={state.at}
            role="status"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          >
            {state.message}
          </p>
        ) : (
          <p
            key={state.at}
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
          >
            {state.message}
          </p>
        )
      ) : null}

      {!canApprove ? (
        <p className="rounded-md border border-[#dce4e8] bg-[#f6f8f9] px-3 py-2 text-sm text-[#566673]">
          Nemáte oprávnění schvalovat položky.
        </p>
      ) : null}

      {capped ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Zobrazeno prvních {rows.length} z {totals.count} položek. Rozhodněte je
          nebo zužte filtr pro zobrazení dalších.
        </p>
      ) : null}

      {rows.length > 0 && canApprove ? (
        <label className="flex items-center gap-2 text-sm font-medium text-[#0e1822]">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            onChange={(event) => toggleAll(event.target.checked)}
            className="h-4 w-4 rounded border-[#dce4e8] text-[#0e1822] focus:ring-[#17A2A2]"
          />
          {capped
            ? `Vybrat vše zobrazené (${rows.length} z ${totals.count})`
            : "Vybrat vše (podle filtru)"}
        </label>
      ) : null}

      {rows.length > 0 ? (
        <ul className="grid gap-4" aria-label="Položky ke schválení">
          {rows.map((row) => (
            <li
              key={row.id}
              data-testid="approval-card"
              className="flex gap-3 rounded-lg border border-[#dce4e8] bg-white p-4 shadow-sm shadow-[#0e1822]/5"
            >
              {canApprove ? (
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={(event) => toggle(row.id, event.target.checked)}
                  aria-label={`Vybrat položku ${row.workDateLabel} ${row.subjectName ?? ""}`.trim()}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-[#dce4e8] text-[#0e1822] focus:ring-[#17A2A2]"
                />
              ) : null}
              <div className="grid min-w-0 flex-1 gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#566673]">
                  <span className="font-medium text-[#0e1822]">
                    {row.workDateLabel}
                  </span>
                  <span>{row.subjectName ?? "—"}</span>
                  <span>{row.projectName ?? "—"}</span>
                  <span>{row.caseLabel ?? "—"}</span>
                  {row.taskTitle ? <span>{row.taskTitle}</span> : null}
                  <span>{row.userName ?? "Bez pracovníka"}</span>
                  <span className="font-medium text-[#0e1822]">
                    {formatHoursTotal(row.hours)}
                  </span>
                  <Badge tone={billingStatusTone(row.billingStatus)}>
                    {billingStatusLabels[row.billingStatus]}
                  </Badge>
                  <Badge tone={approvalStatusTone(row.approvalStatus)}>
                    {approvalStatusLabels[row.approvalStatus]}
                  </Badge>
                </div>
                {canApprove ? (
                  <form action={decideWorkLog} className="grid gap-4">
                    <input type="hidden" name="id" value={row.id} />
                    {/* Popis úkonu na samostatném řádku přes celou šířku –
                        celý vidět, zalomený, editovatelný. */}
                    <Field label="Popis úkonu">
                      <TextArea
                        name="description"
                        defaultValue={row.description ?? ""}
                        rows={descriptionRows(row.description)}
                        className="min-h-20 resize-y whitespace-pre-wrap break-words [field-sizing:content]"
                      />
                    </Field>
                    <div
                      className={`grid gap-4 ${showRates ? "md:grid-cols-3" : "md:grid-cols-2"}`}
                    >
                      <Field label="Pracovník">
                        <SelectInput name="userId" defaultValue={row.userId ?? ""}>
                          <option value="">Bez pracovníka</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                      <Field label="Hodiny">
                        <TextInput
                          name="hours"
                          type="number"
                          min="0"
                          step="0.25"
                          defaultValue={numberValue(row.hours)}
                          required
                        />
                      </Field>
                      {showRates ? (
                        <Field label="Sazba">
                          <TextInput
                            name="hourlyRate"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={numberValue(row.hourlyRate)}
                          />
                        </Field>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <DecisionButton value="APPROVE" pendingLabel="Schvaluji…">
                        Schválit
                      </DecisionButton>
                      <DecisionButton
                        value="VISIBLE_WRITE_OFF"
                        variant="secondary"
                        pendingLabel="Odepisuji…"
                      >
                        Viditelný odpis (0 Kč)
                      </DecisionButton>
                      <DecisionButton
                        value="HIDDEN_WRITE_OFF"
                        variant="secondary"
                        pendingLabel="Odepisuji…"
                      >
                        Skrytý odpis
                      </DecisionButton>
                      <DecisionButton
                        value="REJECT"
                        variant="danger"
                        pendingLabel="Zamítám…"
                      >
                        Zamítnout
                      </DecisionButton>
                    </div>
                  </form>
                ) : (
                  <div className="grid gap-1">
                    <p className="text-sm font-medium text-[#0e1822]">Popis úkonu</p>
                    <p className="whitespace-pre-line break-words text-sm text-[#2c3a45]">
                      {row.description ?? "—"}
                    </p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>Žádné položky nečekají na schválení.</EmptyState>
      )}

      {canApprove && count > 0 ? (
        <form
          action={formAction}
          className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-lg border border-[#0e1822]/20 bg-white p-3 shadow-lg shadow-[#0e1822]/10 sm:flex-row sm:flex-wrap sm:items-center"
          aria-label="Hromadné rozhodnutí"
        >
          {selectedRows.map((row) => (
            <input key={row.id} type="hidden" name="workLogId" value={row.id} />
          ))}
          <p className="text-sm font-medium text-[#0e1822]" aria-live="polite">
            Vybráno: {count} · {hoursLabel}
          </p>
          <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              className="h-9 px-3"
              onClick={() => setConfirm("APPROVE")}
              aria-haspopup="dialog"
            >
              Schválit vybrané
            </Button>
            <Button
              type="button"
              variant="danger"
              className="h-9 px-3"
              onClick={() => setConfirm("REJECT")}
              aria-haspopup="dialog"
            >
              Zamítnout vybrané
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9 px-3"
              onClick={() => setSelected(new Set())}
            >
              Zrušit výběr
            </Button>
          </div>
          <Dialog
            open={confirm !== null}
            onOpenChange={(open) => {
              if (!open) {
                setConfirm(null);
              }
            }}
            title={
              confirm === "REJECT"
                ? "Zamítnout vybrané položky"
                : "Schválit vybrané položky"
            }
            size="sm"
          >
            <div className="grid gap-5 px-4 py-4 sm:px-5">
              <p className="text-sm leading-6 text-[#2c3a45]">
                {confirm === "REJECT"
                  ? `Zamítnout ${countLabel} (celkem ${hoursLabel})? Zamítnuté položky vypadnou z fakturačních podkladů.`
                  : `Schválit ${countLabel} (celkem ${hoursLabel})? Položky se schválí s uloženými hodinami, sazbou a popisem – neuložené úpravy v kartách se nepoužijí.`}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirm(null)}
                >
                  Zrušit
                </Button>
                <Button
                  type="submit"
                  name="disposition"
                  value={confirm ?? "APPROVE"}
                  variant={confirm === "REJECT" ? "danger" : "primary"}
                  pendingLabel={confirm === "REJECT" ? "Zamítám…" : "Schvaluji…"}
                >
                  {confirm === "REJECT"
                    ? `Zamítnout ${countLabel}`
                    : `Schválit ${countLabel}`}
                </Button>
              </div>
              <FormDoneWatcher onDone={() => setConfirm(null)} />
            </div>
          </Dialog>
        </form>
      ) : null}
    </div>
  );
}
