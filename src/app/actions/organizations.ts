"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ModuleKey,
  ModuleStatus,
  OrganizationMemberStatus,
  OrganizationStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { getAuthUser } from "@/lib/auth";
import {
  canEnableModule,
  dependentsBlockingDisable,
  MODULE_DEPENDENCIES,
  resolveEnabledModules,
} from "@/lib/entitlements";
import {
  enumValue,
  optionalDate,
  optionalNumber,
  optionalString,
  requiredString,
} from "@/lib/form";
import { generateCode, hashCode } from "@/lib/join-code";
import { moduleKeyLabels } from "@/lib/labels";
import { countActiveMembers } from "@/lib/organization";
import {
  assertCanAdministerOrg,
  assertPlatformAdmin,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

const TRIAL_DEFAULT_DAYS = 30;

// Thrown inside the join transaction to roll back and report a generic reason
// without leaking which specific check failed.
class JoinError extends Error {
  constructor(public code: "INVALID" | "FULL" | "ALREADY") {
    super(code);
  }
}

// Resolves the acting user for an org-admin action and authorizes them for the
// target org. Works for BOTH a platform admin (any org, no membership) and an
// org-level ADMIN/PARTNER acting within their own org.
async function authorizeOrgAction(targetOrgId: string) {
  const user = await getAuthUser();
  if (user.isPlatformAdmin) {
    return user;
  }

  const prisma = getPrisma();
  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId: user.id,
      status: OrganizationMemberStatus.ACTIVE,
      organization: { is: { status: OrganizationStatus.ACTIVE } },
    },
    select: { organizationId: true, role: true },
  });

  const actor = {
    ...user,
    role: membership?.role ?? user.role,
    organizationId: membership?.organizationId ?? null,
  };
  assertCanAdministerOrg(actor, targetOrgId);
  return actor;
}

// --- Join flow (self-service, run by the joining user) -----------------------

export async function joinOrganization(formData: FormData) {
  const user = await getAuthUser();
  const prisma = getPrisma();
  const rawCode = requiredString(formData, "code");
  const name = optionalString(formData, "name");
  const codeHash = hashCode(rawCode);

  // Single active org per user this phase: if already a member, just go in.
  const existingActive = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: OrganizationMemberStatus.ACTIVE },
  });
  if (existingActive) {
    redirect("/dashboard");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const code = await tx.organizationJoinCode.findUnique({ where: { codeHash } });
      const now = new Date();
      const codeValid =
        code &&
        code.isActive &&
        !code.revokedAt &&
        (!code.expiresAt || code.expiresAt > now) &&
        (code.maxUses === null || code.usedCount < code.maxUses);
      if (!code || !codeValid) {
        throw new JoinError("INVALID");
      }

      // Lock the org row so two people can't claim the last seat at once.
      // ponytail: per-org row lock — ample for this scale.
      await tx.$queryRaw`SELECT id FROM "organizations" WHERE id = ${code.organizationId} FOR UPDATE`;

      const org = await tx.organization.findUnique({
        where: { id: code.organizationId },
      });
      if (!org || org.status !== OrganizationStatus.ACTIVE) {
        throw new JoinError("INVALID");
      }

      const existing = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId: org.id, userId: user.id },
        },
      });
      if (existing && existing.status === OrganizationMemberStatus.ACTIVE) {
        throw new JoinError("ALREADY");
      }

      const activeCount = await countActiveMembers(tx, org.id);
      if (activeCount >= org.seatLimit) {
        throw new JoinError("FULL");
      }

      if (existing) {
        await tx.organizationMember.update({
          where: { id: existing.id },
          data: {
            status: OrganizationMemberStatus.ACTIVE,
            role: UserRole.LAWYER,
            deactivatedAt: null,
            joinedAt: now,
            approvedAt: now,
          },
        });
      } else {
        await tx.organizationMember.create({
          data: {
            organizationId: org.id,
            userId: user.id,
            role: UserRole.LAWYER,
            status: OrganizationMemberStatus.ACTIVE,
            approvedAt: now,
          },
        });
      }

      // Keep the global User.role in sync with the org role (single-org phase).
      await tx.user.update({
        where: { id: user.id },
        data: { role: UserRole.LAWYER, ...(name ? { name } : {}) },
      });

      await tx.organizationJoinCode.update({
        where: { id: code.id },
        data: { usedCount: { increment: 1 } },
      });

      await tx.auditLog.create({
        data: {
          entityType: "OrganizationMember",
          entityId: org.id,
          action: "JOIN",
          changedById: user.id,
          newValue: { organizationId: org.id, role: UserRole.LAWYER },
        },
      });
    });
  } catch (error) {
    if (error instanceof JoinError) {
      redirect(`/join-organization?error=${error.code}`);
    }
    throw error;
  }

  redirect("/dashboard");
}

// --- Join codes (org admin or platform admin) --------------------------------

export type CreateJoinCodeState = {
  ok: boolean;
  // Plaintext code shown exactly once, right after creation.
  code?: string;
  label?: string;
  error?: string;
};

