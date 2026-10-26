import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "./support/e2e-env";
import {
  e2eName,
  expectNoErrorPage,
  expectNoHorizontalScroll,
  pageAs,
  submitAndAwaitAction,
  unlabeledFormControls,
} from "./support/helpers";

// Every work log here has a unique e2e prefix and a date far in the future, so
// the queue filter `q=<prefix>` isolates exactly the items of one test and the
// seeded data (which is not reset between runs) is never touched.
const DATE = "2031-02-14";

async function selectByText(select: Locator, text: string) {
  const value = await select
    .locator("option", { hasText: text })
    .first()
    .getAttribute("value");
  expect(value, `option „${text}“`).toBeTruthy();
  await select.selectOption(value!);
}

async function createWorkLog(
  page: Page,
  {
    description,
    hours = "1.5",
    caseName,
    subjectName,
  }: {
    description: string;
    hours?: string;
    caseName?: string;
    subjectName?: string;
  },
) {
  await page.goto("/work-logs?new=1");
  const dialog = page.getByRole("dialog", { name: "Nový výkaz práce" });
  await expect(dialog).toBeVisible();
  if (caseName) {
    await selectByText(dialog.getByLabel("Případ"), caseName);
  } else if (subjectName) {
    await selectByText(dialog.getByLabel("Subjekt"), subjectName);
  }
  await dialog.getByLabel("Datum práce").fill(DATE);
  await dialog.getByLabel("Hodiny").fill(hours);
  await dialog.getByLabel("Popis práce").fill(description);
  await submitAndAwaitAction(
    page,
    dialog.getByRole("button", { name: "Vytvořit výkaz" }),
  );
  await expect(dialog).toBeHidden();
}

