// Stateless signed-cookie sessions. Web Crypto only, so the same code runs in
// edge proxy and in Node server actions/components. No Session table or auth
// dependency. New tokens carry `${userId}.${sessionVersion}.${exp}` plus an
// HMAC tag. The version is compared with User.sessionVersion in the auth DAL,
// which makes a password reset revoke all previously issued tokens.

const ALG = { name: "HMAC", hash: "SHA-256" } as const;

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function secret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (value && value.length >= 32) {
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to a random value of at least 32 characters in production.",
    );
  }
  // ponytail: dev-only fallback so `npm run dev` works without setup; prod throws above.
  return "dev-insecure-session-secret-change-me-32+";
}

const encoder = new TextEncoder();

// Cast to BufferSource: TS types TextEncoder/Uint8Array as
// Uint8Array<ArrayBufferLike>, which the Web Crypto lib types reject.
function bytes(value: string): BufferSource {
  return encoder.encode(value) as BufferSource;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes(secret()), ALG, false, [
    "sign",
    "verify",
  ]);
}

function toBase64Url(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): BufferSource {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const view = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return view as BufferSource;
}

export async function signSession(
  userId: string,
  ttlSeconds = SESSION_MAX_AGE,
  sessionVersion = 0,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}.${sessionVersion}.${exp}`;
  const sig = await crypto.subtle.sign(ALG, await key(), bytes(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

export type SessionPayload = {
  userId: string;
  sessionVersion: number;
};

export async function verifySessionPayload(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");

  // Accept the historical userId.exp.sig shape as version 0 so deployment does
  // not force-log-out every existing user. Any password change increments the
  // DB version and invalidates both historical and new version-0 tokens.
  const isLegacy = parts.length === 3;
  if (!isLegacy && parts.length !== 4) return null;

  const [userId, versionOrExp, expOrSig, maybeSig] = parts;
  const sessionVersion = isLegacy ? 0 : Number(versionOrExp);
  const expString = isLegacy ? versionOrExp : expOrSig;
  const sig = isLegacy ? expOrSig : maybeSig;
  if (!userId || !expString || !sig) return null;
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0) return null;

  const signedPayload = isLegacy
    ? `${userId}.${expString}`
    : `${userId}.${sessionVersion}.${expString}`;

  try {
    const valid = await crypto.subtle.verify(
      ALG,
      await key(),
      fromBase64Url(sig),
      bytes(signedPayload),
    );
    if (!valid) return null;
  } catch {
    // Malformed signature encoding (atob) or crypto error — fail closed.
    return null;
  }

  const exp = Number(expString);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;

  return { userId, sessionVersion };
}

export async function verifySession(
  token: string | undefined | null,
): Promise<string | null> {
  return (await verifySessionPayload(token))?.userId ?? null;
}
