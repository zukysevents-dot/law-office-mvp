"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  TaskDeadlineType,
  TaskPriority,
  TaskStatus,
} from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { assertCanArchiveRecords } from "@/lib/archive-permissions";
import { getCurrentUser } from "@/lib/auth";
import {
  enumValue,
  optionalDate,
  optionalString,
  requiredString,
} from "@/lib/form";
import { queueInternalNotification } from "@/lib/notifications/notification-service";
import { assertCanEditRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export async function createTask(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const assignedToId = optionalString(formData, "assignedToId");

  const task = await prisma.task.create({
    data: {
      title: requiredString(formData, "title"),
      projectId: optionalString(formData, "projectId"),
      caseId: optionalString(formData, "caseId"),
      createdById: currentUser.id,
      assignedToId,
      responsibleUserId: optionalString(formData, "responsibleUserId"),
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

  await queueInternalNotification({
    toUserId: assignedToId,
    subject: `Nový úkol: ${task.title}`,
    body: task.shortDescription ?? "",
    entityType: "Task",
    entityId: task.id,
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
        projectId: optionalString(formData, "projectId"),
        caseId: optionalString(formData, "caseId"),
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
      status: true,
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
}

export async function archiveTask(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanArchiveRecords(currentUser);
  const taskId = requiredString(formData, "id");
  const oldTask = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const task = await prisma.task.update({
    where: { id: taskId },
    data: { archivedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Task",
      entityId: task.id,
      action: "ARCHIVE",
      changedById: currentUser.id,
      oldValue: auditJson(oldTask),
      newValue: auditJson(task),
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/tasks/archive");
  revalidatePath("/tasks/my");
  revalidatePath(`/tasks/${task.id}`);
}

export async function restoreTask(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanArchiveRecords(currentUser);
  const taskId = requiredString(formData, "id");
  const oldTask = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const task = await prisma.task.update({
    where: { id: taskId },
    data: { archivedAt: null },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Task",
      entityId: task.id,
      action: "RESTORE",
      changedById: currentUser.id,
      oldValue: auditJson(oldTask),
      newValue: auditJson(task),
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/tasks/archive");
  revalidatePath("/tasks/my");
  revalidatePath(`/tasks/${task.id}`);
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
