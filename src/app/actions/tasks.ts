"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Prisma } from "@/generated/prisma/client";
import {
  TaskAssigneeRole,
  TaskDeadlineType,
  TaskPriority,
  TaskStatus,
} from "@/generated/prisma/enums";
import { setArchived } from "@/lib/archive";
import { auditCreateData, auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  enumValue,
  optionalDate,
  optionalString,
  requiredString,
  stringList,
} from "@/lib/form";
import {
  queueTaskCommentNotifications,
  queueTaskCreatedNotifications,
  queueTaskPeopleAddedNotifications,
  queueTaskStatusNotifications,
} from "@/lib/notifications/notification-service";
import { resolveVisibleMatterSelection } from "@/lib/matter-integrity.server";
import { assertUserInOrg, assertUsersInOrg } from "@/lib/org-users";
import {
  assertCanEditRecord,
  assertCanWorkOnTask,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { assertCanAccessModule } from "@/lib/module-access.server";
import {
  MAX_TASK_PEOPLE,
  diffTaskPeople,
  normalizeTaskPeople,
  taskAssigneeUserIds,
  taskSupervisorUserIds,
  type NormalizedTaskPeople,
  type TaskPersonRow,
} from "@/lib/tasks/task-people";

type Tx = Prisma.TransactionClient;

// Řešitelé a dohled z formuláře (TaskPeopleFields): opakovaná pole
// assigneeIds (hlavní první) a supervisorIds, primaryAssigneeId. Starý
// formulář s jediným „assignedToId“ (otevřený v prohlížeči během nasazení)
// funguje dál jako jediný řešitel.
function readTaskPeople(
  formData: FormData,
  responsibleUserId: string | null,
): NormalizedTaskPeople {
  return normalizeTaskPeople({
    assigneeIds: stringList(formData, "assigneeIds", MAX_TASK_PEOPLE),
    supervisorIds: stringList(formData, "supervisorIds", MAX_TASK_PEOPLE),
    primaryAssigneeId: optionalString(formData, "primaryAssigneeId"),
    responsibleUserId,
    legacyAssignedToId: optionalString(formData, "assignedToId"),
  });
}

async function userNames(userIds: readonly string[]) {
  if (userIds.length === 0) {
    return new Map<string, string>();
  }
  const users = await getPrisma().user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user.name]));
}

// Zapíše změny řešitelů/dohledu v rámci transakce a každou změnu auditně
// zaznamená (entityType "TaskAssignee", entityId = id úkolu, akce ASSIGN /
// REMOVE / UPDATE). Vrací nově přidané řešitele a dohled (pro notifikace).
async function applyTaskPeople(
  tx: Tx,
  {
    taskId,
    organizationId,
    actorId,
    current,
    next,
    names,
  }: {
    taskId: string;
    organizationId: string;
    actorId: string;
    current: readonly TaskPersonRow[];
    next: NormalizedTaskPeople;
    names: ReadonlyMap<string, string>;
  },
) {
  const diff = diffTaskPeople(current, next);
  const entry = (userId: string, role: TaskAssigneeRole) => ({
    taskId,
    userId,
    userName: names.get(userId) ?? null,
    role,
  });

  if (diff.remove.length > 0) {
    await tx.taskAssignee.deleteMany({
      where: { taskId, userId: { in: diff.remove.map((row) => row.userId) } },
    });
  }
  if (diff.add.length > 0) {
    await tx.taskAssignee.createMany({
      data: diff.add.map((row) => ({
        organizationId,
        taskId,
        userId: row.userId,
        role: row.role,
        assignedById: actorId,
      })),
      skipDuplicates: true,
    });
  }
  for (const change of diff.changeRole) {
    await tx.taskAssignee.updateMany({
      where: { taskId, userId: change.userId },
      data: { role: change.to, assignedById: actorId },
    });
  }

  const audit = [
    ...diff.add.map((row) =>
      auditCreateData({
        organizationId,
        entityType: "TaskAssignee",
        entityId: taskId,
        action: "ASSIGN",
        changedById: actorId,
        newValue: entry(row.userId, row.role),
      }),
    ),
    ...diff.remove.map((row) =>
      auditCreateData({
        organizationId,
        entityType: "TaskAssignee",
        entityId: taskId,
        action: "REMOVE",
        changedById: actorId,
        oldValue: entry(row.userId, row.role),
      }),
    ),
    ...diff.changeRole.map((change) =>
      auditCreateData({
        organizationId,
        entityType: "TaskAssignee",
        entityId: taskId,
        action: "UPDATE",
        changedById: actorId,
        oldValue: entry(change.userId, change.from),
        newValue: entry(change.userId, change.to),
      }),
    ),
  ];
  if (audit.length > 0) {
    await tx.auditLog.createMany({ data: audit });
  }

  const becameRole = (role: TaskAssigneeRole) => [
    ...diff.add.filter((row) => row.role === role).map((row) => row.userId),
    ...diff.changeRole
      .filter((change) => change.to === role)
      .map((change) => change.userId),
  ];
  return {
    addedAssignees: becameRole(TaskAssigneeRole.ASSIGNEE),
    addedSupervisors: becameRole(TaskAssigneeRole.SUPERVISOR),
  };
}

