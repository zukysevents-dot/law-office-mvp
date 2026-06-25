import type { Prisma } from "@/generated/prisma/client";
import {
  ModuleKey,
  ModuleStatus,
  OrganizationMemberStatus,
} from "@/generated/prisma/enums";
import {
  resolveEnabledModules,
  SELLABLE_MODULE_KEYS,
} from "@/lib/entitlements";
import { moduleKeyLabels } from "@/lib/labels";
import { getPrisma } from "@/lib/prisma";

// CORE first, then the sellable modules in catalog order.
const MODULE_DISPLAY_ORDER: ModuleKey[] = [
  ModuleKey.CORE,
  ...SELLABLE_MODULE_KEYS,
];

// Count ACTIVE seats. Pass the transaction client when enforcing the seat limit
// so the count shares the join transaction's locked snapshot (see
// joinOrganization). The full PrismaClient is also assignable here.
export function countActiveMembers(
  client: Prisma.TransactionClient,
  organizationId: string,
): Promise<number> {
  return client.organizationMember.count({
    where: { organizationId, status: OrganizationMemberStatus.ACTIVE },
  });
}

// Everything the org-admin screens render: org, members (with user), join codes,
// and the active-seat count. Shared by /settings/organization and /admin.
export async function getOrganizationAdminData(organizationId: string) {
  const prisma = getPrisma();
  const [organization, members, joinCodes, activeMembers] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.organizationJoinCode.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    }),
    countActiveMembers(prisma, organizationId),
  ]);

  return { organization, members, joinCodes, activeMembers };
}

export type OrganizationModuleView = {
  key: ModuleKey;
  name: string;
  description: string | null;
  requiresKeys: ModuleKey[];
  isCore: boolean;
  status: ModuleStatus;
  trialEndsAt: Date | null;
  enabled: boolean;
};

// Module entitlements + subscription for one org, shaped for the settings/admin
// screens. Built from a static key order so it renders even before the catalog
// is seeded; the DB catalog only enriches name/description/requiresKeys.
export async function getOrganizationEntitlements(organizationId: string) {
  const prisma = getPrisma();
  const [catalog, orgModules, subscription] = await Promise.all([
    prisma.module.findMany(),
    prisma.organizationModule.findMany({ where: { organizationId } }),
    prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    }),
  ]);

  const catalogByKey = new Map(catalog.map((m) => [m.key, m]));
  const stateByKey = new Map(orgModules.map((m) => [m.moduleKey, m]));
  const enabled = resolveEnabledModules(
    orgModules.map((m) => ({
      moduleKey: m.moduleKey,
      status: m.status,
      trialEndsAt: m.trialEndsAt,
    })),
    new Date(),
  );

  const modules: OrganizationModuleView[] = MODULE_DISPLAY_ORDER.map((key) => {
    const meta = catalogByKey.get(key);
    const state = stateByKey.get(key);
    const isCore = meta?.isCore ?? key === ModuleKey.CORE;
    return {
      key,
      name: meta?.name ?? moduleKeyLabels[key],
      description: meta?.description ?? null,
      requiresKeys: meta?.requiresKeys ?? [],
      isCore,
      status: isCore
        ? ModuleStatus.ENABLED
        : state?.status ?? ModuleStatus.DISABLED,
      trialEndsAt: state?.trialEndsAt ?? null,
      enabled: enabled.has(key),
    };
  });

  return { modules, subscription };
}
