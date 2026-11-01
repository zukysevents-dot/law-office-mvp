import type { Prisma } from "@/generated/prisma/client";

// Práce → Zpětná vazba: čistá logika bez DB (filtry, odkazy, popisky výběrů).
// Kdo co vidí, určuje workFeedbackVisibilityWhere v src/lib/permissions.ts;
// filtry tady viditelnost jen dál zužují.

export const WORK_FEEDBACK_VIEWS = ["all", "received", "given"] as const;
export type WorkFeedbackView = (typeof WORK_FEEDBACK_VIEWS)[number];

export const workFeedbackViewLabels: Record<WorkFeedbackView, string> = {
  all: "Vše",
  received: "Pro mě",
  given: "Ode mě",
};

export function workFeedbackViewValue(
  value: string | null | undefined,
): WorkFeedbackView {
  return (WORK_FEEDBACK_VIEWS as readonly string[]).includes(value ?? "")
    ? (value as WorkFeedbackView)
    : "all";
}

// Zúžení podle záložky. „Vše“ = vše, co uživatel smí vidět (nic nepřidává).
export function workFeedbackViewWhere(
  view: WorkFeedbackView,
  userId: string,
): Prisma.WorkFeedbackWhereInput {
  if (view === "received") {
    return { recipientId: userId };
  }
  if (view === "given") {
    return { authorId: userId };
  }
  return {};
}

export type FeedbackLinkTarget = { id: string; label: string };

export type FeedbackLinkView =
  | { kind: "task"; href: string; label: string }
  | { kind: "workLog"; href: string; label: string }
  | { kind: "hidden"; label: string };

// Odkazy zpětné vazby pro konkrétního čtenáře. `visibleTasks` / `visibleWorkLogs`
// obsahují JEN záznamy, které čtenář smí vidět (načtené přes
// taskVisibilityWhere / workLogVisibilityWhere). Cizí záznam se ukáže jen jako
// „bez přístupu“ — bez názvu, popisu i odkazu, aby zpětná vazba neprozradila
// obsah, ke kterému čtenář nemá přístup. Smazaný (null) odkaz se vynechá.
export function feedbackLinksFor(
  feedback: { taskId: string | null; workLogId: string | null },
  visibleTasks: ReadonlyMap<string, FeedbackLinkTarget>,
  visibleWorkLogs: ReadonlyMap<string, FeedbackLinkTarget>,
): FeedbackLinkView[] {
  const links: FeedbackLinkView[] = [];
  if (feedback.taskId) {
    const task = visibleTasks.get(feedback.taskId);
    links.push(
      task
        ? { kind: "task", href: `/tasks/${task.id}`, label: task.label }
        : { kind: "hidden", label: "Úkol (bez přístupu)" },
    );
  }
  if (feedback.workLogId) {
    const workLog = visibleWorkLogs.get(feedback.workLogId);
    links.push(
      workLog
        ? { kind: "workLog", href: `/work-logs/${workLog.id}`, label: workLog.label }
        : { kind: "hidden", label: "Výkaz práce (bez přístupu)" },
    );
  }
  return links;
}

const OPTION_DESCRIPTION_MAX = 60;

export function truncateOptionText(
  text: string | null | undefined,
  max = OPTION_DESCRIPTION_MAX,
): string {
  const single = (text ?? "").replace(/\s+/g, " ").trim();
  if (single.length <= max) {
    return single;
  }
  return `${single.slice(0, max - 1).trimEnd()}…`;
}

// Popisek výkazu ve výběru i v odkazu: „21. 10. 2026 · Jan Novák · 1,5 h · popis“.
export function workLogOptionLabel(workLog: {
  workDateLabel: string;
  hoursLabel: string;
  userName: string | null;
  description: string | null;
}): string {
  return [
    workLog.workDateLabel,
    workLog.userName ?? "—",
    workLog.hoursLabel,
    truncateOptionText(workLog.description),
  ]
    .filter(Boolean)
    .join(" · ");
}

export type FeedbackPickOption = {
  id: string;
  label: string;
  // Lidé, kterých se záznam týká (řešitel/zadavatel úkolu, autor výkazu).
  userIds: string[];
};

// Rozdělí nabídku úkolů / výkazů na ty, které se týkají vybraného příjemce,
// a ostatní (pořadí zachová). Bez příjemce je vše „ostatní“.
export function splitOptionsForRecipient<T extends FeedbackPickOption>(
  options: readonly T[],
  recipientId: string | null | undefined,
): { recipient: T[]; other: T[] } {
  const recipient: T[] = [];
  const other: T[] = [];
  for (const option of options) {
    if (recipientId && option.userIds.includes(recipientId)) {
      recipient.push(option);
    } else {
      other.push(option);
    }
  }
  return { recipient, other };
}