function peopleRows(people: NormalizedTaskPeople): TaskPersonRow[] {
  return [
    ...people.assigneeIds.map((userId) => ({
      userId,
      role: TaskAssigneeRole.ASSIGNEE,
    })),
    ...people.supervisorIds.map((userId) => ({
      userId,
      role: TaskAssigneeRole.SUPERVISOR,
    })),
  ];
}

export async function createTask(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.tasks");
  const responsibleUserId = optionalString(formData, "responsibleUserId");
  const people = readTaskPeople(formData, responsibleUserId);
  const matter = await resolveVisibleMatterSelection(prisma, currentUser, {
    projectId: optionalString(formData, "projectId"),
    caseId: optionalString(formData, "caseId"),
  });

  // Řešitelé, dohled i odpovědná osoba musí patřit do kanceláře volajícího.
  await assertUsersInOrg(
    [...people.assigneeIds, ...people.supervisorIds],
    currentUser.organizationId,
  );
  await assertUserInOrg(responsibleUserId, currentUser.organizationId);
  const names = await userNames([
    ...people.assigneeIds,
    ...people.supervisorIds,
  ]);
  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Nemáte aktivní kancelář.");
  }

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        organizationId,
        title: requiredString(formData, "title"),
        projectId: matter.projectId,
        caseId: matter.caseId,
        createdById: currentUser.id,
        // Hlavní řešitel zůstává i ve sloupci assignedToId (kompatibilita).
        assignedToId: people.primaryAssigneeId,
        responsibleUserId,
        status: TaskStatus.CREATED,
        priority: enumValue(
          TaskPriority,
          formData.get("priority"),
          TaskPriority.STANDARD,
        ),
        deadlineType: enumValue(
          TaskDeadlineType,
          formData.get("deadlineType"),
          TaskDeadlineType.INTERNAL,
        ),
        shortDescription: optionalString(formData, "shortDescription"),
        detailedDescription: optionalString(formData, "detailedDescription"),
        sharepointUrl: optionalString(formData, "sharepointUrl"),
        startDate: optionalDate(formData, "startDate"),
        deadline: optionalDate(formData, "deadline"),
      },
    });

    await applyTaskPeople(tx, {
      taskId: created.id,
      organizationId,
      actorId: currentUser.id,
      current: [],
      next: people,
      names,
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        entityType: "Task",
        entityId: created.id,
        action: "CREATE",
        changedById: currentUser.id,
        newValue: {
          title: created.title,
          status: created.status,
          assignedToId: created.assignedToId,
          assigneeIds: people.assigneeIds,
          supervisorIds: people.supervisorIds,
          responsibleUserId: created.responsibleUserId,
        },
      },
    });

    return created;
  });

  await queueTaskCreatedNotifications({
    task: { ...task, assignees: peopleRows(people) },
    actorUserId: currentUser.id,
  });

  revalidatePath("/tasks");
  revalidatePath("/tasks/my");
  revalidatePath("/dashboard");
  // Redirect na detail nového úkolu — stejný vzor jako createSubject/updateTask.
  // Bez něj uživatel zůstal na /tasks se starým renderem a nový úkol v seznamu
  // vůbec neviděl (revalidatePath na force-dynamic stránce nemá co invalidovat
  // a refresh() se na tuto stránku nedostane spolehlivě).
  redirect(`/tasks/${task.id}`);
}

