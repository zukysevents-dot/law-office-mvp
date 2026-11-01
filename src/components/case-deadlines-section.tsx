import Link from "next/link";

import {
  cancelCourtHearing,
  cancelDeadline,
  createCourtHearing,
  createDeadline,
} from "@/app/actions/deadlines";
import { DeadlineFulfilDialog } from "@/components/deadlines/deadline-fulfil-dialog";
import { FulfilledDeadlineActions } from "@/components/deadlines/deadline-row-actions";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialogButton } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { DeadlineType } from "@/generated/prisma/enums";
import { formatDateTimeUtc, formatDateUtc } from "@/lib/format";
import { deadlineStatusLabels, deadlineTypeLabels } from "@/lib/labels";
import { deadlineStatusTone, deadlineTypeTone } from "@/lib/status-tones";

type DeadlineRow = {
  id: string;
  type: DeadlineType;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  title: string;
  dueDate: Date;
  completedAt: Date | null;
  completionNote: string | null;
  responsibleUser: { name: string } | null;
  completedBy: { name: string } | null;
};

type HearingRow = {
  id: string;
  court: string;
  hearingAt: Date;
  room: string | null;
  responsibleUser: { name: string } | null;
};

type Member = { id: string; name: string };

// Keep the impure clock out of the render body (react-hooks/purity), mirroring
// the AML page. An OPEN deadline whose dueDate has passed is rendered as overdue.
function nowMs(): number {
  return Date.now();
}

