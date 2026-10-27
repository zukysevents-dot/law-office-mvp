import type { Prisma } from "@/generated/prisma/client";
import { TaskAssigneeRole } from "@/generated/prisma/enums";

// Lidé na úkolu: zadavatel (createdById), řešitelé (TaskAssignee role ASSIGNEE,
// první = hlavní řešitel, zrcadlený i v Task.assignedToId), dohled (TaskAssignee
// role SUPERVISOR) a odpovědná osoba (responsibleUserId).
//
// Čistý modul bez runtime importu Prisma klienta — sdílí ho server akce,
// stránky, notifikace, permissions.ts i unit testy.
//
// Kompatibilita (expand-only migrace): starší kód zapisuje jen assignedToId,
// proto se assignedToId VŽDY bere jako řešitel (sjednocení s řádky tabulky).
//
// Práva: řešitelé úkol upravují (jako dřív jediný řešitel). Dohled úkol vidí,
// komentuje a mění jeho status a dostává upozornění, ale upravovat ho nemůže.

export const MAX_TASK_PEOPLE = 50;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type TaskPersonRow = { userId: string; role: TaskAssigneeRole };

// Minimum, které potřebují kontroly práv i výběr příjemců notifikací.
export type TaskPeopleRecord = {
  createdById?: string | null;
  assignedToId?: string | null;
  responsibleUserId?: string | null;
  assignees?: ReadonlyArray<{ userId: string; role?: string | null }> | null;
};

// --- Normalizace vstupu z formuláře ----------------------------------------

