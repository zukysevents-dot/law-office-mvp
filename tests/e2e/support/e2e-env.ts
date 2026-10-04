// Single source of truth for the E2E environment.
//
// E2E runs against its OWN database (`law_office_e2e`) on the same local
// Postgres, never the developer's `law_office_mvp`. Nothing here may point at
// production: SMTP, ARES and ISDS are all forced off so a test run cannot send
// mail or call an external API.

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3101);
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/law_office_e2e?schema=public";

/** Prefix for every record the suite creates. Cleanup only ever touches these. */
export const E2E_PREFIX = "e2e-";

export const E2E_PASSWORD = "demo1234";

export type RoleKey =
  | "admin"
  | "partner"
  | "lawyer"
  | "trainee"
  | "intern"
  | "platformAdmin";

export const E2E_USERS: Record<
  RoleKey,
  { email: string; name: string; roleLabel: string }
> = {
  admin: {
    email: "admin.demo@example.local",
    name: "Admin Demo",
    roleLabel: "Administrátor",
  },
  partner: {
    email: "partner.demo@example.local",
    name: "Partner Demo",
    roleLabel: "Partner",
  },
  lawyer: {
    email: "advokat.demo@example.local",
    name: "Advokát Demo",
    roleLabel: "Advokát",
  },
  trainee: {
    email: "koncipient.demo@example.local",
    name: "Koncipient Demo",
    roleLabel: "Koncipient",
  },
  intern: {
    email: "praktikant.demo@example.local",
    name: "Praktikant Demo",
    roleLabel: "Praktikant",
  },
  platformAdmin: {
    email: "developer.demo@example.local",
    name: "Developer Admin",
    roleLabel: "Administrátor",
  },
};

export function storageStatePath(role: RoleKey) {
  return `tests/e2e/.auth/${role}.json`;
}

/** Env handed to the Next server started by Playwright's `webServer`. */
export const E2E_SERVER_ENV: Record<string, string> = {
  DATABASE_URL: E2E_DATABASE_URL,
  APP_BASE_URL: E2E_BASE_URL,
  NEXT_DIST_DIR: ".next-e2e",
  // 32+ chars — production mode refuses to boot without them.
  SESSION_SECRET: "e2e-session-secret-please-never-use-in-production",
  PORTAL_SESSION_SECRET: "e2e-portal-secret-please-never-use-in-production",
  DATA_ENCRYPTION_KEY: "ZTJlLWRhdGEta2V5LTMyLWJ5dGVzLWZvci10ZXN0cyE=",
  // Hard "no side effects" switches.
  EMAIL_NOTIFICATIONS_ENABLED: "false",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  SMTP_FROM: "",
  ARES_LOOKUP_ENABLED: "false",
  ISDS_ENABLED: "false",
  SHAREPOINT_SITE_URL: "",
  MS_TENANT_ID: "",
  MS_CLIENT_ID: "",
  MS_CLIENT_SECRET: "",
  EU_SANCTIONS_LIST_URL: "",
  DEMO_USER_EMAIL: "",
  NOTIFICATION_RUN_SECRET: "e2e-notification-secret-not-for-production",
  SANCTIONS_REFRESH_SECRET: "e2e-sanctions-secret-not-for-production",
};
