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