export function CaseDeadlinesSection({
  caseId,
  deadlines,
  archivedDeadlineCount = 0,
  hearings,
  members,
  canManage,
}: {
  caseId: string;
  deadlines: DeadlineRow[];
  archivedDeadlineCount?: number;
  hearings: HearingRow[];
  members: Member[];
  canManage: boolean;
}) {
  const now = nowMs();

  return (
    <>
      <Section title="Lhůty">
        {deadlines.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Lhůta</th>
                  <th>Typ</th>
                  <th>Termín</th>
                  <th>Stav</th>
                  <th>Odpovědný</th>
                  {canManage ? <th>Akce</th> : null}
                </tr>
              </thead>
              <tbody>
                {deadlines.map((deadline) => {
                  const overdue =
                    deadline.status === "OPEN" &&
                    deadline.dueDate.getTime() < now;
                  return (
                    <tr key={deadline.id}>
                      <td className="font-medium text-stone-950">
                        {deadline.title}
                      </td>
                      <td>
                        <Badge tone={deadlineTypeTone(deadline.type)}>
                          {deadlineTypeLabels[deadline.type]}
                        </Badge>
                      </td>
                      <td className={overdue ? "font-semibold text-red-700" : ""}>
                        {formatDateUtc(deadline.dueDate)}
                        {overdue ? " (po termínu)" : ""}
                      </td>
                      <td>
                        <Badge tone={deadlineStatusTone(deadline.status)}>
                          {deadlineStatusLabels[deadline.status]}
                        </Badge>
                        {deadline.status === "COMPLETED" ? (
                          <p className="mt-1 text-xs text-[#566673]">
                            Splněno {formatDateUtc(deadline.completedAt)}
                            {deadline.completedBy
                              ? ` · ${deadline.completedBy.name}`
                              : ""}
                          </p>
                        ) : null}
                        {deadline.status === "COMPLETED" && deadline.completionNote ? (
                          <p className="mt-0.5 max-w-xs whitespace-pre-line break-words text-xs text-[#566673]">
                            {deadline.completionNote}
                          </p>
                        ) : null}
                      </td>
                      <td>{deadline.responsibleUser?.name ?? "—"}</td>
                      {canManage ? (
                        <td>
                          {deadline.status === "OPEN" ? (
                            <div className="flex flex-wrap gap-2">
                              <DeadlineFulfilDialog
                                deadline={{
                                  id: deadline.id,
                                  title: deadline.title,
                                  dueDateLabel: formatDateUtc(deadline.dueDate),
                                  overdue,
                                }}
                              />
                              <form action={cancelDeadline}>
                                <input
                                  type="hidden"
                                  name="deadlineId"
                                  value={deadline.id}
                                />
                                <ConfirmDialogButton
                                  label="Zrušit"
                                  title="Zrušit lhůtu"
                                  message={`Zrušit lhůtu „${deadline.title}“? Přestane se hlídat a zmizí z kalendáře. Zrušení zůstane v auditní stopě.`}
                                  confirmLabel="Zrušit lhůtu"
                                  cancelLabel="Ponechat"
                                  pendingLabel="Ruším…"
                                  variant="ghost"
                                  className="h-9 whitespace-nowrap px-3"
                                />
                              </form>
                            </div>
                          ) : deadline.status === "COMPLETED" ? (
                            <FulfilledDeadlineActions deadlineId={deadline.id} />
                          ) : (
                            "—"
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Spis zatím nemá evidované lhůty.</EmptyState>
        )}
        {archivedDeadlineCount > 0 ? (
          <p className="mt-3 text-sm">
            <Link
              href={`/deadlines?view=archived&caseId=${encodeURIComponent(caseId)}`}
              className="font-medium text-[#0e1822] underline underline-offset-2"
            >
              Archivované lhůty ({archivedDeadlineCount})
            </Link>
          </p>
        ) : null}

        {canManage ? (
          <form action={createDeadline} className="mt-4 grid gap-4 sm:max-w-2xl">
            <input type="hidden" name="caseId" value={caseId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Název lhůty">
                <TextInput name="title" required />
              </Field>
              <Field label="Typ">
                <SelectInput name="type" defaultValue={DeadlineType.PROCEDURAL}>
                  {Object.values(DeadlineType).map((type) => (
                    <option key={type} value={type}>
                      {deadlineTypeLabels[type]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Termín (datum)">
                <TextInput name="dueDate" type="date" required />
              </Field>
              <Field label="Odpovědný (volitelné)">
                <SelectInput name="responsibleUserId" defaultValue="">
                  <option value="">—</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Událost počátku (volitelné)">
                <TextInput
                  name="originEvent"
                  placeholder="Doručení DS, vyhlášení rozsudku…"
                />
              </Field>
              <Field label="Datum počátku (volitelné)">
                <TextInput name="originDate" type="date" />
              </Field>
              <Field label="Pravidlo výpočtu (poznámka, volitelné)">
                <TextInput name="computedRule" placeholder="+15 dní od doručení" />
              </Field>
            </div>
            <Field label="Poznámka (volitelné)">
              <TextArea name="note" />
            </Field>
            <div>
              <Button type="submit" pendingLabel="Přidávám…">Přidat lhůtu</Button>
            </div>
          </form>
        ) : null}
        <p className="mt-2 text-xs text-stone-400">
          Termín lhůty zadává a potvrzuje advokát — systém lhůty pouze eviduje a
          hlídá, nepočítá je automaticky.
        </p>
      </Section>

      <Section title="Soudní jednání">
        {hearings.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Soud</th>
                  <th>Termín</th>
                  <th>Místnost</th>
                  <th>Odpovědný</th>
                  {canManage ? <th>Akce</th> : null}
                </tr>
              </thead>
              <tbody>
                {hearings.map((hearing) => (
                  <tr key={hearing.id}>
                    <td className="font-medium text-stone-950">{hearing.court}</td>
                    <td>{formatDateTimeUtc(hearing.hearingAt)}</td>
                    <td>{hearing.room ?? "—"}</td>
                    <td>{hearing.responsibleUser?.name ?? "—"}</td>
                    {canManage ? (
                      <td>
                        <form action={cancelCourtHearing}>
                          <input
                            type="hidden"
                            name="hearingId"
                            value={hearing.id}
                          />
                          <ConfirmDialogButton
                            label="Zrušit"
                            title="Zrušit soudní jednání"
                            message="Zrušit toto soudní jednání? Zmizí z kalendáře a přestanou chodit připomínky."
                            confirmLabel="Zrušit jednání"
                            cancelLabel="Ponechat"
                            pendingLabel="Ruším…"
                            variant="ghost"
                          />
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Spis zatím nemá naplánovaná jednání.</EmptyState>
        )}

        {canManage ? (
          <form
            action={createCourtHearing}
            className="mt-4 grid gap-4 sm:max-w-2xl"
          >
            <input type="hidden" name="caseId" value={caseId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Soud">
                <TextInput name="court" required placeholder="Okresní soud v…" />
              </Field>
              <Field label="Termín jednání (datum a čas)">
                <TextInput name="hearingAt" type="datetime-local" required />
              </Field>
              <Field label="Místnost / jednací síň (volitelné)">
                <TextInput name="room" />
              </Field>
              <Field label="Odpovědný (volitelné)">
                <SelectInput name="responsibleUserId" defaultValue="">
                  <option value="">—</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <Field label="Poznámka (volitelné)">
              <TextArea name="note" />
            </Field>
            <div>
              <Button type="submit" pendingLabel="Přidávám…">Přidat jednání</Button>
            </div>
          </form>
        ) : null}
      </Section>
    </>
  );
}
