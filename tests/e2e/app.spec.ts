import { expect, test, type Page } from "@playwright/test";

// Critical-flow E2E coverage mirroring the manual production-readiness review.
// Assumes the seeded demo dataset (password `demo1234`) and a clean-ish DB.

const ADMIN = "admin.demo@example.local";
const PASSWORD = "demo1234";

async function login(page: Page, email = ADMIN, password = PASSWORD) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "E-mail" }).fill(email);
  await page.getByRole("textbox", { name: "Heslo" }).fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  // Wait for the login POST + redirect to settle before the caller navigates,
  // otherwise a follow-up goto() races the redirect. Works for both success
  // (lands on /dashboard) and invalid login (stays on /login?error=1).
  await page.waitForLoadState("networkidle");
}

test("landing page loads without fatal console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Celá advokátní kancelář/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("protected route redirects to login when unauthenticated", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?from=%2Fdashboard/);
});

test("invalid login shows Czech error", async ({ page }) => {
  await login(page, ADMIN, "wrong-password");
  await expect(page).toHaveURL(/\/login\?error=1/);
  await expect(page.getByText("Nesprávný e-mail nebo heslo.")).toBeVisible();
});

test("valid login reaches dashboard, logout clears session", async ({
  page,
}) => {
  await login(page);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Odhlásit se" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/); // session gone
});

test("subject create -> edit -> persistence", async ({ page }) => {
  await login(page);
  await page.goto("/subjects");

  // Unique IČO per run so the spec is repeatable (per-org unique constraint).
  const ico = String(10_000_000 + (Date.now() % 89_999_999));
  const name = `E2E Klient ${ico}`;

  await page.getByRole("textbox", { name: "Název", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "IČO", exact: true }).fill(ico);
  await page.getByRole("spinbutton", { name: "Hodinová sazba" }).fill("1500");
  await page.getByRole("button", { name: "Vytvořit subjekt" }).click();

  // Redirects to the detail page.
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.getByRole("link", { name: "Upravit subjekt" }).click();
  const edited = `${name} (upraveno)`;
  await page.getByRole("textbox", { name: "Název", exact: true }).fill(edited);
  await page.getByRole("button", { name: "Uložit subjekt" }).click();
  await expect(page.getByRole("heading", { name: edited })).toBeVisible();

  // Persistence survives a full reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: edited })).toBeVisible();
});

test("duplicate IČO shows an inline error, not a 500", async ({ page }) => {
  await login(page);
  await page.goto("/subjects");

  const ico = String(10_000_000 + (Date.now() % 89_999_999));
  // First create.
  await page.getByRole("textbox", { name: "Název", exact: true }).fill(`Dup A ${ico}`);
  await page.getByRole("textbox", { name: "IČO", exact: true }).fill(ico);
  await page.getByRole("button", { name: "Vytvořit subjekt" }).click();
  await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);

  // Second create with the same IČO -> redirect back with an inline banner
  // (NOT a full-page error boundary).
  await page.goto("/subjects");
  await page.getByRole("textbox", { name: "Název", exact: true }).fill(`Dup B ${ico}`);
  await page.getByRole("textbox", { name: "IČO", exact: true }).fill(ico);
  await page.getByRole("button", { name: "Vytvořit subjekt" }).click();
  await expect(page).toHaveURL(/error=duplicate-ico/);
  await expect(
    page.getByText("Subjekt s tímto IČO už ve vaší kanceláři existuje."),
  ).toBeVisible();
  await expect(page.getByText("Něco se pokazilo")).toHaveCount(0);
});

test("unknown route renders the localized 404", async ({ page }) => {
  await page.goto("/definitely-not-a-real-route");
  await expect(
    page.getByText("Požadovaná stránka nebyla nalezena nebo k ní nemáte přístup."),
  ).toBeVisible();
});

test("cross-role: INTERN is denied the audit log", async ({ page }) => {
  await login(page, "praktikant.demo@example.local", PASSWORD);
  await page.goto("/audit-log");
  await expect(page.getByText("Nemáte oprávnění zobrazit audit log.")).toBeVisible();
});

test("koncipient work-log form hides rate and the billable option", async ({
  page,
}) => {
  await login(page, "koncipient.demo@example.local", PASSWORD);
  await page.goto("/work-logs");
  const form = page.locator('form:has(button:has-text("Vytvořit výkaz"))');
  // Rate ("Sazba") is confidential — not shown when a junior logs work.
  await expect(form.getByRole("spinbutton", { name: "Sazba" })).toHaveCount(0);
  // Billing status limited to Ke schválení / Interní — no "Fakturovatelné".
  // (exact match: "Interní nefakturovatelné" contains the substring otherwise.)
  await expect(
    form.getByRole("option", { name: "Fakturovatelné", exact: true }),
  ).toHaveCount(0);
});
