/**
 * Microsoft Graph app-only (client-credentials) client. Degrades gracefully when
 * the Azure AD app credentials are not configured — every entry point returns
 * null / a typed "not configured" result instead of throwing, mirroring the SMTP
 * and SharePoint-URL patterns elsewhere in the codebase.
 *
 * Configure with MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (Azure AD app
 * registration with application Graph permissions + admin consent). The pure
 * helpers (token parsing, expiry, retry decisions) are unit-tested; the fetch
 * I/O is a thin shell over them.
 */

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
// Refresh a little before actual expiry so an in-flight request never uses a
// token that expires mid-call.
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const MAX_RETRIES = 3;
// Per-request network timeout so a hung Graph/login call can never block the
// server action indefinitely (a timeout aborts the fetch and throws).
const FETCH_TIMEOUT_MS = 15_000;

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export type GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

/** App-only Graph config, or null when any credential is missing. */
export function getGraphConfig(): GraphConfig | null {
  const tenantId = env("MS_TENANT_ID");
  const clientId = env("MS_CLIENT_ID");
  const clientSecret = env("MS_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }
  return { tenantId, clientId, clientSecret };
}

export function isGraphConfigured(): boolean {
  return getGraphConfig() !== null;
}

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

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

function tokenEndpoint(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(
    tenantId,
  )}/oauth2/v2.0/token`;
}

/**
 * Acquire (and cache) an app-only Graph access token. Returns null when Graph is
 * not configured. Throws on an authentication failure (misconfigured app), so
 * callers can surface a clear error rather than silently doing nothing.
 */
export async function getGraphToken(): Promise<string | null> {
  const config = getGraphConfig();
  if (!config) {
    return null;
  }
  if (cachedToken && !isTokenExpired(cachedToken.expiresAtMs, Date.now())) {
    return cachedToken.accessToken;
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
    cachedToken = null;
    throw new Error(
      `Microsoft Graph: získání tokenu selhalo (HTTP ${response.status}).`,
    );
  }

  const parsed = parseTokenResponse(await response.json().catch(() => null));
  if (!parsed) {
    throw new Error("Microsoft Graph: neplatná odpověď tokenového endpointu.");
  }

  cachedToken = {
    accessToken: parsed.accessToken,
    expiresAtMs: Date.now() + parsed.expiresInSec * 1000,
  };
  return cachedToken.accessToken;
}

/** Drop the cached token (used by tests / after an auth error). */
export function resetGraphTokenCache(): void {
  cachedToken = null;
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
 * Authenticated Graph fetch with retry on transient errors. Returns null when
 * Graph is not configured (caller treats as "integration off"). Throws on a
 * non-retryable error response so the caller can audit/report it.
 */
export async function graphFetch(request: GraphRequest): Promise<Response> {
  const token = await getGraphToken();
  if (!token) {
    throw new Error(
      "Microsoft Graph není nakonfigurováno (chybí MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET).",
    );
  }

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
