"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ModuleKey } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { assertModuleEnabled } from "@/lib/entitlements";
import { optionalString } from "@/lib/form";
import {
  getSharepointConfigForOrg,
  getSharepointUrlConfig,
} from "@/lib/microsoft/config";
import {
  listSharepointChildren,
  resetDriveCache,
} from "@/lib/microsoft/graph-drive";
import { resetGraphTokenCache } from "@/lib/microsoft/graph";
import { assertCanAdministerOrg } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

const SETTINGS_PATH = "/settings/sharepoint";

/** Web musí být http(s), ať se z něj nedá udělat javascript:/data: odkaz. */
function assertSafeSiteUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Adresa webu SharePointu není platná URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Adresa webu SharePointu musí být http(s).");
  }
}

/**
 * Uloží připojení SharePointu pro kancelář. Jen ADMIN/PARTNER. Client secret se
 * ukládá výhradně šifrovaně, nikdy se nevrací zpět do formuláře ani do auditu.
 */
export async function saveSharepointConfig(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);
  assertCanAdministerOrg(currentUser, currentUser.organizationId);

  const organizationId = currentUser.organizationId;
  const siteUrl = optionalString(formData, "siteUrl");
  const library = optionalString(formData, "library");
  const tenantId = optionalString(formData, "tenantId");
  const clientId = optionalString(formData, "clientId");
  const clientSecret = optionalString(formData, "clientSecret");

  if (siteUrl) {
    assertSafeSiteUrl(siteUrl);
  }
  if (clientSecret && !isEncryptionConfigured()) {
    throw new Error(
      "Šifrovací klíč (DATA_ENCRYPTION_KEY) není nastaven — client secret nelze bezpečně uložit.",
    );
  }
  if ((tenantId || clientId) && !(tenantId && clientId)) {
    throw new Error("Vyplňte Directory (tenant) ID i Application (client) ID.");
  }

  const previous = await prisma.organizationSharepointConfig.findUnique({
    where: { organizationId },
    select: { id: true, clientSecretEncrypted: true },
  });
  if (tenantId && clientId && !clientSecret && !previous?.clientSecretEncrypted) {
    throw new Error("Pro nové Graph připojení zadejte i client secret.");
  }

  // Secret se přepisuje JEN když ho někdo zadal — úprava adresy webu nesmí
  // smazat uložené přihlašovací údaje.
  const secretPatch = clientSecret
    ? { clientSecretEncrypted: encryptSecret(clientSecret) }
    : {};
  const data = { siteUrl, library, tenantId, clientId, ...secretPatch };

  const saved = await prisma.organizationSharepointConfig.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      organizationId,
      entityType: "OrganizationSharepointConfig",
      entityId: saved.id,
      action: previous ? "UPDATE" : "CREATE",
      changedById: currentUser.id,
      // Jen metadata — client secret se do auditu NIKDY nepíše.
      newValue: auditJson({
        siteUrl,
        library,
        tenantId,
        clientId,
        clientSecretChanged: Boolean(clientSecret),
      }),
    },
  });

  // Údaje/web se změnily → zahodit nacachovaný token i drive id.
  resetGraphTokenCache();
  resetDriveCache();

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/settings");
  redirect(`${SETTINGS_PATH}?sharepoint=saved`);
}

/**
 * Ověří uložené připojení skutečným voláním Graphu (výpis kořene knihovny).
 * Výsledek se hlásí přes query parametr, ať admin nemusí hádat, co je špatně.
 */
export async function testSharepointConnection() {
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);
  assertCanAdministerOrg(currentUser, currentUser.organizationId);

  const organizationId = currentUser.organizationId;
  if (!(await getSharepointUrlConfig(organizationId))) {
    redirect(`${SETTINGS_PATH}?test=nosite`);
  }
  if (!(await getSharepointConfigForOrg(organizationId))) {
    redirect(`${SETTINGS_PATH}?test=nograph`);
  }

  let count: number | null = null;
  try {
    const listing = await listSharepointChildren(organizationId, []);
    count = listing?.items.length ?? null;
  } catch {
    redirect(`${SETTINGS_PATH}?test=failed`);
  }
  redirect(`${SETTINGS_PATH}?test=ok&items=${count ?? 0}`);
}
