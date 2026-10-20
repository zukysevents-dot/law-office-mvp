// Client-safe password policy (no node:crypto here — password.ts re-exports it).
/** Minimum length of every user password (admin-set, self-set, invitation). */
export const MIN_PASSWORD_LENGTH = 8;