export async function createJoinCode(
  _prev: CreateJoinCodeState,
  formData: FormData,
): Promise<CreateJoinCodeState> {
  const organizationId = requiredString(formData, "organizationId");
  const actor = await authorizeOrgAction(organizationId);
  const prisma = getPrisma();

  const label = requiredString(formData, "label");
  const maxUses = optionalNumber(formData, "maxUses");
  const expiresAt = optionalDate(formData, "expiresAt");

  const plaintext = generateCode();

  await prisma.organizationJoinCode.create({
    data: {
      organizationId,
      codeHash: hashCode(plaintext),
      label,
      maxUses: maxUses && maxUses > 0 ? Math.floor(maxUses) : null,
      expiresAt,
      createdByUserId: actor.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "OrganizationJoinCode",
      entityId: organizationId,
      action: "CREATE",
      changedById: actor.id,
      newValue: { label, maxUses: maxUses ?? null },
    },
  });

  revalidatePath("/settings/organization");
  revalidatePath(`/admin/organizations/${organizationId}`);

  return { ok: true, code: plaintext, label };
}

export async function revokeJoinCode(formData: FormData) {
  const organizationId = requiredString(formData, "organizationId");
  const actor = await authorizeOrgAction(organizationId);
  const prisma = getPrisma();
  const codeId = requiredString(formData, "codeId");

  const code = await prisma.organizationJoinCode.findUnique({
    where: { id: codeId },
  });
  if (!code || code.organizationId !== organizationId) {
    throw new Error("Registrační kód nenalezen.");
  }

  await prisma.organizationJoinCode.update({
    where: { id: codeId },
    data: { isActive: false, revokedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "OrganizationJoinCode",
      entityId: organizationId,
      action: "REVOKE",
      changedById: actor.id,
      oldValue: { label: code.label },
    },
  });

  revalidatePath("/settings/organization");
  revalidatePath(`/admin/organizations/${organizationId}`);
}

// --- Members (org admin or platform admin) -----------------------------------

export async function changeMemberRole(formData: FormData) {
  const organizationId = requiredString(formData, "organizationId");
  const actor = await authorizeOrgAction(organizationId);
  const prisma = getPrisma();
  const memberId = requiredString(formData, "memberId");
  const role = enumValue(UserRole, formData.get("role"), UserRole.LAWYER);

  const member = await prisma.organizationMember.findUnique({
    where: { id: memberId },
  });
  if (!member || member.organizationId !== organizationId) {
    throw new Error("Člen nenalezen.");
  }
  if (member.userId === actor.id) {
    throw new Error("Nemůžete změnit vlastní roli.");
  }

  await prisma.$transaction([
    prisma.organizationMember.update({
      where: { id: memberId },
      data: { role },
    }),
    // Keep the global role in sync (single-org phase).
    prisma.user.update({ where: { id: member.userId }, data: { role } }),
    prisma.auditLog.create({
      data: {
        entityType: "OrganizationMember",
        entityId: organizationId,
        action: "ROLE_CHANGE",
        changedById: actor.id,
        oldValue: { userId: member.userId, role: member.role },
        newValue: { userId: member.userId, role },
      },
    }),
  ]);

  revalidatePath("/settings/organization");
  revalidatePath(`/admin/organizations/${organizationId}`);
}

export async function deactivateMember(formData: FormData) {
  const organizationId = requiredString(formData, "organizationId");
  const actor = await authorizeOrgAction(organizationId);
  const prisma = getPrisma();
  const memberId = requiredString(formData, "memberId");

  const member = await prisma.organizationMember.findUnique({
    where: { id: memberId },
  });
  if (!member || member.organizationId !== organizationId) {
    throw new Error("Člen nenalezen.");
  }
  if (member.userId === actor.id) {
    throw new Error("Nemůžete deaktivovat sami sebe.");
  }

  // Soft deactivate only — never hard delete legal-team membership.
  await prisma.organizationMember.update({
    where: { id: memberId },
    data: {
      status: OrganizationMemberStatus.SUSPENDED,
      deactivatedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "OrganizationMember",
      entityId: organizationId,
      action: "DEACTIVATE",
      changedById: actor.id,
      oldValue: { userId: member.userId, status: member.status },
      newValue: { userId: member.userId, status: OrganizationMemberStatus.SUSPENDED },
    },
  });

  revalidatePath("/settings/organization");
  revalidatePath(`/admin/organizations/${organizationId}`);
}

