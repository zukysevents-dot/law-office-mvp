/**
 * Microsoft Graph app-only (client-credentials) transport. Bez znalosti env —
 * přihlašovací údaje dostane od volajícího (viz `getGraphConfigForOrg`
 * v `config.ts`), aby jedna instance mohla obsloužit víc kanceláří.
 *
 * Čisté helpery (parsování tokenu, expirace, retry) jsou unit-testované; fetch
 * I/O je nad nimi tenká slupka.
 */

import type { GraphConfig } from "@/lib/microsoft/config";

export type { GraphConfig };

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
// Refresh a little before actual expiry so an in-flight request never uses a
// token that expires mid-call.
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const MAX_RETRIES = 3;
// Per-request network timeout so a hung Graph/login call can never block the
// server action indefinitely (a timeout aborts the fetch and throws).
const FETCH_TIMEOUT_MS = 15_000;

// --- Pure helpers (unit-tested) ---------------------------------------------

export type ParsedToken = { accessToken: string; expiresInSec: number };

/** Validate the OAuth token response shape. Returns null on anything unexpected. */
export function parseTokenResponse(body: unknown): ParsedToken | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  const accessToken = record.access_token;
  if (typeof accessToken !== "string" || accessToken === "") {
    return null;
  }
  // expires_in is seconds; default to a conservative 60s if absent/garbled.
  const expiresInSec =
    typeof record.expires_in === "number" && Number.isFinite(record.expires_in)
      ? record.expires_in
      : 60;
  return { accessToken, expiresInSec };
}

/** True when a cached token (with its absolute expiry) should be refreshed. */
export function isTokenExpired(
  expiresAtMs: number | null | undefined,
  nowMs: number,
  skewMs: number = TOKEN_EXPIRY_SKEW_MS,
): boolean {
  if (expiresAtMs == null) {
    return true;
  }
  return nowMs >= expiresAtMs - skewMs;
}

/** Retry only transient failures: throttling (429) and server errors (5xx). */
export function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Backoff delay: honor Retry-After (seconds) when present, else exponential. */
export function retryDelayMs(
  attempt: number,
  retryAfterHeader: string | null,
): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 30_000);
    }
  }
  return Math.min(2 ** attempt * 500, 30_000);
}

// --- Token acquisition + fetch (I/O) ----------------------------------------

// Klíčováno dvojicí údajů, které token vydaly — token se tak nikdy nedostane
// k requestu běžícímu pod jiným tenantem / jinou app registrací. Klíčování přes
// credentials (ne přes organizationId) navíc znamená, že změna údajů se
// invaliduje sama na všech instancích naráz, bez cache bustingu.
const tokenCache = new Map<string, { accessToken: string; expiresAtMs: number }>();

export function tokenCacheKey(config: GraphConfig): string {
  return `${config.tenantId}|${config.clientId}`;
}

function tokenEndpoint(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(
    tenantId,
  )}/oauth2/v2.0/token`;
}

/**
 * Získá (a nacachuje) app-only Graph token pro dané údaje. Vyhodí výjimku při
 * selhání ověření (špatně nastavená aplikace), ať volající umí ohlásit srozumitelnou
 * chybu. Stav „není nakonfigurováno" se rozhoduje výš, v config.ts.
 */
export async function getGraphToken(config: GraphConfig): Promise<string> {
  const key = tokenCacheKey(config);
  const cached = tokenCache.get(key);
  if (cached && !isTokenExpired(cached.expiresAtMs, Date.now())) {
    return cached.accessToken;
  }

  const response = await fetch(tokenEndpoint(config.tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    tokenCache.delete(key);
    throw new Error(
      `Microsoft Graph: získání tokenu selhalo (HTTP ${response.status}).`,
    );
  }

  const parsed = parseTokenResponse(await response.json().catch(() => null));
  if (!parsed) {
    throw new Error("Microsoft Graph: neplatná odpověď tokenového endpointu.");
  }

  const entry = {
    accessToken: parsed.accessToken,
    expiresAtMs: Date.now() + parsed.expiresInSec * 1000,
  };
  tokenCache.set(key, entry);
  return entry.accessToken;
}

/** Zahodí všechny nacachované tokeny (testy / po změně konfigurace). */
export function resetGraphTokenCache(): void {
  tokenCache.clear();
}

export type GraphRequest = {
  method?: string;
  // Absolute Graph path beginning with "/" (appended to the v1.0 base) or a full
  // https URL (e.g. an @odata.nextLink).
  path: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
};

/**
 * Ověřený Graph fetch s retry na přechodné chyby. Vyhodí výjimku u neretryovatelné
 * chybové odpovědi, ať to volající umí zauditovat / ohlásit.
 */
export async function graphFetch(
  config: GraphConfig,
  request: GraphRequest,
): Promise<Response> {
  const token = await getGraphToken(config);

  const url = request.path.startsWith("http")
    ? request.path
    : `${GRAPH_BASE_URL}${request.path}`;

  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      method: request.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(request.headers ?? {}),
      },
      body: request.body ?? undefined,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.ok || !shouldRetryStatus(response.status)) {
      return response;
    }

    lastResponse = response;
    if (attempt < MAX_RETRIES) {
      const delay = retryDelayMs(attempt, response.headers.get("Retry-After"));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Exhausted retries — return the last (failed) response for the caller to map.
  return lastResponse as Response;
}
