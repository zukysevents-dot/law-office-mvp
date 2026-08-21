// Public-launch mode: hosts listed in LANDING_ONLY_HOSTS serve ONLY the
// marketing landing page — every app/auth route on them redirects to "/"
// (enforced in src/proxy.ts). The internal application stays reachable on
// hosts that are not listed (e.g. the internal Vercel domain).
//
// LANDING_ONLY_HOSTS is a comma-separated list of hostnames without port,
// e.g. "iuriverse.com,www.iuriverse.com". Empty/unset = no host is locked.

function parseHosts(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

const landingOnlyHosts = parseHosts(process.env.LANDING_ONLY_HOSTS);

export function isLandingOnlyHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader || landingOnlyHosts.size === 0) return false;
  const host = hostHeader.split(":")[0].trim().toLowerCase();
  return landingOnlyHosts.has(host);
}
