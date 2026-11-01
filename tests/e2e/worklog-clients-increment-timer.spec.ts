import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "./support/e2e-env";
import {
  e2eName,
  expectNoErrorPage,
  expectNoHorizontalScroll,
  submitAndAwaitAction,
} from "./support/helpers";

// Zpětná vazba z testování (výkazy práce): více klientů na případu, krok
// vykazování 0,1 h při schvalování, pauza stopek a srozumitelný stav
// „Čeká na schválení“. Datum daleko v budoucnu + unikátní e2e prefix izolují
// záznamy testu od seedu.
const DATE = "2031-03-14";
const CASE_NAME = "Žaloba na zaplacení";

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function selectByText(select: Locator, text: string) {
  const value = await select
    .locator("option", { hasText: text })
    .first()
    .getAttribute("value");
  expect(value, `option „${text}“`).toBeTruthy();
  await select.selectOption(value!);
}

/** Nový subjekt v kanceláři seedového případu, připojený k případu s rolí Klient. */
async function addCaseClient(name: string) {
  return withDb(async (client) => {
    const legalCase = await client.query<{
      id: string;
      projectId: string;
      organizationId: string;
    }>(
      `SELECT id, "projectId", "organizationId" FROM cases WHERE name = $1 ORDER BY "createdAt" LIMIT 1`,
      [CASE_NAME],
    );
    const row = legalCase.rows[0];
    expect(row, "seedový případ").toBeTruthy();
    const subjectId = `${name}-s`;
    await client.query(
      `INSERT INTO subjects (id, "organizationId", name, "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())`,
      [subjectId, row.organizationId, name],
    );
    await client.query(
      `INSERT INTO "subjectRelations" (id, "subjectId", "relationType", role, "projectId", "caseId") VALUES ($1, $2, 'CASE', 'CLIENT', $3, $4)`,
      [`${name}-r`, subjectId, row.projectId, row.id],
    );
    return { subjectId, organizationId: row.organizationId };
  });
}

async function setIncrement(organizationId: string, minutes: number) {
  await withDb((client) =>
    client.query(
      `UPDATE organizations SET "billingTimeIncrementMinutes" = $1 WHERE id = $2`,
      [minutes, organizationId],
    ),
  );
}