async function setStoredRate(description: string, rate: number) {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE "workLogs" SET "hourlyRate" = $1 WHERE description = $2`,
      [rate, description],
    );
    expect(result.rowCount).toBe(1);
  } finally {
    await client.end();
  }
}

function cards(page: Page) {
  return page.getByTestId("approval-card");
}

// The filter form is a plain GET form (full page load). The cascade selects
// are controlled React state, so a change made before hydration would be lost —
// wait until the page has settled before touching the filters again.
async function openQueue(page: Page, prefix: string, extra = "") {
  await page.goto(`/billing/approvals?q=${encodeURIComponent(prefix)}${extra}`, {
    waitUntil: "networkidle",
  });
  await expectNoErrorPage(page);
}

async function applyFilters(page: Page, url: RegExp) {
  await page.getByRole("button", { name: "Filtrovat" }).click();
  await expect(page).toHaveURL(url);
  await page.waitForLoadState("networkidle");
}

test.describe("položky ke schválení", () => {
  test("filtry: klient kaskádou, datum, pracovník, zrušení filtrů", async ({ page }) => {
    const p = e2eName("schvalf");
    await createWorkLog(page, { description: `${p}-a`, caseName: "Žaloba na zaplacení" });
    await createWorkLog(page, { description: `${p}-b`, caseName: "Žaloba na zaplacení" });
    await createWorkLog(page, { description: `${p}-c`, subjectName: "XYZ s.r.o." });

    await openQueue(page, p);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByTestId("approval-queue-totals")).toHaveText(
      "Ve frontě: 3 položky · 4,50 h",
    );

    const client = page.getByRole("combobox", { name: "Klient" });
    await selectByText(client, "ABC s.r.o.");
    const project = page.getByRole("combobox", { name: "Projekt" });
    await expect(project.locator("option", { hasText: "Soudní spor ABC" })).toHaveCount(1);
    await applyFilters(page, /subjectId=/);
    await expect(cards(page)).toHaveCount(2);

    await selectByText(client, "XYZ s.r.o.");
    await expect(project.locator("option", { hasText: "Soudní spor ABC" })).toHaveCount(0);

    await page.getByRole("link", { name: "Zrušit filtry" }).click();
    await expect(page).toHaveURL(/\/billing\/approvals$/);
    // Po zrušení filtrů ukazují všechna pole prázdné hodnoty – jinak by další
    // „Filtrovat“ / „Vybrat vše“ potichu použil starý filtr.
    await expect(client).toHaveValue("");
    await expect(project).toHaveValue("");
    await expect(page.getByLabel("Popis obsahuje")).toHaveValue("");

    // Totéž pro pracovníka a datum zadané v URL (soft navigace bez reloadu).
    await openQueue(page, p, `&dateFrom=${DATE}`);
    const workerFilter = page.getByRole("combobox", { name: "Pracovník" }).first();
    await workerFilter.selectOption({ label: "Admin Demo" });
    await applyFilters(page, /userId=/);
    await page.getByRole("link", { name: "Zrušit filtry" }).click();
    await expect(page).toHaveURL(/\/billing\/approvals$/);
    await expect(workerFilter).toHaveValue("");
    await expect(page.getByLabel("Datum od")).toHaveValue("");

    await openQueue(page, p, `&dateFrom=${DATE}&dateTo=${DATE}`);
    await expect(cards(page)).toHaveCount(3);
    await openQueue(page, p, "&dateFrom=2031-02-15");
    await expect(cards(page)).toHaveCount(0);

    await openQueue(page, p);
    // První „Pracovník“ je filtr (každá karta má vlastní výběr pracovníka).
    await page
      .getByRole("combobox", { name: "Pracovník" })
      .first()
      .selectOption({ label: "Admin Demo" });
    await applyFilters(page, /userId=/);
    await expect(cards(page)).toHaveCount(3);
  });

  test("filtry na desktopu: klient, projekt a případ v řádku s ostatními poli", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/billing/approvals", { waitUntil: "networkidle" });
    const box = async (name: string) =>
      (await page.getByRole("combobox", { name }).first().boundingBox())!;
    const [klient, projekt, pripad, pracovnik] = await Promise.all([
      box("Klient"),
      box("Projekt"),
      box("Případ"),
      box("Pracovník"),
    ]);
    // Kaskáda se nesmí skládat do jednoho sloupce (display: contents).
    expect(Math.abs(projekt.y - klient.y)).toBeLessThan(2);
    expect(Math.abs(pripad.y - klient.y)).toBeLessThan(2);
    expect(Math.abs(pracovnik.y - klient.y)).toBeLessThan(2);
    expect(projekt.x).toBeGreaterThan(klient.x + klient.width);
    // Popisek „Datum od“ je přímo nad svým polem.
    const dateLabel = await page.getByText("Datum od", { exact: true }).boundingBox();
    const dateInput = await page.getByLabel("Datum od").boundingBox();
    expect(dateInput!.y - dateLabel!.y).toBeLessThan(40);
    expect(dateInput!.y).toBeGreaterThan(dateLabel!.y);
    await page.screenshot({ path: test.info().outputPath("filters-1400.png") });
  });

  test("popis úkonu je celý vidět na samostatném řádku", async ({ page }) => {
    const p = e2eName("schvalpopis");
    const longText = `${p} ${"Příprava podání a kontrola příloh. ".repeat(11)}\nDruhý řádek popisu úkonu.`;
    await createWorkLog(page, { description: longText });

    await openQueue(page, p);
    await expect(cards(page)).toHaveCount(1);
    const textarea = cards(page).getByRole("textbox", { name: "Popis úkonu" });
    await expect(textarea).toHaveValue(longText);
    const metrics = await textarea.evaluate((element: HTMLTextAreaElement) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      width: element.getBoundingClientRect().width,
    }));
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
    expect(metrics.clientHeight).toBeGreaterThan(60);
    // Přes celou šířku karty, ne v jedné mřížce s „Hodiny“.
    const hoursWidth = await cards(page)
      .getByRole("spinbutton", { name: "Hodiny" })
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(metrics.width).toBeGreaterThan(hoursWidth * 2);
  });

  test("hromadné schválení vybraných položek bez reloadu", async ({ page }) => {
    const p = e2eName("schvalhrom");
    await createWorkLog(page, { description: `${p}-a` });
    await createWorkLog(page, { description: `${p}-b` });

    await openQueue(page, p);
    await expect(cards(page)).toHaveCount(2);
    await page.getByRole("checkbox", { name: "Vybrat vše (podle filtru)" }).check();
    await expect(page.getByText("Vybráno: 2 · 3,00 h")).toBeVisible();

    await page.getByRole("button", { name: "Schválit vybrané" }).click();
    const dialog = page.getByRole("dialog", { name: "Schválit vybrané položky" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("2 položky");
    await expect(dialog).toContainText("3,00 h");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(cards(page)).toHaveCount(2);

    await page.getByRole("button", { name: "Schválit vybrané" }).click();
    await submitAndAwaitAction(
      page,
      dialog.getByRole("button", { name: "Schválit 2 položky" }),
    );
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Žádné položky nečekají na schválení.")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Schváleny 2 položky." })).toBeVisible();

    await page.goto(`/billing?dateFrom=${DATE}&dateTo=${DATE}`);
    await expect(page.getByRole("row").filter({ hasText: `${p}-a` })).toHaveCount(1);
    await expect(page.getByRole("row").filter({ hasText: `${p}-b` })).toHaveCount(1);
  });

  test("hromadné zamítnutí části výběru", async ({ page }) => {
    const p = e2eName("schvalzam");
    await createWorkLog(page, { description: `${p}-a`, hours: "1" });
    await createWorkLog(page, { description: `${p}-b`, hours: "1" });

    await openQueue(page, p);
    await expect(cards(page)).toHaveCount(2);
    const target = cards(page).filter({ hasText: `${p}-a` });
    await target.getByRole("checkbox").check();
    await expect(
      page.getByRole("checkbox", { name: "Vybrat vše (podle filtru)" }),
    ).not.toBeChecked();
    expect(
      await page
        .getByRole("checkbox", { name: "Vybrat vše (podle filtru)" })
        .evaluate((element: HTMLInputElement) => element.indeterminate),
    ).toBe(true);

    await page.getByRole("button", { name: "Zamítnout vybrané" }).click();
    const dialog = page.getByRole("dialog", { name: "Zamítnout vybrané položky" });
    await expect(dialog).toContainText("1 položku");
    await submitAndAwaitAction(
      page,
      dialog.getByRole("button", { name: "Zamítnout 1 položku" }),
    );
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page)).toContainText(`${p}-b`);
    await expect(page.getByRole("status").filter({ hasText: "Zamítnuta 1 položka." })).toBeVisible();

    await page.goto(`/work-logs?dateFrom=${DATE}&dateTo=${DATE}`);
    await expect(page.getByRole("row").filter({ hasText: `${p}-a` })).toContainText(
      "Zamítnuto",
    );
  });

  test("jednotlivé schválení s úpravou popisu", async ({ page }) => {
    const p = e2eName("schvaljed");
    await createWorkLog(page, { description: `${p}-puvodni` });

    await openQueue(page, p);
    const card = cards(page);
    await expect(card).toHaveCount(1);
    await card.getByRole("textbox", { name: "Popis úkonu" }).fill(`${p}-upraveno`);
    await submitAndAwaitAction(page, card.getByRole("button", { name: "Schválit" }));
    await expect(cards(page)).toHaveCount(0);

    await page.goto(`/work-logs?dateFrom=${DATE}&dateTo=${DATE}`);
    const row = page.getByRole("row").filter({ hasText: `${p}-upraveno` });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Schváleno");
  });

  test("Výkazy práce → Ke schválení otevře frontu s přenesenými filtry", async ({
    page,
  }) => {
    await page.goto(`/work-logs?dateFrom=${DATE}&dateTo=${DATE}`);
    const link = page.getByRole("link", { name: /^Ke schválení \(\d+\)$/ });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(
      new RegExp(`/work-logs/approvals\\?dateFrom=${DATE}&dateTo=${DATE}$`),
    );
    await expect(
      page.getByRole("heading", { name: "Položky ke schválení", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Zpět na výkazy" })).toBeVisible();
    await expect(page.getByLabel("Datum od")).toHaveValue(DATE);
  });

  test("koncipient nemá Ke schválení a ve frontě nemůže rozhodovat", async ({
    browser,
  }) => {
    const page = await pageAs(browser, "trainee");
    const p = e2eName("schvalkonc");
    await createWorkLog(page, { description: p });

    await page.goto("/work-logs");
    await expect(page.getByRole("link", { name: /^Ke schválení/ })).toHaveCount(0);

    // Výkazy práce → Ke schválení: jen vlastní položky, jen ke čtení.
    await page.goto(`/work-logs/approvals?q=${encodeURIComponent(p)}`);
    await expectNoErrorPage(page);
    await expect(page.getByText("Nemáte oprávnění schvalovat položky.")).toBeVisible();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page)).toContainText(p);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Schválit" })).toHaveCount(0);

    // Fakturace → Ke schválení: koncipient bez sekce Fakturace, který není
    // schvalovatelem, dostane „Přístup odepřen“ (matice oprávnění).
    await page.goto(`/billing/approvals?q=${encodeURIComponent(p)}`);
    await expect(
      page.getByRole("heading", { name: "Přístup odepřen", level: 2 }),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await page.context().close();
  });

  test("sazba se do fronty posílá jen uživatelům s právem vidět sazby", async ({
    browser,
  }) => {
    const trainee = await pageAs(browser, "trainee");
    const p = e2eName("schvalrate");
    await createWorkLog(trainee, { description: p });
    await setStoredRate(p, 4321.5);

    // Koncipient (bez VIEW_RATES): sazba není v kartě ani v datech stránky
    // (RSC payload ve vložených <script>), přestože ji výkaz uloženou má.
    // (/billing/approvals mu matice oprávnění vůbec neotevře.)
    await trainee.goto(`/work-logs/approvals?q=${encodeURIComponent(p)}`);
    await expectNoErrorPage(trainee);
    await expect(cards(trainee)).toHaveCount(1);
    await expect(cards(trainee)).toContainText(p);
    await expect(
      trainee.getByRole("spinbutton", { name: "Sazba", exact: true }),
    ).toHaveCount(0);
    const html = await trainee.content();
    expect(html).not.toContain("4321.5");
    expect(html).not.toContain("4\u00a0321,5");
    expect(html).not.toContain("4 321,5");
    await trainee.context().close();

    // Kontrola, že test není prázdný: admin sazbu v datech stránky má a v kartě
    // ji vidí i může upravit.
    const admin = await pageAs(browser, "admin");
    await openQueue(admin, p);
    await expect(cards(admin)).toHaveCount(1);
    await expect(
      cards(admin).getByRole("spinbutton", { name: "Sazba", exact: true }),
    ).toHaveValue("4321.5");
    expect(await admin.content()).toContain("4321.5");
    await admin.context().close();
  });

  test("fronta je přístupná a na mobilu bez vodorovného scrollu", async ({
    browser,
  }) => {
    const page = await pageAs(browser, "admin");
    const p = e2eName("schvalmob");
    await createWorkLog(page, { description: `${p} ${"dlouhý popis ".repeat(30)}` });

    await openQueue(page, p);
    await expect(cards(page)).toHaveCount(1);
    expect(await unlabeledFormControls(page)).toEqual([]);

    await page.setViewportSize({ width: 375, height: 812 });
    await openQueue(page, p);
    await expect(cards(page)).toHaveCount(1);
    await cards(page).getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Schválit vybrané" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.context().close();
  });
});