export async function updateTask(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.tasks");
  const taskId = requiredString(formData, "id");
  const newStatus = enumValue(
    TaskStatus,
    formData.get("status"),
    TaskStatus.CREATED,
  );

  const oldTask = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      assignees: {
        orderBy: { assignedAt: "asc" },
        select: { userId: true, role: true, user: { select: { name: true } } },
      },
    },
  });
  // Řešitelé (i další) úkol upravit smí, dohled ne.
  assertCanEditRecord(currentUser, "Task", oldTask);

  // Re-filing the task must respect visibility — can't move it onto a
  // project/case the user can't see (IDOR guard, mirrors createTask).
  const responsibleUserId = optionalString(formData, "responsibleUserId");
  const people = readTaskPeople(formData, responsibleUserId);
  const matter = await resolveVisibleMatterSelection(prisma, currentUser, {
    projectId: optionalString(formData, "projectId"),
    caseId: optionalString(formData, "caseId"),
  });

  // Řešitelé, dohled i odpovědná osoba musí patřit do kanceláře volajícího.
  // Už uložené osoby se nekontrolují znovu (mohly mezitím odejít — jejich
  // odebrání musí projít), ověřují se jen nově přidaní.
  const currentIds = new Set(oldTask.assignees.map((row) => row.userId));
  if (oldTask.assignedToId) {
    currentIds.add(oldTask.assignedToId);
  }
  await assertUsersInOrg(
    [...people.assigneeIds, ...people.supervisorIds].filter(
      (id) => !currentIds.has(id),
    ),
    currentUser.organizationId,
  );
  if (responsibleUserId !== oldTask.responsibleUserId) {
    await assertUserInOrg(responsibleUserId, currentUser.organizationId);
  }
  const names = await userNames([
    ...people.assigneeIds,
    ...people.supervisorIds,
  ]);
  for (const row of oldTask.assignees) {
    if (!names.has(row.userId)) {
      names.set(row.userId, row.user.name);
    }
  }

  const statusChanged = oldTask.status !== newStatus;
  const completedAt =
    statusChanged && newStatus === TaskStatus.COMPLETED ? new Date() : undefined;
  const shouldClearCompleted =
    statusChanged &&
    oldTask.status === TaskStatus.COMPLETED &&
    newStatus !== TaskStatus.COMPLETED;

  const { task, added } = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data: {
        title: requiredString(formData, "title"),
        projectId: matter.projectId,
        caseId: matter.caseId,
        // Hlavní řešitel zůstává i ve sloupci assignedToId (kompatibilita).
        assignedToId: people.primaryAssigneeId,
        responsibleUserId,
        status: newStatus,
        priority: enumValue(
          TaskPriority,
          formData.get("priority"),
          TaskPriority.STANDARD,
        ),
        deadlineType: enumValue(
          TaskDeadlineType,
          formData.get("deadlineType"),
          TaskDeadlineType.INTERNAL,
        ),
        shortDescription: optionalString(formData, "shortDescription"),
        detailedDescription: optionalString(formData, "detailedDescription"),
        sharepointUrl: optionalString(formData, "sharepointUrl"),
        startDate: optionalDate(formData, "startDate"),
        deadline: optionalDate(formData, "deadline"),
        ...(completedAt
          ? { completedAt, archivedAt: completedAt }
          : shouldClearCompleted
            ? { completedAt: null, archivedAt: null }
            : {}),
      },
    });

    if (statusChanged) {
      await tx.taskStatusHistory.create({
        data: {
          taskId,
          oldStatus: oldTask.status,
          newStatus,
          changedById: currentUser.id,
          note: "Status změněn při editaci úkolu",
        },
      });
    }

    // Rozdíl se počítá proti uloženým řádkům. Hlavní řešitel zapsaný jen
    // starším kódem (assignedToId bez řádku) tu chybí, takže se mu řádek
    // dopíše (ASSIGN) — nová tabulka se tím srovná s assignedToId.
    const peopleChanges = await applyTaskPeople(tx, {
      taskId,
      organizationId: oldTask.organizationId,
      actorId: currentUser.id,
      current: oldTask.assignees.map((row) => ({
        userId: row.userId,
        role: row.role,
      })),
      next: people,
      names,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { assignees: _oldAssignees, ...oldTaskFields } = oldTask;
    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "Task",
        entityId: taskId,
        action: "UPDATE",
        changedById: currentUser.id,
        oldValue: auditJson({
          ...oldTaskFields,
          assigneeIds: taskAssigneeUserIds(oldTask),
          supervisorIds: taskSupervisorUserIds(oldTask),
        }),
        newValue: auditJson({
          ...updated,
          assigneeIds: people.assigneeIds,
          supervisorIds: people.supervisorIds,
        }),
      },
    });

    return { task: updated, added: peopleChanges };
  });

  revalidatePath("/tasks");
  revalidatePath("/tasks/archive");
  revalidatePath("/tasks/my");
  revalidatePath(`/tasks/${task.id}`);

  if (task.projectId) {
    revalidatePath(`/projects/${task.projectId}`);
  }

  if (task.caseId) {
    revalidatePath(`/cases/${task.caseId}`);
  }

  revalidatePath("/dashboard");

  await queueTaskPeopleAddedNotifications({
    task,
    addedAssigneeIds: added.addedAssignees,
    addedSupervisorIds: added.addedSupervisors,
    actorUserId: currentUser.id,
  });

  if (statusChanged) {
    await queueTaskStatusNotifications({
      task: { ...task, assignees: peopleRows(people) },
      oldStatus: oldTask.status,
      newStatus,
      actorUserId: currentUser.id,
    });
  }

  redirect(`/tasks/${task.id}`);
}

