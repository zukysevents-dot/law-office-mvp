/**
 * Microsoft 365 / SharePoint configuration, resolved per organization.
 *
 * Každá kancelář si své připojení nastavuje v /settings/sharepoint
 * (`OrganizationSharepointConfig`). Když řádek chybí, spadne se na procesní env
 * proměnné — tak jedou starší nasazení a lokální vývoj beze změny.
 *
 * Konfigurace je rozdělená na dvě NEZÁVISLÉ skupiny, každá se vyhodnocuje
 * všechno-nebo-nic:
 *   1. (siteUrl, library)                — URL konvence, žádné tajemství
 *   2. (tenantId, clientId, clientSecret) — Graph app-only přihlášení
 * Nikdy se nemíchá tenantId jedné kanceláře s clientSecretem z env.
 *
 * Toto rozdělení je i důvod, proč existuje `getSharepointUrlConfig` zvlášť:
 * render komponent potřebuje jen boolean „je web nastavený", a nesmí kvůli tomu
 * dešifrovat client secret.
 */

import { cache } from "react";

import { decryptSecret } from "@/lib/crypto";
import { getPrisma } from "@/lib/prisma";

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export type SharepointConfig = {
  siteUrl: string;
  library: string;
};

export type GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

export type ResolvedSharepointConfig = SharepointConfig & GraphConfig;

/** Uložený (nebo z env poskládaný) řádek konfigurace, secret už dešifrovaný. */
export type SharepointConfigRow = {
  siteUrl: string | null;
  library: string | null;
  tenantId: string | null;
  clientId: string | null;
  clientSecret: string | null;
};

// --- env vrstva (sync — fallback, a jediné, co jde použít v safeQuery fallbacku) ---

export function getSharepointConfigFromEnv(): SharepointConfig | null {
  const siteUrl = env("SHAREPOINT_SITE_URL");
  if (!siteUrl) {
    return null;
  }
  return {
    siteUrl: siteUrl.replace(/\/$/, ""),
    library: env("SHAREPOINT_LIBRARY") ?? "Dokumenty",
  };
}

export function getGraphConfigFromEnv(): GraphConfig | null {
  const tenantId = env("MS_TENANT_ID");
  const clientId = env("MS_CLIENT_ID");
  const clientSecret = env("MS_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }
  return { tenantId, clientId, clientSecret };
}

function envConfigRow(): SharepointConfigRow {
  const site = getSharepointConfigFromEnv();
  const graph = getGraphConfigFromEnv();
  return {
    siteUrl: site?.siteUrl ?? null,
    library: site?.library ?? null,
    tenantId: graph?.tenantId ?? null,
    clientId: graph?.clientId ?? null,
    clientSecret: graph?.clientSecret ?? null,
  };
}

// --- čisté sloučení (unit-testované) ----------------------------------------

function trimmed(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}

/**
 * Web + knihovna: skupina se bere celá z organizace, jinak celá z env.
 * Nikdy se nespáruje siteUrl kanceláře s library z env.
 */
export function mergeSharepointUrlConfig(
  row: SharepointConfigRow | null,
  fromEnv: SharepointConfigRow,
): SharepointConfig | null {
  const siteUrl = trimmed(row?.siteUrl) ?? trimmed(fromEnv.siteUrl);
  if (!siteUrl) {
    return null;
  }
  const library = trimmed(row?.siteUrl)
    ? trimmed(row?.library)
    : trimmed(fromEnv.library);
  return {
    siteUrl: siteUrl.replace(/\/+$/, ""),
    library: library ?? "Dokumenty",
  };
}

/** Graph údaje: všechny tři ze stejného zdroje, nebo nic. */
export function mergeGraphConfig(
  row: SharepointConfigRow | null,
  fromEnv: SharepointConfigRow,
): GraphConfig | null {
  const tenantId = trimmed(row?.tenantId);
  const clientId = trimmed(row?.clientId);
  const clientSecret = trimmed(row?.clientSecret);
  if (tenantId && clientId && clientSecret) {
    return { tenantId, clientId, clientSecret };
  }
  const envTenantId = trimmed(fromEnv.tenantId);
  const envClientId = trimmed(fromEnv.clientId);
  const envClientSecret = trimmed(fromEnv.clientSecret);
  if (envTenantId && envClientId && envClientSecret) {
    return {
      tenantId: envTenantId,
      clientId: envClientId,
      clientSecret: envClientSecret,
    };
  }
  return null;
}

// --- org vrstva (async) ------------------------------------------------------

// Jeden dotaz na organizaci a request (React cache), stejně jako
// getEnabledModules v src/lib/entitlements.ts. Chyby se polykají, aby chybějící
// tabulka (před migrací) nebo spadlá DB degradovaly na env, ne na 500.
const readConfigRow = cache(
  async (organizationId: string): Promise<SharepointConfigRow | null> => {
    const row = await getPrisma()
      .organizationSharepointConfig.findUnique({
        where: { organizationId },
        select: {
          siteUrl: true,
          library: true,
          tenantId: true,
          clientId: true,
          clientSecretEncrypted: true,
        },
      })
      .catch(() => null);
    if (!row) {
      return null;
    }
    let clientSecret: string | null = null;
    if (row.clientSecretEncrypted) {
      try {
        clientSecret = decryptSecret(row.clientSecretEncrypted);
      } catch {
        // Chybný/chybějící DATA_ENCRYPTION_KEY → bereme jako nenastavené údaje,
        // ať se tiše nespadne na env přihlášení do CIZÍHO tenanta.
        clientSecret = null;
      }
    }
    return {
      siteUrl: row.siteUrl,
      library: row.library,
      tenantId: row.tenantId,
      clientId: row.clientId,
      clientSecret,
    };
  },
);

/** Web + knihovna. Nečte ani nedešifruje secret — bezpečné při renderu. */
export async function getSharepointUrlConfig(
  organizationId: string | null | undefined,
): Promise<SharepointConfig | null> {
  const row = organizationId ? await readConfigRow(organizationId) : null;
  return mergeSharepointUrlConfig(row, envConfigRow());
}

export async function isSharepointUrlConfigured(
  organizationId: string | null | undefined,
): Promise<boolean> {
  return (await getSharepointUrlConfig(organizationId)) !== null;
}

/** Graph app-only přihlašovací údaje kanceláře (nebo z env). */
export async function getGraphConfigForOrg(
  organizationId: string | null | undefined,
): Promise<GraphConfig | null> {
  const row = organizationId ? await readConfigRow(organizationId) : null;
  return mergeGraphConfig(row, envConfigRow());
}

/** Vše potřebné pro skutečný zápis přes Graph. Volá jen graph-drive.ts. */
export async function getSharepointConfigForOrg(
  organizationId: string | null | undefined,
): Promise<ResolvedSharepointConfig | null> {
  const url = await getSharepointUrlConfig(organizationId);
  if (!url) {
    return null;
  }
  const graph = await getGraphConfigForOrg(organizationId);
  if (!graph) {
    return null;
  }
  return { ...url, ...graph };
}
