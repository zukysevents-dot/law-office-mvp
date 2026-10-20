// Paths that are public on normal hosts (no session needed): the auth pages,
// the one-time "set your own password" page from the welcome invitation, and
// the client portal (it has its own magic-link auth). Everything else matched
// by src/proxy.ts requires a session.
export const PUBLIC_PATHS = /^\/(login|register|set-password|portal)(\/|$)/;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.test(pathname);
}