export async function updateTaskStatus(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.tasks");
  const taskId = requiredString(formData, "taskId");
  const newStatus = enumValue(
    TaskStatus,
    formData.get("status"),
    TaskStatus.CREATED,
  );
  const note = optionalString(formData, "note");

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      title: true,
      createdById: true,
      assignedToId: true,
      responsibleUserId: true,
      assignees: { select: { userId: true, role: true } },
    },
  });
  // Status smí měnit každý, kdo úkol upravuje, a navíc dohled.
  assertCanWorkOnTask(currentUser, task);

  if (task.status === newStatus) {
    return;
  }

  const completedAt = newStatus === TaskStatus.COMPLETED ? new Date() : null;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: task.id },
      data: {
        status: newStatus,
        completedAt,
        archivedAt: completedAt,
      },
    });

    await tx.taskStatusHistory.create({
      data: {
        taskId: task.id,
        oldStatus: task.status,
        newStatus,
        changedById: currentUser.id,
        note,
      },
    });

    if (note) {
      await tx.taskComment.create({
        data: {
          taskId: task.id,
          authorId: currentUser.id,
          comment: note,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "Task",
        entityId: task.id,
        action: "STATUS_CHANGE",
        changedById: currentUser.id,
        oldValue: { status: task.status },
        newValue: { status: newStatus, note },
      },
    });
  });

  revalidatePath("/tasks");
  revalidatePath("/tasks/archive");
  revalidatePath("/tasks/my");
  revalidatePath(`/tasks/${task.id}`);
  revalidatePath("/dashboard");

  // Poznámka ke změně jde do e-mailu o změně statusu (žádný druhý e-mail
  // o komentáři).
  await queueTaskStatusNotifications({
    task,
    oldStatus: task.status,
    newStatus,
    actorUserId: currentUser.id,
    note,
  });
}

async function setTaskArchived(formData: FormData, archived: boolean) {
  const prisma = getPrisma();
  const task = await setArchived(formData, "Task", archived, {
    find: (id) => prisma.task.findUniqueOrThrow({ where: { id } }),
    update: (id, data) => prisma.task.update({ where: { id }, data }),
  });
  revalidatePath("/tasks");
  revalidatePath("/tasks/archive");
  revalidatePath("/tasks/my");
  revalidatePath(`/tasks/${task.id}`);
}

export async function archiveTask(formData: FormData) {
  await setTaskArchived(formData, true);
}

export async function restoreTask(formData: FormData) {
  await setTaskArchived(formData, false);
}

export async function addTaskComment(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.tasks");
  const taskId = requiredString(formData, "taskId");
  const comment = requiredString(formData, "comment");
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      organizationId: true,
      createdById: true,
      assignedToId: true,
      responsibleUserId: true,
      assignees: { select: { userId: true, role: true } },
    },
  });
  // Komentovat smí každý, kdo úkol upravuje, a navíc dohled.
  assertCanWorkOnTask(currentUser, task);

  await prisma.taskComment.create({
    data: {
      taskId,
      authorId: currentUser.id,
      comment,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: currentUser.organizationId,
      entityType: "TaskComment",
      entityId: taskId,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: { taskId, comment },
    },
  });

  await queueTaskCommentNotifications({
    task,
    actorUserId: currentUser.id,
    authorName: currentUser.name,
    comment,
  });

  revalidatePath(`/tasks/${taskId}`);
}