function cleanIds(values: readonly unknown[], max = MAX_TASK_PEOPLE) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (result.length >= max) {
      break;
    }
    if (typeof value !== "string") {
      continue;
    }
    const id = value.trim();
    if (!ID_PATTERN.test(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

export type TaskPeopleInput = {
  assigneeIds: readonly unknown[];
  supervisorIds: readonly unknown[];
  primaryAssigneeId?: string | null;
  responsibleUserId?: string | null;
  // Starý formulář (jediný select „assignedToId“) — použije se, jen když
  // nepřišel žádný řešitel v novém poli.
  legacyAssignedToId?: string | null;
};

export type NormalizedTaskPeople = {
  // Hlavní řešitel první.
  assigneeIds: string[];
  supervisorIds: string[];
  primaryAssigneeId: string | null;
};

// Jedna role na osobu: řešitel má přednost před dohledem a odpovědná osoba
// se z dohledu vyřazuje (odpovídá za úkol, dohled by byl duplicitní).
export function normalizeTaskPeople(input: TaskPeopleInput): NormalizedTaskPeople {
  let assigneeIds = cleanIds(input.assigneeIds);
  if (assigneeIds.length === 0 && input.legacyAssignedToId) {
    assigneeIds = cleanIds([input.legacyAssignedToId]);
  }

  const requestedPrimary = input.primaryAssigneeId?.trim() ?? "";
  const primaryAssigneeId = assigneeIds.includes(requestedPrimary)
    ? requestedPrimary
    : (assigneeIds[0] ?? null);
  if (primaryAssigneeId) {
    assigneeIds = [
      primaryAssigneeId,
      ...assigneeIds.filter((id) => id !== primaryAssigneeId),
    ];
  }

  const taken = new Set(assigneeIds);
  const responsible = input.responsibleUserId?.trim() || null;
  const supervisorIds = cleanIds(input.supervisorIds).filter(
    (id) => !taken.has(id) && id !== responsible,
  );

  return { assigneeIds, supervisorIds, primaryAssigneeId };
}

// --- Rozdíl mezi uloženým a novým stavem -------------------------------------

export type TaskPeopleDiff = {
  add: TaskPersonRow[];
  remove: TaskPersonRow[];
  changeRole: Array<{ userId: string; from: TaskAssigneeRole; to: TaskAssigneeRole }>;
};

export function diffTaskPeople(
  current: readonly TaskPersonRow[],
  next: { assigneeIds: readonly string[]; supervisorIds: readonly string[] },
): TaskPeopleDiff {
  const wanted = new Map<string, TaskAssigneeRole>();
  for (const id of next.assigneeIds) {
    wanted.set(id, TaskAssigneeRole.ASSIGNEE);
  }
  for (const id of next.supervisorIds) {
    if (!wanted.has(id)) {
      wanted.set(id, TaskAssigneeRole.SUPERVISOR);
    }
  }

  const existing = new Map(current.map((row) => [row.userId, row.role]));
  const add: TaskPersonRow[] = [];
  const remove: TaskPersonRow[] = [];
  const changeRole: TaskPeopleDiff["changeRole"] = [];

  for (const [userId, role] of wanted) {
    const currentRole = existing.get(userId);
    if (!currentRole) {
      add.push({ userId, role });
    } else if (currentRole !== role) {
      changeRole.push({ userId, from: currentRole, to: role });
    }
  }
  for (const row of current) {
    if (!wanted.has(row.userId)) {
      remove.push(row);
    }
  }

  return { add, remove, changeRole };
}

// --- Čtení lidí z načteného úkolu --------------------------------------------

function rowsOf(task: TaskPeopleRecord) {
  return Array.isArray(task.assignees) ? task.assignees : [];
}

// Řešitelé: hlavní (assignedToId) první, pak řádky ASSIGNEE v pořadí přidání.
export function taskAssigneeUserIds(task: TaskPeopleRecord): string[] {
  const ids = new Set<string>();
  if (task.assignedToId) {
    ids.add(task.assignedToId);
  }
  for (const row of rowsOf(task)) {
    if (row.role === TaskAssigneeRole.ASSIGNEE) {
      ids.add(row.userId);
    }
  }
  return [...ids];
}

// Dohled (bez osob, které jsou zároveň řešiteli — řešitel má přednost).
export function taskSupervisorUserIds(task: TaskPeopleRecord): string[] {
  const assignees = new Set(taskAssigneeUserIds(task));
  const ids = new Set<string>();
  for (const row of rowsOf(task)) {
    if (row.role === TaskAssigneeRole.SUPERVISOR && !assignees.has(row.userId)) {
      ids.add(row.userId);
    }
  }
  return [...ids];
}

export function isTaskAssignee(task: TaskPeopleRecord, userId: string) {
  return taskAssigneeUserIds(task).includes(userId);
}

export function isTaskSupervisor(task: TaskPeopleRecord, userId: string) {
  return taskSupervisorUserIds(task).includes(userId);
}

export type TaskPersonView = { id: string; name: string };

export type TaskPeopleView = {
  assignees: Array<TaskPersonView & { primary: boolean }>;
  supervisors: TaskPersonView[];
};

type TaskPeopleDisplayRecord = {
  assignedToId?: string | null;
  assignedTo?: { id?: string; name: string } | null;
  assignees?: ReadonlyArray<{
    userId: string;
    role?: string | null;
    user: { id?: string; name: string };
  }> | null;
};

// Řešitelé a dohled pro zobrazení: sjednocení assignedToId a řádků bez
// duplicit, hlavní řešitel první.
export function taskPeopleFromRecord(task: TaskPeopleDisplayRecord): TaskPeopleView {
  const primaryId = task.assignedTo?.id ?? task.assignedToId ?? null;
  const assignees: TaskPeopleView["assignees"] = [];
  const seen = new Set<string>();

  if (primaryId && task.assignedTo) {
    assignees.push({ id: primaryId, name: task.assignedTo.name, primary: true });
    seen.add(primaryId);
  }
  const rows = Array.isArray(task.assignees) ? task.assignees : [];
  for (const row of rows) {
    if (row.role !== TaskAssigneeRole.ASSIGNEE || seen.has(row.userId)) {
      continue;
    }
    assignees.push({
      id: row.userId,
      name: row.user.name,
      primary: assignees.length === 0,
    });
    seen.add(row.userId);
  }

  const supervisors: TaskPersonView[] = [];
  for (const row of rows) {
    if (row.role !== TaskAssigneeRole.SUPERVISOR || seen.has(row.userId)) {
      continue;
    }
    supervisors.push({ id: row.userId, name: row.user.name });
    seen.add(row.userId);
  }

  return { assignees, supervisors };
}

// „Advokát Demo (hlavní), Koncipient Demo“ — u jediného řešitele bez štítku.
export function formatAssigneeNames(
  assignees: TaskPeopleView["assignees"],
  { markPrimary = true }: { markPrimary?: boolean } = {},
) {
  return assignees
    .map((person) =>
      markPrimary && person.primary && assignees.length > 1
        ? `${person.name} (hlavní)`
        : person.name,
    )
    .join(", ");
}

// --- Příjemci notifikací ---------------------------------------------------
//
// Matice (aktér a duplicity vyřadí uniqueRecipients při zařazení do fronty):
//   nový úkol      — řešitelé, odpovědná osoba | dohled zvlášť (jiný text)
//   změna statusu  — řešitelé, dohled, odpovědná osoba, zadavatel
//   komentář       — řešitelé, dohled, odpovědná osoba, zadavatel
//   blíží se termín — řešitelé, odpovědná osoba
//   po termínu     — řešitelé, dohled, odpovědná osoba
//   po podání      — řešitelé, odpovědná osoba, zadavatel

function unique(ids: ReadonlyArray<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export function taskCreatedRecipients(task: TaskPeopleRecord) {
  const workers = unique([...taskAssigneeUserIds(task), task.responsibleUserId]);
  const taken = new Set(workers);
  return {
    workers,
    supervisors: taskSupervisorUserIds(task).filter((id) => !taken.has(id)),
  };
}

export function taskStatusRecipients(task: TaskPeopleRecord) {
  return unique([
    ...taskAssigneeUserIds(task),
    ...taskSupervisorUserIds(task),
    task.responsibleUserId,
    task.createdById,
  ]);
}

export function taskCommentRecipients(task: TaskPeopleRecord) {
  return taskStatusRecipients(task);
}

export function taskDeadlineSoonRecipients(task: TaskPeopleRecord) {
  return unique([...taskAssigneeUserIds(task), task.responsibleUserId]);
}

export function taskOverdueRecipients(task: TaskPeopleRecord) {
  return unique([
    ...taskAssigneeUserIds(task),
    ...taskSupervisorUserIds(task),
    task.responsibleUserId,
  ]);
}

export function taskFiledRecipients(task: TaskPeopleRecord) {
  return unique([
    ...taskAssigneeUserIds(task),
    task.responsibleUserId,
    task.createdById,
  ]);
}

// --- Prisma where fragmenty --------------------------------------------------

// Úkoly, které uživatel řeší (hlavní i další řešitel).
export function taskAssigneeWhere(userId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      { assignedToId: userId },
      { assignees: { some: { userId, role: TaskAssigneeRole.ASSIGNEE } } },
    ],
  };
}

// Úkoly, na které má uživatel dohled.
export function taskSupervisorWhere(userId: string): Prisma.TaskWhereInput {
  return {
    assignees: { some: { userId, role: TaskAssigneeRole.SUPERVISOR } },
  };
}

// Úkoly, kde je uživatel řešitelem nebo dohledem.
export function taskPersonWhere(userId: string): Prisma.TaskWhereInput {
  return {
    OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }],
  };
}

