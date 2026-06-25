import {
  cancelCourtHearing,
  cancelDeadline,
  completeDeadline,
  createCourtHearing,
  createDeadline,
} from "@/app/actions/deadlines";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DeadlineType } from "@/generated/prisma/enums";
import { formatDateTime, formatDateUtc } from "@/lib/format";
import { deadlineStatusLabels, deadlineTypeLabels } from "@/lib/labels";
import { deadlineStatusTone, deadlineTypeTone } from "@/lib/status-tones";

type DeadlineRow = {
  id: string;
  type: DeadlineType;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  title: string;
  dueDate: Date;
  responsibleUser: { name: string } | null;
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
  hearings,
  members,
  canManage,
}: {
  caseId: string;
  deadlines: DeadlineRow[];
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
                      </td>
                      <td>{deadline.responsibleUser?.name ?? "—"}</td>
                      {canManage ? (
                        <td>
                          {deadline.status === "OPEN" ? (
                            <div className="flex gap-2">
                              <form action={completeDeadline}>
                                <input
                                  type="hidden"
                                  name="deadlineId"
                                  value={deadline.id}
                                />
                                <Button type="submit" variant="secondary">
                                  Splnit
                                </Button>
                              </form>
                              <form action={cancelDeadline}>
                                <input
                                  type="hidden"
                                  name="deadlineId"
                                  value={deadline.id}
                                />
                                <Button type="submit" variant="ghost">
                                  Zrušit
                                </Button>
                              </form>
                            </div>
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
              <Button type="submit">Přidat lhůtu</Button>
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
                    <td>{formatDateTime(hearing.hearingAt)}</td>
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
                          <Button type="submit" variant="ghost">
                            Zrušit
                          </Button>
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
              <Button type="submit">Přidat jednání</Button>
            </div>
          </form>
        ) : null}
      </Section>
    </>
  );
}
