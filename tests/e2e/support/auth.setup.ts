import { expect, test as setup } from "@playwright/test";

import { E2E_PASSWORD, E2E_USERS, storageStatePath, type RoleKey } from "./e2e-env";

// One real UI login per role, persisted as storage state. Every spec reuses it,
// which keeps the suite fast AND keeps the per-IP login throttle far away.
const roles: Array<{ role: RoleKey; landsOn: RegExp }> = [
  { role: "admin", landsOn: /\/dashboard$/ },
  { role: "partner", landsOn: /\/dashboard$/ },
  { role: "lawyer", landsOn: /\/dashboard$/ },
  { role: "trainee", landsOn: /\/dashboard$/ },
  { role: "intern", landsOn: /\/dashboard$/ },
  // No org membership → getCurrentUser sends the platform admin to /admin.
  { role: "platformAdmin", landsOn: /\/admin$/ },
];

for (const { role, landsOn } of roles) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(E2E_USERS[role].email);
    await page.getByLabel("Heslo").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Přihlásit se" }).click();

    await expect(page).toHaveURL(landsOn);
    await page.context().storageState({ path: storageStatePath(role) });
  });
}
