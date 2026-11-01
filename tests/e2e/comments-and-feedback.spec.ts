import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL, E2E_USERS } from "./support/e2e-env";
import {
  appAlert,
  e2eName,
  expectNoErrorPage,
  pageAs,
  submitAndAwaitAction,
} from "./support/helpers";

// Komentáře (záznamy komunikace) u projektů a případů a Práce → Zpětná vazba.
// Testy v souboru na sebe navazují (sdílený komentář / zpětná vazba).
test.describe.configure({ mode: "serial" });

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

async function userId(email: string): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query(`select id from users where email = $1`, [email]);
    return result.rows[0].id as string;
  });
}

async function firstDetailHref(page: Page, listPath: string, prefix: string) {
  await page.goto(listPath);
  const href = await page
    .locator(`main a[href^="${prefix}"]`)
    .first()
    .getAttribute("href");
  expect(href).toBeTruthy();
  return href as string;
}

function commentsSection(page: Page) {
  return page.getByRole("region", { name: "Komentáře" });
}

const commentText = e2eName("telefonat");
let projectPath = "";

test("projekt: autor přidá formátovaný komentář, upraví ho a smaže", async ({
  browser,
}) => {
  const page = await pageAs(browser, "lawyer");
  projectPath = await firstDetailHref(page, "/projects", "/projects/c");
  await page.goto(projectPath);
  await expectNoErrorPage(page);

  const section = commentsSection(page);
  const editor = section.getByRole("textbox", { name: "Nový komentář" });
  await editor.fill(`Dne 21. 10. 2026 voláno na KSBR (${commentText}). Spisová značka je 12 Co 34/2026.`);

  // Výběr spisové značky + tlačítko Tučně; Ctrl+U podtrhne „voláno“.
  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("12 Co 34/2026");
    element.focus();
    element.setSelectionRange(start, start + "12 Co 34/2026".length);
  });
  await section.getByRole("button", { name: "Tučně" }).click();
  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("voláno");
    element.focus();
    element.setSelectionRange(start, start + "voláno".length);
  });
  await page.keyboard.press("ControlOrMeta+u");
  await expect(editor).toHaveValue(/__voláno__.*\*\*12 Co 34\/2026\*\*/);
  await expect(section.getByText("Náhled")).toBeVisible();

  await submitAndAwaitAction(page, section.getByRole("button", { name: "Přidat komentář" }));
  const row = section.getByRole("row").filter({ hasText: commentText });
  await expect(row).toHaveCount(1);
  await expect(row.locator("strong")).toHaveText("12 Co 34/2026");
  await expect(row.locator("u")).toHaveText("voláno");
  await expect(row).toContainText(E2E_USERS.lawyer.name);
  // Po úspěchu je pole prázdné.
  await expect(editor).toHaveValue("");

  // Chyba validace (jen značky) text v poli zachová.
  await editor.fill("****");
  await section.getByRole("button", { name: "Přidat komentář" }).click();
  await expect(appAlert(page).filter({ hasText: "Vyplňte text." })).toBeVisible();
  await expect(editor).toHaveValue("****");
  await editor.fill("");

  // Úprava v dialogu.
  await row.getByRole("button", { name: "Upravit" }).click();
  const dialog = page.getByRole("dialog", { name: "Upravit komentář" });
  await dialog.getByRole("textbox", { name: "Text" }).fill(`${commentText} upraveno *důležité*`);
  await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Uložit" }));
  await expect(dialog).toHaveCount(0);
  const edited = section.getByRole("row").filter({ hasText: commentText });
  await expect(edited.locator("em")).toHaveText("důležité");
  await expect(edited).toContainText("upraveno");

  await page.context().close();
});

