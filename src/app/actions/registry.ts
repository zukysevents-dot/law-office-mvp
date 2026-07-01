"use server";

import { revalidatePath } from "next/cache";

import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import { assertCanEditRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { runRegistryCheckForSubject } from "@/lib/registry/registry-monitor-service";

// Toggle registry monitoring for a subject. Gated by edit rights on the subject
// (org isolation enforced by assertCanEditRecord).
export async function setSubjectRegistryWatch(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const subjectId = requiredString(formData, "subjectId");
  const enabled = requiredString(formData, "enabled") === "true";

  const subject = await prisma.subject.findUniqueOrThrow({
    where: { id: subjectId },
  });
  assertCanEditRecord(currentUser, "Subject", subject);

  if (subject.registryWatchEnabled !== enabled) {
    await prisma.subject.update({
      where: { id: subjectId },
      data: { registryWatchEnabled: enabled },
    });
    await prisma.auditLog.create({
      data: {
        entityType: "Subject",
        entityId: subjectId,
        action: "REGISTRY_WATCH",
        changedById: currentUser.id,
        newValue: auditJson({ registryWatchEnabled: enabled }),
      },
    });
  }

  revalidatePath(`/subjects/${subjectId}`);
}

// On-demand re-check of one subject against ARES/registry (the "Zkontrolovat teď"
// button). Gated by edit rights; the runner core does the fetch + diff + notify.
export async function checkSubjectRegistryNow(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const subjectId = requiredString(formData, "subjectId");

  const subject = await prisma.subject.findUniqueOrThrow({
    where: { id: subjectId },
  });
  assertCanEditRecord(currentUser, "Subject", subject);

  // Fire the check; the refreshed page reflects any detected change. The form
  // action returns void (Next requires void-compatible server actions).
  await runRegistryCheckForSubject(subjectId);

  revalidatePath(`/subjects/${subjectId}`);
  revalidatePath("/registry");
}

// Acknowledge a detected registry change (clears it from the watchlist). Gated
// by edit rights on the change's subject.
export async function acknowledgeRegistryChange(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const eventId = requiredString(formData, "eventId");

  const event = await prisma.registryChangeEvent.findUniqueOrThrow({
    where: { id: eventId },
    include: { subject: true },
  });
  assertCanEditRecord(currentUser, "Subject", event.subject);

  if (!event.acknowledgedAt) {
    await prisma.registryChangeEvent.update({
      where: { id: eventId },
      data: { acknowledgedAt: new Date(), acknowledgedById: currentUser.id },
    });
    await prisma.auditLog.create({
      data: {
        entityType: "Subject",
        entityId: event.subjectId,
        action: "REGISTRY_ACK",
        changedById: currentUser.id,
        newValue: auditJson({ eventId, changeType: event.changeType }),
      },
    });
  }

  revalidatePath(`/subjects/${event.subjectId}`);
  revalidatePath("/registry");
}
