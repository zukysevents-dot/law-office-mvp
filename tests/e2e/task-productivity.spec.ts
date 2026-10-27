import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL, E2E_USERS } from "./support/e2e-env";
import {
  appAlert,
  e2eName,
  expectNoErrorPage,
  pageAs,
  submitAndAwaitAction,
} from "./support/helpers";

// Úkoly: produktivita (audit balík 06) — duplikace úkolu, „Vykázat práci“
// přímo z úkolu, filtry archivu úkolů a auditované odložení termínu.
// Admin zakládá; koncipient je řešitel / dohled. Praktikant se nepoužívá
// (je vyhrazen sériovému bloku v roles-and-permissions.spec.ts).

const ADMIN = E2E_USERS.admin.name;
const ADVOKAT = E2E_USERS.lawyer.name;
const KONCIPIENT = E2E_USERS.trainee.name;
const PARTNER = E2E_USERS.partner.name;

// Seed: ABC s.r.o. → projekt „Soudní spor ABC“ → případ „Žaloba na zaplacení“.
const SEED_SUBJECT = "ABC s.r.o.";
const SEED_PROJECT = "Soudní spor ABC";
const SEED_CASE = "Žaloba na zaplacení";

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

async function userId(email: string) {
  return withDb(async (db) => {
    const result = await db.query(`select id from users where email = $1`, [email]);
    return result.rows[0].id as string;
  });
}