async function openNewWorkLog(page: Page) {
  await page.goto("/work-logs?new=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog", { name: "Nový výkaz práce" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe.configure({ mode: "serial" });

test.describe("výkazy: více klientů, krok 0,1 h, pauza stopek", () => {
  test("na případ s více klienty lze vykázat i na dalšího klienta a ten ho schválí a vyfakturuje", async ({
    page,
  }) => {
    const p = e2eName("viceklientu");
    const clientName = `${p} s.r.o.`;
    await addCaseClient(clientName);

    const dialog = await openNewWorkLog(page);
    await selectByText(dialog.getByLabel("Případ"), CASE_NAME);
    const subject = dialog.getByLabel("Subjekt");
    // Výběr případu doplní hlavního klienta; další klient je v nabídce také.
    await expect(subject).not.toHaveValue("");
    await selectByText(subject, clientName);
    // Případ i projekt zůstanou vybrané.
    await expect(dialog.getByLabel("Případ")).not.toHaveValue("");
    await dialog.getByLabel("Datum práce").fill(DATE);
    await dialog.getByLabel("Hodiny").fill("1");
    await dialog.getByLabel("Popis práce").fill(`${p}-popis`);
    await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Vytvořit výkaz" }));
    await expect(dialog).toBeHidden();
    await expectNoErrorPage(page);

    const stored = await withDb((client) =>
      client.query<{ subjectName: string; caseName: string }>(
        `SELECT s.name AS "subjectName", c.name AS "caseName" FROM "workLogs" w JOIN subjects s ON s.id = w."subjectId" JOIN cases c ON c.id = w."caseId" WHERE w.description = $1`,
        [`${p}-popis`],
      ),
    );
    expect(stored.rows).toEqual([{ subjectName: clientName, caseName: CASE_NAME }]);

    // Fronta schválení: filtr dalšího klienta nabídne i jeho případ.
    await page.goto(`/billing/approvals?q=${encodeURIComponent(p)}`, {
      waitUntil: "networkidle",
    });
    const card = page.getByTestId("approval-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(clientName);
    await expect(card).toContainText("Čeká na schválení");
    await selectByText(page.getByRole("combobox", { name: "Klient" }), clientName);
    await expect(
      page.getByRole("combobox", { name: "Případ" }).locator("option", { hasText: CASE_NAME }),
    ).toHaveCount(1);
    await submitAndAwaitAction(page, card.getByRole("button", { name: "Schválit" }));
    await expect(card).toHaveCount(0);

    // Nová faktura dalšímu klientovi, omezená na případ.
    const subjectId = `${clientName}-s`;
    await page.goto(
      `/billing/invoices/new?subjectId=${encodeURIComponent(subjectId)}`,
      { waitUntil: "networkidle" },
    );
    await expectNoErrorPage(page);
    await selectByText(page.getByRole("combobox", { name: "Případ" }), CASE_NAME);
    await page.getByRole("button", { name: "Načíst výkazy" }).click();
    await expect(page).toHaveURL(/caseId=/);
    await page.waitForLoadState("networkidle");
    const row = page.getByRole("row").filter({ hasText: `${p}-popis` });
    await expect(row).toHaveCount(1);
    await row.getByRole("checkbox", { name: "Zahrnout výkaz do faktury" }).check();
    await submitAndAwaitAction(
      page,
      page.getByRole("button", { name: "Vytvořit rozpracovanou fakturu" }),
    );
    await expect(page).toHaveURL(/\/billing\/invoices\/[^/]+$/);
    await expectNoErrorPage(page);
    const invoice = await withDb((client) =>
      client.query<{ subjectId: string; caseName: string | null }>(
        `SELECT i."subjectId", c.name AS "caseName" FROM invoices i LEFT JOIN cases c ON c.id = i."caseId" JOIN "invoiceLines" l ON l."invoiceId" = i.id JOIN "workLogs" w ON w.id = l."workLogId" WHERE w.description = $1`,
        [`${p}-popis`],
      ),
    );
    expect(invoice.rows).toEqual([{ subjectId, caseName: CASE_NAME }]);
  });

  test("krok 0,1 h platí i ve frontě schválení (0,3 h jde schválit a upravit na 0,7 h)", async ({
    page,
  }) => {
    const p = e2eName("krok01");
    const organizationId = await withDb(async (client) => {
      const result = await client.query<{ organizationId: string }>(
        `SELECT "organizationId" FROM cases WHERE name = $1 LIMIT 1`,
        [CASE_NAME],
      );
      return result.rows[0].organizationId;
    });
    await setIncrement(organizationId, 6);
    try {
      const dialog = await openNewWorkLog(page);
      await expect(dialog.getByLabel("Hodiny")).toHaveAttribute("step", "0.1");
      await dialog.getByLabel("Datum práce").fill(DATE);
      await dialog.getByLabel("Hodiny").fill("0.3");
      await dialog.getByLabel("Popis práce").fill(`${p}-popis`);
      await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Vytvořit výkaz" }));
      await expect(dialog).toBeHidden();

      await page.goto(`/billing/approvals?q=${encodeURIComponent(p)}`, {
        waitUntil: "networkidle",
      });
      const card = page.getByTestId("approval-card");
      await expect(card).toHaveCount(1);
      const hours = card.getByRole("spinbutton", { name: "Hodiny" });
      await expect(hours).toHaveAttribute("step", "0.1");
      await hours.fill("0.7");
      expect(await hours.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(true);
      await submitAndAwaitAction(page, card.getByRole("button", { name: "Schválit" }));
      await expect(card).toHaveCount(0);

      const stored = await withDb((client) =>
        client.query<{ hours: string; approvalStatus: string }>(
          `SELECT hours::text AS hours, "approvalStatus" FROM "workLogs" WHERE description = $1`,
          [`${p}-popis`],
        ),
      );
      expect(stored.rows).toEqual([{ hours: "0.70", approvalStatus: "APPROVED" }]);
    } finally {
      await setIncrement(organizationId, 15);
    }
  });

  test("stopky jde pozastavit; pauza se nezapočítá a přežije reload", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    // Stopky běží 30 s, pak se pozastaví (čas zastaví na 00:00:30).
    await page.evaluate(() => {
      window.localStorage.setItem(
        "wl-timer",
        JSON.stringify({ status: "running", startedAt: Date.now() - 30_000, accumulatedMs: 0 }),
      );
    });
    await page.reload({ waitUntil: "networkidle" });
    const timer = page.getByTestId("floating-timer");
    await expect(timer).toHaveAttribute("data-timer-status", "running");
    await timer.getByRole("button", { name: "Pozastavit stopky" }).click();
    await expect(timer).toHaveAttribute("data-timer-status", "paused");
    const pausedText = await page.getByTestId("floating-timer-elapsed").textContent();
    expect(pausedText).toMatch(/^00:00:3\d$/);
    await expect(timer).toContainText("Pozastaveno");

    await page.waitForTimeout(2_100);
    await page.reload({ waitUntil: "networkidle" });
    await expect(timer).toHaveAttribute("data-timer-status", "paused");
    await expect(page.getByTestId("floating-timer-elapsed")).toHaveText(pausedText!);

    await timer.getByRole("button", { name: "Pokračovat ve stopkách" }).click();
    await expect(timer).toHaveAttribute("data-timer-status", "running");
    await expect(page.getByTestId("floating-timer-elapsed")).not.toHaveText(pausedText!);

    await page.setViewportSize({ width: 375, height: 812 });
    await expectNoHorizontalScroll(page);
    await page.screenshot({ path: test.info().outputPath("timer-375.png") });

    await timer.getByRole("button", { name: "Zrušit stopky" }).click();
    await expect(page.getByRole("button", { name: "Stopky" })).toBeVisible();
  });
});
