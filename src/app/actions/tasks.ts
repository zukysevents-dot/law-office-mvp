"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  TaskDeadlineType,
  TaskPriority,
  TaskStatus,
} from "@/generated/prisma/enums";
import { setArchived } from "@/lib/archive";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  enumValue,
  optionalDate,
  optionalString,
  requiredString,
} from "@/lib/form";
import {
  queueTaskCreatedNotifications,
  queueTaskStatusNotifications,
} from "@/lib/notifications/notification-service";
import {
  andWhere,
  assertCanEditRecord,
  caseVisibilityWhere,
  projectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export async function createTask(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const assignedToId = optionalString(formData, "assignedToId");
  const responsibleUserId = optionalString(formData, "responsibleUserId");
  const projectId = optionalString(formData, "projectId");
  const caseId = optionalString(formData, "caseId");

  // A task can't be filed under a project/case the user can't see.
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: andWhere({ id: projectId }, projectVisibilityWhere(currentUser)),
      select: { id: true },
    });
    if (!project) {
      throw new Error("Projekt nenalezen nebo k němu nemáte oprávnění.");
    }
  }
  if (caseId) {
    const legalCase = await prisma.case.findFirst({
      where: andWhere({ id: caseId }, caseVisibilityWhere(currentUser)),
      select: { id: true },
    });
    if (!legalCase) {
      throw new Error("Případ nenalezen nebo k němu nemáte oprávnění.");
    }
  }

  const task = await prisma.task.create({
    data: {
      organizationId: currentUser.organizationId,
      title: requiredString(formData, "title"),
      projectId,
      caseId,
      createdById: currentUser.id,
      assignedToId,
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

  await prisma.auditLog.create({
    data: {
      entityType: "Task",
      entityId: task.id,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: {
        title: task.title,
        status: task.status,
        assignedToId: task.assignedToId,
        responsibleUserId: task.responsibleUserId,
      },
    },
  });

  await queueTaskCreatedNotifications({
    task,
    actorUserId: currentUser.id,
  });

  revalidatePath("/tasks");
  revalidatePath("/tasks/my");
}

export async function updateTask(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const taskId = requiredString(formData, "id");
  const newStatus = enumValue(
    TaskStatus,
    formData.get("status"),
    TaskStatus.CREATED,
  );

  const oldTask = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
  });
  assertCanEditRecord(currentUser, "Task", oldTask);

  // Re-filing the task must respect visibility — can't move it onto a
  // project/case the user can't see (IDOR guard, mirrors createTask).
  const projectId = optionalString(formData, "projectId");
  const caseId = optionalString(formData, "caseId");
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: andWhere({ id: projectId }, projectVisibilityWhere(currentUser)),
      select: { id: true },
    });
    if (!project) {
      throw new Error("Projekt nenalezen nebo k němu nemáte oprávnění.");
    }
  }
  if (caseId) {
    const legalCase = await prisma.case.findFirst({
      where: andWhere({ id: caseId }, caseVisibilityWhere(currentUser)),
      select: { id: true },
    });
    if (!legalCase) {
      throw new Error("Případ nenalezen nebo k němu nemáte oprávnění.");
    }
  }

  const statusChanged = oldTask.status !== newStatus;
  const completedAt =
    statusChanged && newStatus === TaskStatus.COMPLETED ? new Date() : undefined;
  const shouldClearCompleted =
    statusChanged &&
    oldTask.status === TaskStatus.COMPLETED &&
    newStatus !== TaskStatus.COMPLETED;

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data: {
        title: requiredString(formData, "title"),
        projectId,
        caseId,
        assignedToId: optionalString(formData, "assignedToId"),
        responsibleUserId: optionalString(formData, "responsibleUserId"),
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

    await tx.auditLog.create({
      data: {
        entityType: "Task",
        entityId: taskId,
        action: "UPDATE",
        changedById: currentUser.id,
        oldValue: auditJson(oldTask),
        newValue: auditJson(updated),
      },
    });

    return updated;
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

  if (statusChanged) {
    await queueTaskStatusNotifications({
      task,
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
    },
  });
  assertCanEditRecord(currentUser, "Task", task);

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

  await queueTaskStatusNotifications({
    task,
    oldStatus: task.status,
    newStatus,
    actorUserId: currentUser.id,
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
  const taskId = requiredString(formData, "taskId");
  const comment = requiredString(formData, "comment");
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      id: true,
      organizationId: true,
      createdById: true,
      assignedToId: true,
      responsibleUserId: true,
    },
  });
  assertCanEditRecord(currentUser, "Task", task);

  await prisma.taskComment.create({
    data: {
      taskId,
      authorId: currentUser.id,
      comment,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "TaskComment",
      entityId: taskId,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: { taskId, comment },
    },
  });

  revalidatePath(`/tasks/${taskId}`);
}
