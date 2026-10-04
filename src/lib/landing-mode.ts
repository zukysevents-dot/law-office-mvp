// Public-launch mode: hosts listed in LANDING_ONLY_HOSTS serve ONLY the
// marketing landing page — every app/auth route on them redirects to "/"
// (enforced in src/proxy.ts). The internal application stays reachable on
// hosts that are not listed (e.g. the internal Vercel domain).
//
// LANDING_ONLY_HOSTS is a comma-separated list of hostnames without port,
// e.g. "iuriverse.com,www.iuriverse.com". Empty/unset = no host is locked.
//
// NOTE: this gate is presentation, not a security boundary — it is fail-open
// by design (unknown/unset host serves the full app, whose routes are still
// session-gated). Anything that must stay closed needs its own switch (e.g.
// REGISTRATION_ENABLED in the register action).

function parseHosts(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

const landingOnlyHosts = parseHosts(process.env.LANDING_ONLY_HOSTS);

// Surface the gate state once per boot so a typo in the env var does not
// stay invisible in production.
if (process.env.NODE_ENV === "production") {
  console.info(
    landingOnlyHosts.size > 0
      ? `landing-mode: landing-only hosts active: ${[...landingOnlyHosts].join(", ")}`
      : "landing-mode: LANDING_ONLY_HOSTS not set — no host is landing-locked",
  );
}

/** Strips port (IPv6-safe): "[::1]:3000" → "::1", "iuriverse.com:443" → "iuriverse.com". */
function normalizeHost(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const bracketed = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1];
  return trimmed.replace(/:\d+$/, "");
}

export function isLandingOnlyHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader || landingOnlyHosts.size === 0) return false;
  // Behind a proxy/CDN the original host arrives in x-forwarded-host; callers
  // pass it first when present. Multiple hops are comma-separated.
  const first = hostHeader.split(",")[0];
  return landingOnlyHosts.has(normalizeHost(first));
}