// --- Organizations (platform admin only) -------------------------------------

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (č -> c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createOrganization(formData: FormData) {
  const user = await getAuthUser();
  assertPlatformAdmin(user);
  const prisma = getPrisma();

  const name = requiredString(formData, "name");
  const slug = slugify(optionalString(formData, "slug") ?? name);
  const seatLimit = optionalNumber(formData, "seatLimit");

  if (!slug) {
    throw new Error("Neplatný identifikátor kanceláře.");
  }

  const created = await prisma.organization.create({
    data: {
      name,
      slug,
      seatLimit: seatLimit && seatLimit > 0 ? Math.floor(seatLimit) : 0,
      status: OrganizationStatus.ACTIVE,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Organization",
      entityId: created.id,
      action: "CREATE",
      changedById: user.id,
      newValue: { name, slug, seatLimit: created.seatLimit },
    },
  });

  revalidatePath("/admin");
  redirect(`/admin/organizations/${created.id}`);
}

export async function updateOrganization(formData: FormData) {
  const user = await getAuthUser();
  assertPlatformAdmin(user);
  const prisma = getPrisma();

  const organizationId = requiredString(formData, "organizationId");
  const seatLimit = optionalNumber(formData, "seatLimit");
  const status = enumValue(
    OrganizationStatus,
    formData.get("status"),
    OrganizationStatus.ACTIVE,
  );

  const old = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      seatLimit:
        seatLimit !== null && seatLimit >= 0 ? Math.floor(seatLimit) : old.seatLimit,
      status,
      archivedAt: status === OrganizationStatus.ARCHIVED ? new Date() : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Organization",
      entityId: organizationId,
      action: "UPDATE",
      changedById: user.id,
      oldValue: { seatLimit: old.seatLimit, status: old.status },
      newValue: { seatLimit: updated.seatLimit, status: updated.status },
    },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/organizations/${organizationId}`);
}

// --- Module entitlements (platform admin only) -------------------------------
// Enables/disables/trials one module for an org. Enforces the requiresKeys
// dependency graph so entitlements never become inconsistent (e.g. portal
// without documents). This is the only place that mutates OrganizationModule.
export async function setOrganizationModule(formData: FormData) {
  const user = await getAuthUser();
  assertPlatformAdmin(user);
  const prisma = getPrisma();

  const organizationId = requiredString(formData, "organizationId");
  const moduleKey = enumValue(ModuleKey, formData.get("moduleKey"), ModuleKey.CORE);
  const status = enumValue(
    ModuleStatus,
    formData.get("status"),
    ModuleStatus.DISABLED,
  );

  if (moduleKey === ModuleKey.CORE) {
    throw new Error("Jádro je vždy aktivní a nelze ho měnit.");
  }

  const now = new Date();
  const willEnable =
    status === ModuleStatus.ENABLED || status === ModuleStatus.TRIAL;
  const trialEndsAt =
    status === ModuleStatus.TRIAL
      ? optionalDate(formData, "trialEndsAt") ??
        new Date(now.getTime() + TRIAL_DEFAULT_DAYS * 24 * 60 * 60 * 1000)
      : null;

  // Validate the dependency graph and write in one transaction, locking the org
  // row so concurrent toggles can't each validate against a stale snapshot and
  // leave entitlements inconsistent (same row-lock pattern as joinOrganization).
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "organizations" WHERE id = ${organizationId} FOR UPDATE`;

    const org = await tx.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new Error("Kancelář nenalezena.");
    }

    const existing = await tx.organizationModule.findMany({
      where: { organizationId },
    });
    const enabledNow = resolveEnabledModules(
      existing.map((m) => ({
        moduleKey: m.moduleKey,
        status: m.status,
        trialEndsAt: m.trialEndsAt,
      })),
      now,
    );

    if (willEnable) {
      if (!canEnableModule(moduleKey, enabledNow)) {
        const missing = (MODULE_DEPENDENCIES[moduleKey] ?? [])
          .filter((dep) => !enabledNow.has(dep))
          .map((dep) => moduleKeyLabels[dep]);
        throw new Error(
          `Nejdříve aktivujte závislé moduly: ${missing.join(", ")}.`,
        );
      }
    } else {
      const blockers = dependentsBlockingDisable(moduleKey, enabledNow);
      if (blockers.length > 0) {
        throw new Error(
          `Modul nelze deaktivovat — závisí na něm: ${blockers
            .map((key) => moduleKeyLabels[key])
            .join(", ")}.`,
        );
      }
    }

    const previous = existing.find((m) => m.moduleKey === moduleKey);

    await tx.organizationModule.upsert({
      where: { organizationId_moduleKey: { organizationId, moduleKey } },
      update: {
        status,
        trialEndsAt,
        enabledAt: willEnable ? previous?.enabledAt ?? now : previous?.enabledAt,
        disabledAt: willEnable ? null : now,
      },
      create: {
        organizationId,
        moduleKey,
        status,
        trialEndsAt,
        enabledAt: willEnable ? now : null,
        disabledAt: willEnable ? null : now,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "OrganizationModule",
        entityId: organizationId,
        action: "MODULE_CHANGE",
        changedById: user.id,
        oldValue: {
          moduleKey,
          status: previous?.status ?? ModuleStatus.DISABLED,
          trialEndsAt: previous?.trialEndsAt?.toISOString() ?? null,
        },
        newValue: {
          moduleKey,
          status,
          trialEndsAt: trialEndsAt?.toISOString() ?? null,
        },
      },
    });
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/organizations/${organizationId}`);
  revalidatePath("/settings/organization");
}
