"use server";

import { revalidatePath } from "next/cache";

import {
  HrNewsAudience,
  OrganizationMemberStatus,
  type UserRole,
} from "@/generated/prisma/enums";
import { auditJson, writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  checkboxValue,
  optionalDate,
  optionalString,
  requiredString,
  stringList,
} from "@/lib/form";
import {
  NEWS_MAX_RECIPIENTS,
  normalizeNewsBody,
  parseNewsAudience,
  validateNewsText,
} from "@/lib/hr/news";
import { assertCanAccessModule } from "@/lib/module-access.server";
import {
  andWhere,
  assertCanManageHrNews,
  hrNewsVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// Aktuality v HR: zveřejnění, úprava, archivace a obnovení. Vše vyžaduje modul
// HR (oprávnění ∧ modul kanceláře) a funkci „Přidává aktuality“.

export type HrNewsFormState = {
  ok: boolean;
  message?: string;
  error?: string;
  // Mění se při každém odeslání — klient podle ní vyprázdní formulář.
  version: number;
};

function done(message: string): HrNewsFormState {
  return { ok: true, message, version: Date.now() };
}

function failed(error: unknown): HrNewsFormState {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Uložení se nezdařilo.",
    version: Date.now(),
  };
}

async function authorize() {
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.hr");
  assertCanManageHrNews(currentUser);
  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Chybí organizace.");
  }
  return { currentUser, organizationId };
}

function revalidateNews() {
  revalidatePath("/hr/news");
  revalidatePath("/dashboard");
}

type ParsedNews = {
  title: string;
  body: string;
  audience: HrNewsAudience;
  roles: UserRole[];
  userIds: string[];
  pinned: boolean;
  visibleUntil: Date | null;
};

async function parseNewsForm(
  formData: FormData,
  organizationId: string,
): Promise<ParsedNews> {
  const title = optionalString(formData, "title");
  const rawBody = formData.get("body");
  const body = normalizeNewsBody(typeof rawBody === "string" ? rawBody : "");
  if (!title) {
    throw new Error("Zadejte nadpis aktuality.");
  }
  if (!body.trim()) {
    throw new Error("Zadejte text aktuality.");
  }
  validateNewsText(title, body);

  const audience = parseNewsAudience({
    audience: optionalString(formData, "audience"),
    roles: stringList(formData, "audienceRoles", 10),
    userIds: stringList(formData, "recipientIds", NEWS_MAX_RECIPIENTS + 1),
  });

  // Příjemci musí být aktivní členové TÉTO kanceláře (podvržené id cizího
  // uživatele neprojde).
  if (audience.userIds.length > 0) {
    const members = await getPrisma().organizationMember.findMany({
      where: {
        organizationId,
        status: OrganizationMemberStatus.ACTIVE,
        userId: { in: audience.userIds },
      },
      select: { userId: true },
    });
    if (members.length !== audience.userIds.length) {
      throw new Error("Někteří vybraní kolegové nejsou členy této kanceláře.");
    }
  }

  const visibleUntil = optionalDate(formData, "visibleUntil");
  if (visibleUntil && Number.isNaN(visibleUntil.getTime())) {
    throw new Error("Zadejte platné datum, do kdy se má aktualita zobrazovat.");
  }

  return {
    title,
    body,
    audience: audience.audience,
    roles: audience.roles,
    userIds: audience.userIds,
    pinned: checkboxValue(formData, "pinned"),
    visibleUntil,
  };
}

function auditSnapshot(news: ParsedNews) {
  return auditJson({
    title: news.title,
    body: news.body,
    audience: news.audience,
    audienceRoles: news.roles,
    recipientIds: news.userIds,
    pinned: news.pinned,
    visibleUntil: news.visibleUntil,
  });
}

