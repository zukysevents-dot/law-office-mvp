/**
 * Microsoft 365 / SharePoint configuration.
 *
 * Every feature here is optional and degrades gracefully when the relevant
 * environment variables are missing — mirroring the SMTP/email pattern in
 * `src/lib/notifications/notification-service.ts`.
 */

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export type SharepointConfig = {
  siteUrl: string;
  library: string;
};

/**
 * SharePoint URL convention config (no API needed). Returns null when the site
 * URL is not configured, in which case folder URLs cannot be derived.
 */
export function getSharepointConfig(): SharepointConfig | null {
  const siteUrl = env("SHAREPOINT_SITE_URL");
  if (!siteUrl) {
    return null;
  }

  return {
    siteUrl: siteUrl.replace(/\/$/, ""),
    library: env("SHAREPOINT_LIBRARY") ?? "Dokumenty",
  };
}

export function isSharepointUrlConfigured(): boolean {
  return getSharepointConfig() !== null;
}

export type GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  driveId: string;
};

/**
 * Microsoft Graph (app-only) config for real folder creation. Returns null
 * unless all four values are present.
 */
export function getGraphConfig(): GraphConfig | null {
  const tenantId = env("MICROSOFT_TENANT_ID");
  const clientId = env("MICROSOFT_CLIENT_ID");
  const clientSecret = env("MICROSOFT_CLIENT_SECRET");
  const driveId = env("SHAREPOINT_DRIVE_ID");

  if (!tenantId || !clientId || !clientSecret || !driveId) {
    return null;
  }

  return { tenantId, clientId, clientSecret, driveId };
}

export function isGraphConfigured(): boolean {
  return getGraphConfig() !== null;
}
