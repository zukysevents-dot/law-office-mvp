/**
 * ARES / rejstříky configuration.
 *
 * The Czech ARES REST API is public and needs no credentials, so unlike the
 * Microsoft integration there is no "missing-credentials → disabled" shape here.
 * `ARES_BASE_URL` is only an override, and `ARES_LOOKUP_ENABLED` is a pure
 * kill-switch (default-on).
 */

const DEFAULT_ARES_BASE_URL =
  "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest";

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** Base URL of the ARES REST API (without trailing slash). */
export function getAresBaseUrl(): string {
  return (env("ARES_BASE_URL") ?? DEFAULT_ARES_BASE_URL).replace(/\/$/, "");
}

/** Lookup is on unless explicitly disabled via `ARES_LOOKUP_ENABLED="false"`. */
export function isAresLookupEnabled(): boolean {
  return process.env.ARES_LOOKUP_ENABLED?.trim().toLowerCase() !== "false";
}