export async function createHrNews(
  _previous: HrNewsFormState,
  formData: FormData,
): Promise<HrNewsFormState> {
  try {
    const { currentUser, organizationId } = await authorize();
    const parsed = await parseNewsForm(formData, organizationId);

    const news = await getPrisma().hrNews.create({
      data: {
        organizationId,
        title: parsed.title,
        body: parsed.body,
        audience: parsed.audience,
        audienceRoles: parsed.roles,
        pinned: parsed.pinned,
        visibleUntil: parsed.visibleUntil,
        createdById: currentUser.id,
        updatedById: currentUser.id,
        recipients: {
          create: parsed.userIds.map((userId) => ({ organizationId, userId })),
        },
      },
      select: { id: true },
    });

    await writeAuditLog({
      organizationId,
      entityType: "HrNews",
      entityId: news.id,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: auditSnapshot(parsed),
    });

    revalidateNews();
    return done(`Aktualita „${parsed.title}“ byla zveřejněna.`);
  } catch (error) {
    return failed(error);
  }
}

export async function updateHrNews(
  _previous: HrNewsFormState,
  formData: FormData,
): Promise<HrNewsFormState> {
  try {
    const { currentUser, organizationId } = await authorize();
    const newsId = requiredString(formData, "newsId");
    const prisma = getPrisma();
    const existing = await prisma.hrNews.findFirst({
      where: andWhere({ id: newsId }, hrNewsVisibilityWhere(currentUser)),
      include: { recipients: { select: { userId: true } } },
    });
    if (!existing) {
      throw new Error("Aktualita nebyla nalezena.");
    }
    const parsed = await parseNewsForm(formData, organizationId);

    await prisma.$transaction([
      prisma.hrNewsRecipient.deleteMany({ where: { newsId, organizationId } }),
      prisma.hrNews.update({
        where: { id: newsId },
        data: {
          title: parsed.title,
          body: parsed.body,
          audience: parsed.audience,
          audienceRoles: parsed.roles,
          pinned: parsed.pinned,
          visibleUntil: parsed.visibleUntil,
          updatedById: currentUser.id,
          recipients: {
            create: parsed.userIds.map((userId) => ({ organizationId, userId })),
          },
        },
      }),
    ]);

    await writeAuditLog({
      organizationId,
      entityType: "HrNews",
      entityId: newsId,
      action: "UPDATE",
      changedById: currentUser.id,
      oldValue: auditJson({
        title: existing.title,
        body: existing.body,
        audience: existing.audience,
        audienceRoles: existing.audienceRoles,
        recipientIds: existing.recipients.map((recipient) => recipient.userId),
        pinned: existing.pinned,
        visibleUntil: existing.visibleUntil,
      }),
      newValue: auditSnapshot(parsed),
    });

    revalidateNews();
    return done("Změny aktuality byly uloženy.");
  } catch (error) {
    return failed(error);
  }
}

async function setNewsArchived(newsId: unknown, archived: boolean) {
  if (typeof newsId !== "string" || !newsId) {
    throw new Error("Chybí aktualita.");
  }
  const { currentUser, organizationId } = await authorize();
  const prisma = getPrisma();
  const existing = await prisma.hrNews.findFirst({
    where: andWhere({ id: newsId }, hrNewsVisibilityWhere(currentUser)),
    select: { id: true, title: true, archivedAt: true },
  });
  if (!existing) {
    throw new Error("Aktualita nebyla nalezena.");
  }
  const archivedAt = archived ? new Date() : null;
  await prisma.hrNews.update({
    where: { id: existing.id },
    data: { archivedAt, updatedById: currentUser.id },
  });

  await writeAuditLog({
    organizationId,
    entityType: "HrNews",
    entityId: existing.id,
    action: archived ? "ARCHIVE" : "RESTORE",
    changedById: currentUser.id,
    oldValue: auditJson({ title: existing.title, archivedAt: existing.archivedAt }),
    newValue: auditJson({ title: existing.title, archivedAt }),
  });

  revalidateNews();
}

// Bound přes .bind(null, id) do ConfirmActionForm.
export async function archiveHrNews(newsId: string) {
  await setNewsArchived(newsId, true);
}

export async function restoreHrNews(newsId: string) {
  await setNewsArchived(newsId, false);
}