function pragueToday() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** „2026-10-03“ → „03. 10. 2026“ (formát dat v aplikaci). */
function czDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}. ${month}. ${year}`;
}

function taskIdOf(path: string) {
  return path.split("/").pop() as string;
}

// Hodnota políčka detailu úkolu: <p>štítek</p><p>hodnota</p>.
function infoValue(page: Page, label: string) {
  return page
    .locator("p", { hasText: new RegExp(`^${label}$`) })
    .locator("xpath=following-sibling::p[1]");
}

async function selectByText(select: Locator, text: string) {
  await expect(async () => {
    const value = await select
      .locator("option", { hasText: text })
      .first()
      .getAttribute("value", { timeout: 1_000 });
    expect(value, `option „${text}“`).toBeTruthy();
    await select.selectOption(value!);
    await expect(select).toHaveValue(value!, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

// Výběr osoby v TaskPeopleFields (viz task-people.spec.ts): opakuje se, dokud
// React nepřevezme výběr.
async function pick(
  scope: Locator | Page,
  picker: "Přidat řešitele nebo tým" | "Přidat osobu s dohledem",
  label: string,
) {
  const select = scope.getByRole("combobox", { name: picker });
  const button = scope.getByRole("button", {
    name: picker === "Přidat řešitele nebo tým" ? "Přidat řešitele" : "Přidat dohled",
    exact: true,
  });
  await expect(async () => {
    await select.selectOption({ label });
    await expect(button).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await button.click();
}

type NewTask = {
  assignees?: string[];
  supervisors?: string[];
  deadline?: string;
  shortDescription?: string;
  caseName?: string;
};

async function createTask(page: Page, title: string, options: NewTask = {}) {
  await page.goto("/tasks");
  const form = page.locator("#new-task");
  await form.getByLabel("Název úkolu").fill(title);
  for (const name of options.assignees ?? []) {
    await pick(form, "Přidat řešitele nebo tým", name);
    await expect(
      form.getByRole("button", { name: `Odebrat řešitele ${name}` }),
    ).toBeVisible();
  }
  for (const name of options.supervisors ?? []) {
    await pick(form, "Přidat osobu s dohledem", name);
    await expect(form.getByRole("button", { name: `Odebrat dohled ${name}` })).toBeVisible();
  }
  if (options.caseName) {
    // Výběr případu doplní projekt i klienta.
    await selectByText(form.getByLabel("Případ"), options.caseName);
    await expect(form.getByLabel("Projekt")).not.toHaveValue("");
  }
  if (options.deadline) {
    await form.getByLabel("Deadline", { exact: true }).fill(options.deadline);
  }
  if (options.shortDescription) {
    await form.getByLabel("Krátký popis").fill(options.shortDescription);
  }
  await form.getByRole("button", { name: "Vytvořit úkol" }).click();
  await expect(page).toHaveURL(/\/tasks\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  return new URL(page.url()).pathname;
}

async function completeTask(page: Page, path: string) {
  await page.goto(path);
  await page.getByLabel("Nový status").selectOption("COMPLETED");
  await submitAndAwaitAction(page, page.getByRole("button", { name: "Uložit status" }));
  await expect(page.getByText("Tento záznam je archivovaný", { exact: false })).toBeVisible();
}

function timeline(page: Page) {
  return page.getByRole("list", { name: "Komentáře a historie úkolu" });
}

// ---------------------------------------------------------------------------

test.describe("duplikace úkolu", () => {
  test("Duplikovat předvyplní formulář, kopie má vlastní osoby a odkaz na zdroj", async ({
    page,
  }) => {
    const title = e2eName("dup-ukol");
    const deadline = addDays(pragueToday(), 14);
    const comment = e2eName("komentar-zdroje");
    const sourcePath = await createTask(page, title, {
      assignees: [ADVOKAT],
      supervisors: [KONCIPIENT],
      deadline,
      shortDescription: "původní zadání",
    });
    await page.getByLabel("Nový komentář").fill(comment);
    await submitAndAwaitAction(page, page.getByRole("button", { name: "Přidat komentář" }));
    await expect(timeline(page).getByText(comment)).toBeVisible();

    await page.getByRole("link", { name: "Duplikovat", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/tasks/new\\?duplicate=${taskIdOf(sourcePath)}$`));
    await expect(page.getByRole("heading", { name: "Duplikovat úkol", level: 1 })).toBeVisible();
    await expect(page.getByText(`Kopie úkolu „${title}“.`, { exact: false })).toBeVisible();
    await expect(page.getByLabel("Název úkolu")).toHaveValue(title);
    await expect(page.getByLabel("Krátký popis")).toHaveValue("původní zadání");
    await expect(page.getByLabel("Deadline", { exact: true })).toHaveValue(deadline);
    await expect(page.getByLabel("Začátek")).toHaveValue(pragueToday());
    await expect(
      page.getByRole("button", { name: `Odebrat řešitele ${ADVOKAT}` }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: `Odebrat dohled ${KONCIPIENT}` })).toBeVisible();

    // Jiná osoba a lehce upravené zadání.
    await page.getByRole("button", { name: `Odebrat řešitele ${ADVOKAT}` }).click();
    await pick(page, "Přidat řešitele nebo tým", PARTNER);
    await expect(page.getByRole("button", { name: `Odebrat řešitele ${PARTNER}` })).toBeVisible();
    await page.getByLabel("Krátký popis").fill("dílčí část pro partnera");
    await page.getByRole("button", { name: "Vytvořit kopii úkolu" }).click();

    await expect(page).toHaveURL(/\/tasks\/[a-z0-9]+$/);
    await expect(page).not.toHaveURL(new RegExp(`${sourcePath}$`));
    const copyPath = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(infoValue(page, "Řešitelé")).toHaveText(PARTNER);
    await expect(infoValue(page, "Dohled")).toHaveText(KONCIPIENT);
    await expect(page.getByText("dílčí část pro partnera")).toBeVisible();
    const origin = page
      .locator("div")
      .filter({ has: page.locator("p", { hasText: /^Vytvořeno duplikací z$/ }) })
      .last();
    await expect(origin.getByRole("link", { name: title })).toHaveAttribute("href", sourcePath);
    // Komentáře se nekopírují.
    await expect(page.getByText(comment)).toHaveCount(0);
    await expect(timeline(page).getByText("Úkol vytvořen duplikací z úkolu")).toBeVisible();

    // Zdroj zůstal beze změny a jeho historie kopii zmiňuje.
    await page.goto(sourcePath);
    await expect(infoValue(page, "Řešitelé")).toHaveText(ADVOKAT);
    await expect(page.getByText("původní zadání")).toBeVisible();
    const entry = timeline(page).getByTestId("task-event").filter({
      hasText: "Úkol byl duplikován do",
    });
    await expect(entry).toBeVisible();
    await expect(entry.getByRole("link")).toHaveAttribute("href", copyPath);
    await expect(entry).toContainText(ADMIN);

    // Audit u zdroje.
    const audit = await withDb(async (db) =>
      db.query(
        `select "newValue" from "auditLogs" where "entityType" = 'Task' and "entityId" = $1 and action = 'DUPLICATE'`,
        [taskIdOf(sourcePath)],
      ),
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].newValue.newTaskId).toBe(taskIdOf(copyPath));
  });

  test("neexistující zdroj → upozornění a prázdný formulář", async ({ page }) => {
    await page.goto("/tasks/new?duplicate=neexistujici");
    await expectNoErrorPage(page);
    await expect(
      appAlert(page).filter({
        hasText: "Úkol k duplikaci nebyl nalezen nebo k němu nemáte přístup.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nový úkol", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Název úkolu")).toHaveValue("");
  });

  test("Duplikovat v řádku seznamu úkolů vede na stejný formulář", async ({ page }) => {
    const title = e2eName("dup-radek");
    const path = await createTask(page, title, { assignees: [ADVOKAT] });
    await page.goto("/tasks");
    const row = page.getByRole("row").filter({ hasText: title });
    await row.getByRole("link", { name: `Duplikovat úkol ${title}` }).click();
    await expect(page).toHaveURL(new RegExp(`/tasks/new\\?duplicate=${taskIdOf(path)}$`));
    await expect(page.getByLabel("Název úkolu")).toHaveValue(title);
  });
});

// ---------------------------------------------------------------------------

test.describe("vykázat práci k úkolu", () => {
  test("z detailu: dialog má předvyplněnou věc i úkol, výkaz je hned vidět", async ({ page }) => {
    const title = e2eName("vykaz-detail");
    const path = await createTask(page, title, {
      assignees: [ADVOKAT],
      caseName: SEED_CASE,
    });

    await page.getByRole("link", { name: "Vykázat práci", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}\\?logWork=1$`));
    const dialog = page.getByRole("dialog", { name: "Vykázat práci k úkolu" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Úkol: ${title}.`, { exact: false })).toBeVisible();
    await expect(dialog.getByLabel("Subjekt").locator("option:checked")).toHaveText(
      new RegExp(SEED_SUBJECT),
    );
    await expect(dialog.getByLabel("Projekt").locator("option:checked")).toHaveText(SEED_PROJECT);
    await expect(dialog.getByLabel("Případ").locator("option:checked")).toHaveText(
      new RegExp(SEED_CASE),
    );
    await expect(dialog.getByLabel("Úkol")).toHaveValue(taskIdOf(path));
    await expect(dialog.getByLabel("Datum práce")).toHaveValue(pragueToday());

    const description = e2eName("vykaz-popis");
    await dialog.getByLabel("Hodiny").fill("1.5");
    await dialog.getByLabel("Popis práce").fill(description);
    await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Vytvořit výkaz" }));
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    // Bez ručního reloadu.
    await expect(page.getByRole("row").filter({ hasText: description })).toContainText("1,5");

    const audit = await withDb(async (db) =>
      db.query(
        `select "newValue" from "auditLogs" a join "workLogs" w on w.id = a."entityId"
         where a."entityType" = 'WorkLog' and a.action = 'CREATE' and w.description = $1`,
        [description],
      ),
    );
    expect(audit.rows[0].newValue.taskId).toBe(taskIdOf(path));
  });

  test("Esc dialog zavře bez uložení a URL nemá logWork", async ({ page }) => {
    const title = e2eName("vykaz-esc");
    const path = await createTask(page, title);
    await page.goto(`${path}?logWork=1`);
    const dialog = page.getByRole("dialog", { name: "Vykázat práci k úkolu" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByText("Úkol zatím nemá výkazy práce.")).toBeVisible();
  });

  test("ze seznamu úkolů: dialog na /tasks, po uložení zpět na seznam", async ({ page }) => {
    const title = e2eName("vykaz-seznam");
    const path = await createTask(page, title, { assignees: [ADVOKAT] });
    await page.goto("/tasks");
    await page
      .getByRole("row")
      .filter({ hasText: title })
      .getByRole("link", { name: `Vykázat práci k úkolu ${title}` })
      .click();
    await expect(page).toHaveURL(new RegExp(`/tasks\\?logWork=${taskIdOf(path)}$`));
    const dialog = page.getByRole("dialog", { name: "Vykázat práci k úkolu" });
    await expect(dialog.getByLabel("Úkol")).toHaveValue(taskIdOf(path));
    const description = e2eName("vykaz-ze-seznamu");
    await dialog.getByLabel("Hodiny").fill("0.5");
    await dialog.getByLabel("Popis práce").fill(description);
    await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Vytvořit výkaz" }));
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/tasks$/);

    await page.goto(path);
    await expect(page.getByRole("row").filter({ hasText: description })).toBeVisible();
  });

  test("koncipient jako řešitel vykáže práci bez pole Sazba", async ({ page, browser }) => {
    const title = e2eName("vykaz-koncipient");
    const path = await createTask(page, title, { assignees: [KONCIPIENT] });
    const trainee = await pageAs(browser, "trainee");
    try {
      await trainee.goto(path);
      await trainee.getByRole("link", { name: "Vykázat práci", exact: true }).click();
      const dialog = trainee.getByRole("dialog", { name: "Vykázat práci k úkolu" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Úkol")).toHaveValue(taskIdOf(path));
      await expect(dialog.getByLabel("Sazba")).toHaveCount(0);
      const description = e2eName("vykaz-koncipienta");
      await dialog.getByLabel("Hodiny").fill("1");
      await dialog.getByLabel("Popis práce").fill(description);
      await submitAndAwaitAction(trainee, dialog.getByRole("button", { name: "Vytvořit výkaz" }));
      await expect(dialog).toBeHidden();
      await expect(trainee.getByRole("row").filter({ hasText: description })).toContainText(
        KONCIPIENT,
      );
    } finally {
      await trainee.context().close();
    }
  });

  test("dokončený (archivovaný) úkol zůstane v dialogu předvyplněný", async ({ page }) => {
    const title = e2eName("vykaz-dokonceny");
    const path = await createTask(page, title, { caseName: SEED_CASE });
    await completeTask(page, path);
    await page.getByRole("link", { name: "Vykázat práci", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Vykázat práci k úkolu" });
    await expect(dialog.getByLabel("Úkol")).toHaveValue(taskIdOf(path));
    await expect(dialog.getByLabel("Případ").locator("option:checked")).toHaveText(
      new RegExp(SEED_CASE),
    );
    const description = e2eName("vykaz-po-dokonceni");
    await dialog.getByLabel("Hodiny").fill("0.25");
    await dialog.getByLabel("Popis práce").fill(description);
    await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Vytvořit výkaz" }));
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: description })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------

test.describe("archiv úkolů – filtry", () => {
  test.describe.configure({ mode: "serial" });

  const tag = e2eName("arch");
  const A = `${tag}-A`;
  const B = `${tag}-B`;
  const C = `${tag}-C`;

  async function expectCards(page: Page, shown: string[], hidden: string[]) {
    const section = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Archivované úkoly" }),
    });
    for (const name of shown) {
      await expect(section.getByRole("link", { name, exact: true })).toBeVisible();
    }
    for (const name of hidden) {
      await expect(section.getByRole("link", { name, exact: true })).toHaveCount(0);
    }
  }

  test("příprava: tři dokončené úkoly s různými daty", async ({ page }) => {
    const pathA = await createTask(page, A, { assignees: [ADVOKAT], caseName: SEED_CASE });
    const pathB = await createTask(page, B, { assignees: [KONCIPIENT] });
    const pathC = await createTask(page, C, { assignees: [ADVOKAT] });
    for (const path of [pathA, pathB, pathC]) {
      await completeTask(page, path);
    }
    await withDb(async (db) => {
      await db.query(
        `update tasks set "completedAt" = $2, "archivedAt" = $2 where id = $1`,
        [taskIdOf(pathA), new Date("2026-01-15T10:00:00.000Z")],
      );
      await db.query(
        `update tasks set "completedAt" = $2, "archivedAt" = $2 where id = $1`,
        [taskIdOf(pathB), new Date("2026-02-10T10:00:00.000Z")],
      );
    });
  });

  test("období leden 2026 (URL i výběr) a shrnutí", async ({ page }) => {
    await page.goto(`/tasks/archive?q=${encodeURIComponent(tag)}&period=2026-01`);
    await expectNoErrorPage(page);
    await expectCards(page, [A], [B, C]);
    await expect(page.getByTestId("archive-summary")).toHaveText(
      "Nalezeno 1 úkol · dokončené nebo archivované v období leden 2026",
    );

    await page.goto(`/tasks/archive?q=${encodeURIComponent(tag)}`);
    await expectCards(page, [A, B, C], []);
    await page.getByLabel("Období").selectOption({ label: "leden 2026" });
    await page.getByRole("button", { name: "Filtrovat" }).click();
    await expect(page).toHaveURL(/period=2026-01/);
    await expectCards(page, [A], [B, C]);
  });

  test("řešitel, zadavatel a projekt", async ({ page }) => {
    const koncipientId = await userId(E2E_USERS.trainee.email);
    const adminId = await userId(E2E_USERS.admin.email);
    await page.goto(
      `/tasks/archive?q=${encodeURIComponent(tag)}&assigneeId=${koncipientId}`,
    );
    await expectCards(page, [B], [A, C]);
    await expect(page.getByLabel("Řešitel")).toHaveValue(koncipientId);

    await page.goto(`/tasks/archive?q=${encodeURIComponent(tag)}&createdById=${adminId}`);
    await expectCards(page, [A, B, C], []);

    await page.goto(`/tasks/archive?q=${encodeURIComponent(tag)}`);
    await selectByText(page.getByLabel("Projekt"), SEED_PROJECT);
    await page.getByRole("button", { name: "Filtrovat" }).click();
    await expect(page).toHaveURL(/projectId=/);
    await expectCards(page, [A], [B, C]);
  });

  test("tento měsíc, vlastní rozsah a datum založení", async ({ page }) => {
    await page.goto(`/tasks/archive?q=${encodeURIComponent(tag)}`);
    await page.getByRole("link", { name: "Tento měsíc", exact: true }).click();
    await expect(page).toHaveURL(/period=this-month/);
    await expectCards(page, [C], [A, B]);

    await page.goto(
      `/tasks/archive?q=${encodeURIComponent(tag)}&dateFrom=2026-01-01&dateTo=2026-02-28`,
    );
    await expectCards(page, [A, B], [C]);
    await expect(page.getByTestId("archive-summary")).toContainText(
      "v období 01. 01. 2026 – 28. 02. 2026",
    );

    await page.goto(
      `/tasks/archive?q=${encodeURIComponent(tag)}&dateField=created&period=this-month`,
    );
    await expectCards(page, [A, B, C], []);
    await expect(page.getByTestId("archive-summary")).toContainText("založené v období");
  });

  test("Zrušit filtry a odkaz na detail", async ({ page }) => {
    await page.goto(`/tasks/archive?q=${encodeURIComponent(tag)}&period=2026-01`);
    await page.getByRole("link", { name: "Zrušit filtry" }).click();
    await expect(page).toHaveURL(/\/tasks\/archive$/);
    await expect(page.getByLabel("Název obsahuje")).toHaveValue("");
    await expect(page.getByLabel("Období")).toHaveValue("");

    await page.goto(`/tasks/archive?q=${encodeURIComponent(A)}`);
    await page.getByRole("link", { name: A, exact: true }).click();
    await expect(page).toHaveURL(/\/tasks\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: A, level: 1 })).toBeVisible();
  });

  test("neplatné hodnoty filtrů se ignorují", async ({ page }) => {
    await page.goto(
      "/tasks/archive?period=2026-13&dateFrom=nesmysl&subjectId=%27%3B--&dateField=x",
    );
    await expectNoErrorPage(page);
    await expect(page.getByText(/Databáze .*není připraven/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Archivované úkoly" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------

test.describe("odložení úkolu", () => {
  test.describe.configure({ mode: "serial" });

  const title = e2eName("odlozeni");
  const today = pragueToday();
  const original = addDays(today, 10);
  const first = addDays(today, 20);
  const second = addDays(first, 7);
  const edited = addDays(today, 40);
  let path = "";

  test("odložení s důvodem se zapíše do historie bez reloadu", async ({ page }) => {
    path = await createTask(page, title, {
      assignees: [ADVOKAT],
      supervisors: [KONCIPIENT],
      deadline: original,
    });
    await expect(infoValue(page, "Založeno")).toHaveText(`${czDate(today)} (${ADMIN})`);
    await expect(infoValue(page, "Deadline")).toHaveText(czDate(original));
    await expect(page.getByTestId("deadline-history")).toHaveCount(0);

    await page.getByRole("button", { name: "Odložit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Odložit úkol" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Současný termín:`)).toBeVisible();
    await expect(dialog.getByText(czDate(original))).toBeVisible();

    // Stejný termín → česká chyba, dialog zůstane otevřený.
    await dialog.getByLabel("Nový termín").fill(original);
    await dialog.getByRole("button", { name: "Odložit úkol" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      `Nový termín musí být pozdější než současný termín (${czDate(original)}). Dřívější termín nastavte v úpravě úkolu.`,
    );
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Nový termín").fill(first);
    await dialog.getByLabel("Důvod odložení (volitelné)").fill("e2e-duvod čekáme na klienta");
    await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Odložit úkol" }));
    await expect(dialog).toBeHidden();

    await expect(infoValue(page, "Deadline")).toHaveText(czDate(first));
    await expect(page.getByTestId("deadline-history")).toHaveText(
      `Původní termín: ${czDate(original)} · odloženo 1×`,
    );
    const entry = timeline(page).getByTestId("task-event").first();
    await expect(entry).toContainText(
      `Termín odložen z ${czDate(original)} na ${czDate(first)}`,
    );
    await expect(entry).toContainText("Důvod: e2e-duvod čekáme na klienta");
    await expect(entry).toContainText(ADMIN);
    // Úkol zůstává založený dříve (datum založení se nemění).
    await expect(infoValue(page, "Založeno")).toHaveText(`${czDate(today)} (${ADMIN})`);

    await page.reload();
    await expect(infoValue(page, "Deadline")).toHaveText(czDate(first));
    await expect(timeline(page).getByTestId("task-event")).toHaveCount(1);
  });

  test("druhé odložení rychlou volbou, štítek v seznamu, připomínka se znovu nastaví", async ({
    page,
  }) => {
    const taskId = taskIdOf(path);
    const advokatId = await userId(E2E_USERS.lawyer.email);
    // Už odeslaná připomínka „blíží se deadline“ ke starému termínu.
    await withDb((db) =>
      db.query(
        `insert into notifications (id, "recipientUserId", type, status, subject, body, "entityType", "entityId", "dedupeKey", "updatedAt")
         values ($1, $2, 'TASK_DEADLINE_SOON', 'SENT', 'Blíží se deadline', 'x', 'Task', $3, $4, now())`,
        [
          `e2e-notif-${taskId}`,
          advokatId,
          taskId,
          `task:${taskId}:deadline-soon:${advokatId}`,
        ],
      ),
    );

    await page.goto(path);
    await page.getByRole("button", { name: "Odložit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Odložit úkol" });
    await dialog.getByRole("button", { name: "+1 týden" }).click();
    await expect(dialog.getByLabel("Nový termín")).toHaveValue(second);
    await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Odložit úkol" }));
    await expect(dialog).toBeHidden();
    await expect(infoValue(page, "Deadline")).toHaveText(czDate(second));
    await expect(page.getByTestId("deadline-history")).toHaveText(
      `Původní termín: ${czDate(original)} · odloženo 2×`,
    );

    const dedupe = await withDb((db) =>
      db.query(`select "dedupeKey" from notifications where id = $1`, [`e2e-notif-${taskId}`]),
    );
    expect(dedupe.rows[0].dedupeKey).toBeNull();

    await page.goto("/tasks");
    await expect(page.getByRole("row").filter({ hasText: title })).toContainText("odloženo 2×");
  });

  test("notifikace řešiteli a dohledu, audit a historie v DB", async () => {
    const taskId = taskIdOf(path);
    const [advokatId, koncipientId, adminId] = await Promise.all([
      userId(E2E_USERS.lawyer.email),
      userId(E2E_USERS.trainee.email),
      userId(E2E_USERS.admin.email),
    ]);
    await withDb(async (db) => {
      const notifications = await db.query(
        `select "recipientUserId", subject from notifications
         where "entityType" = 'Task' and "entityId" = $1 and type = 'TASK_DEADLINE_CHANGED'`,
        [taskId],
      );
      const recipients = notifications.rows.map((row) => row.recipientUserId);
      expect(recipients.filter((id) => id === advokatId)).toHaveLength(2);
      expect(recipients.filter((id) => id === koncipientId)).toHaveLength(2);
      expect(recipients).not.toContain(adminId);
      expect(notifications.rows[0].subject).toBe(`Odložení úkolu: ${title}`);

      const audit = await db.query(
        `select "oldValue", "newValue" from "auditLogs"
         where "entityType" = 'Task' and "entityId" = $1 and action = 'POSTPONE'
         order by "createdAt"`,
        [taskId],
      );
      expect(audit.rows).toHaveLength(2);
      expect(audit.rows[0].newValue.reason).toBe("e2e-duvod čekáme na klienta");

      const events = await db.query(
        `select type from "taskEvents" where "taskId" = $1`,
        [taskId],
      );
      expect(events.rows.map((row) => row.type)).toEqual([
        "DEADLINE_POSTPONED",
        "DEADLINE_POSTPONED",
      ]);
    });
  });

  test("změna termínu v úpravě úkolu se zapíše také", async ({ page }) => {
    await page.goto(`${path}/edit`);
    await page.getByLabel("Deadline", { exact: true }).fill(edited);
    await page.getByRole("button", { name: "Uložit úkol" }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(infoValue(page, "Deadline")).toHaveText(czDate(edited));
    await expect(page.getByTestId("deadline-history")).toHaveText(
      `Původní termín: ${czDate(original)} · odloženo 3×`,
    );
    await expect(timeline(page).getByTestId("task-event").first()).toContainText(
      `Termín změněn při úpravě úkolu z ${czDate(second)} na ${czDate(edited)}`,
    );
  });

  test("dohled (koncipient) neodkládá, ale vykáže práci a komentuje", async ({ browser }) => {
    const trainee = await pageAs(browser, "trainee");
    try {
      await trainee.goto(path);
      await expect(trainee.getByRole("heading", { name: title, level: 1 })).toBeVisible();
      await expect(trainee.getByRole("button", { name: "Odložit", exact: true })).toHaveCount(0);
      await expect(trainee.getByRole("link", { name: "Vykázat práci", exact: true })).toBeVisible();
      const comment = e2eName("komentar-dohledu");
      await trainee.getByLabel("Nový komentář").fill(comment);
      await submitAndAwaitAction(
        trainee,
        trainee.getByRole("button", { name: "Přidat komentář" }),
      );
      await expect(timeline(trainee).getByText(comment)).toBeVisible();
      // Komentář i odložení v jedné časové ose.
      await expect(timeline(trainee).getByTestId("task-event")).toHaveCount(3);
    } finally {
      await trainee.context().close();
    }
  });

  test("úkol bez termínu tlačítko Odložit nemá", async ({ page }) => {
    await createTask(page, e2eName("bez-terminu"));
    await expect(page.getByRole("button", { name: "Odložit", exact: true })).toHaveCount(0);
  });
});