test("projekt: cizí komentář vidí kolega, ale nemůže ho upravit", async ({ browser }) => {
  const page = await pageAs(browser, "partner");
  await page.goto(projectPath);
  const row = commentsSection(page).getByRole("row").filter({ hasText: commentText });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("button", { name: "Upravit" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Smazat" })).toHaveCount(0);
  await page.context().close();
});

test("projekt: autor komentář smaže (archivuje) a zapíše se audit", async ({ browser }) => {
  const page = await pageAs(browser, "lawyer");
  await page.goto(projectPath);
  const section = commentsSection(page);
  const row = section.getByRole("row").filter({ hasText: commentText });
  await row.getByRole("button", { name: "Smazat" }).click();
  const confirm = page.getByRole("dialog", { name: "Potvrzení" });
  await submitAndAwaitAction(page, confirm.getByRole("button", { name: "Smazat" }));
  await expect(section.getByRole("row").filter({ hasText: commentText })).toHaveCount(0);

  const actions = await withDb(async (db) => {
    const result = await db.query(
      `select a.action from "auditLogs" a
         join "matterComments" c on c.id = a."entityId"
        where a."entityType" = 'MatterComment' and c.body like $1
        order by a."createdAt"`,
      [`%${commentText}%`],
    );
    return result.rows.map((r) => r.action as string);
  });
  expect(actions).toEqual(["CREATE", "UPDATE", "ARCHIVE"]);
  await page.context().close();
});

test("případ: detail má sekci Komentáře", async ({ browser }) => {
  const page = await pageAs(browser, "trainee");
  const casePath = await firstDetailHref(page, "/cases", "/cases/c");
  await page.goto(casePath);
  const section = commentsSection(page);
  const text = e2eName("pripad-komentar");
  await section.getByRole("textbox", { name: "Nový komentář" }).fill(`**${text}**`);
  await submitAndAwaitAction(page, section.getByRole("button", { name: "Přidat komentář" }));
  const row = section.getByRole("row").filter({ hasText: text });
  await expect(row.locator("strong")).toHaveText(text);
  await expect(row).toContainText(E2E_USERS.trainee.name);
  await page.context().close();
});

const feedbackText = e2eName("zpetna-vazba");
const hiddenFeedbackText = e2eName("zpetna-vazba-skryta");
let hiddenWorkLogDescription = "";

test("zpětná vazba: partner napíše koncipientovi s odkazem na úkol a výkaz", async ({
  browser,
}) => {
  const page = await pageAs(browser, "partner");
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Zpětná vazba" }).first().click();
  await expect(page).toHaveURL(/\/feedback$/);
  await expectNoErrorPage(page);

  await page.getByLabel("Komu").selectOption({ label: E2E_USERS.trainee.name });
  const taskSelect = page.getByLabel("Odkaz na úkol (nepovinné)");
  const taskOption = taskSelect.locator("option").nth(1);
  const taskTitle = (await taskOption.textContent())?.trim() ?? "";
  await taskSelect.selectOption({ index: 1 });
  const workLogSelect = page.getByLabel("Odkaz na výkaz práce (nepovinné)");
  await workLogSelect.selectOption({ index: 1 });
  await page
    .getByRole("textbox", { name: "Zpětná vazba" })
    .fill(`${feedbackText} – **výborná rešerše**, příště __dřív__.`);
  await submitAndAwaitAction(page, page.getByRole("button", { name: "Uložit zpětnou vazbu" }));

  const row = page.getByRole("row").filter({ hasText: feedbackText });
  await expect(row).toHaveCount(1);
  await expect(row.locator("strong")).toHaveText("výborná rešerše");
  await expect(row.locator("u")).toHaveText("dřív");
  await expect(row.getByRole("link", { name: taskTitle })).toHaveAttribute(
    "href",
    /^\/tasks\//,
  );
  // Odkaz na výkaz vede do jeho detailu.
  await row.locator('a[href^="/work-logs/"]').click();
  await expect(page.getByRole("heading", { name: "Detail výkazu práce" })).toBeVisible();
  await expectNoErrorPage(page);

  // Druhá zpětná vazba odkazuje na výkaz, který koncipient (rozsah „vlastní“)
  // nevidí — založená přímo v DB, ať je cizí výkaz deterministický.
  const traineeId = await userId(E2E_USERS.trainee.email);
  const lawyerId = await userId(E2E_USERS.lawyer.email);
  await withDb(async (db) => {
    const org = await db.query(
      `select "organizationId" from "organizationMembers" where "userId" = $1 limit 1`,
      [traineeId],
    );
    const organizationId = org.rows[0].organizationId as string;
    hiddenWorkLogDescription = e2eName("cizi-vykaz");
    const workLogId = randomUUID();
    await db.query(
      `insert into "workLogs" (id, "organizationId", "userId", "workDate", hours, description, "createdAt", "updatedAt")
       values ($1, $2, $3, now(), 1, $4, now(), now())`,
      [workLogId, organizationId, lawyerId, hiddenWorkLogDescription],
    );
    await db.query(
      `insert into "workFeedback" (id, "organizationId", "authorId", "recipientId", body, "workLogId")
       values ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), organizationId, lawyerId, traineeId, hiddenFeedbackText, workLogId],
    );
  });
  await page.context().close();
});

test("zpětná vazba: příjemce ji vidí, cizí odkaz se neprozradí, upravit nemůže", async ({
  browser,
}) => {
  const page = await pageAs(browser, "trainee");
  await page.goto("/feedback?view=received");
  const row = page.getByRole("row").filter({ hasText: feedbackText });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(E2E_USERS.partner.name);
  await expect(row.getByRole("button", { name: "Upravit" })).toHaveCount(0);

  const hidden = page.getByRole("row").filter({ hasText: hiddenFeedbackText });
  await expect(hidden).toContainText("Výkaz práce (bez přístupu)");
  await expect(page.getByText(hiddenWorkLogDescription)).toHaveCount(0);
  await expect(hidden.locator('a[href^="/work-logs/"]')).toHaveCount(0);
  await page.context().close();
});

test("zpětná vazba: nezúčastnění kolegové ji nevidí, partner a admin ano", async ({
  browser,
}) => {
  for (const role of ["intern", "lawyer"] as const) {
    const page = await pageAs(browser, role);
    await page.goto("/feedback");
    await expectNoErrorPage(page);
    await expect(page.getByText(feedbackText)).toHaveCount(0);
    await page.context().close();
  }
  // Advokát je autorem druhé zpětné vazby → tu vidí (a smí ji upravit).
  const lawyer = await pageAs(browser, "lawyer");
  await lawyer.goto("/feedback?view=given");
  const own = lawyer.getByRole("row").filter({ hasText: hiddenFeedbackText });
  await expect(own.getByRole("button", { name: "Upravit" })).toHaveCount(1);
  await lawyer.context().close();

  const admin = await pageAs(browser, "admin");
  await admin.goto("/feedback");
  await expect(admin.getByRole("row").filter({ hasText: feedbackText })).toHaveCount(1);
  const adminHidden = admin.getByRole("row").filter({ hasText: hiddenFeedbackText });
  await expect(adminHidden.locator('a[href^="/work-logs/"]')).toHaveCount(1);
  await admin.context().close();
});