export const MY_TASK_ROLES = [
  "assignee",
  "supervisor",
  "responsible",
  "created",
] as const;

export type MyTaskRole = (typeof MY_TASK_ROLES)[number];

export function parseMyTaskRole(value: unknown): MyTaskRole | "" {
  return typeof value === "string" &&
    (MY_TASK_ROLES as readonly string[]).includes(value)
    ? (value as MyTaskRole)
    : "";
}

// „Moje úkoly“: konkrétní role, nebo (prázdná) libovolná z nich.
export function myTaskRoleWhere(
  userId: string,
  role: MyTaskRole | "",
): Prisma.TaskWhereInput {
  switch (role) {
    case "assignee":
      return taskAssigneeWhere(userId);
    case "supervisor":
      return taskSupervisorWhere(userId);
    case "responsible":
      return { responsibleUserId: userId };
    case "created":
      return { createdById: userId };
    default:
      return {
        OR: [
          { assignedToId: userId },
          { assignees: { some: { userId } } },
          { responsibleUserId: userId },
          { createdById: userId },
        ],
      };
  }
}

// Role uživatele na úkolu v pořadí Řešitel, Dohled, Odpovědná osoba, Zadavatel.
export function myTaskRoles(task: TaskPeopleRecord, userId: string): MyTaskRole[] {
  const roles: MyTaskRole[] = [];
  if (isTaskAssignee(task, userId)) {
    roles.push("assignee");
  } else if (isTaskSupervisor(task, userId)) {
    roles.push("supervisor");
  }
  if (task.responsibleUserId === userId) {
    roles.push("responsible");
  }
  if (task.createdById === userId) {
    roles.push("created");
  }
  return roles;
}

// --- Selecty -------------------------------------------------------------

// Lidé na úkolu pro zobrazení (řešitelé, dohled). Jen relace, takže jde použít
// v `select` i v `include`. Obsahuje userId + role, takže záznam načtený s tímto
// selectem projde i canEditRecord / canWorkOnTask.
export const taskPeopleSelect = {
  assignedTo: { select: { id: true, name: true } },
  assignees: {
    orderBy: { assignedAt: "asc" },
    select: {
      userId: true,
      role: true,
      user: { select: { id: true, name: true } },
    },
  },
} as const satisfies Prisma.TaskSelect & Prisma.TaskInclude;

// Minimum pro kontroly práv (canEditRecord / canWorkOnTask / canViewRecord).
// KAŽDÉ místo, které nad úkolem volá tyto kontroly, musí načíst i tohle —
// jinak by další řešitel nebo dohled dostal „Nemáte oprávnění“ (fail-closed).
export const taskAccessSelect = {
  assignees: { select: { userId: true, role: true } },
} as const satisfies Prisma.TaskSelect & Prisma.TaskInclude;
