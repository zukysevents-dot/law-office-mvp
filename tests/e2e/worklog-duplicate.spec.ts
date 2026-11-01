import { expect, test, type Page } from "@playwright/test";

import {
  e2eName,
  expectNoErrorPage,
  pageAs,
  submitAndAwaitAction,
} from "./support/helpers";

/** Today as YYYY-MM-DD in the office time zone (the dialog's default date). */
function pragueToday() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function ensureDescriptionColumn(page: Page) {
  if ((await page.getByRole("columnheader", { name: "Popis" }).count()) > 0) {
    return;
  }
  await page
    .getByTestId("column-visibility-panel")
    .getByRole("button", { name: /Sloupce/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Zobrazené sloupce" });
  await dialog.getByRole("checkbox", { name: "Popis", exact: true }).check();
  await dialog.getByRole("button", { name: "Uložit sloupce" }).click();
  await expect(dialog).toBeHidden();
}

/** Creates a work log through the "Nový výkaz" dialog. */
async function createWorkLog(
  page: Page,
  { description, date, hours }: { description: string; date: string; hours: string },
) {
  await page.goto("/work-logs?new=1");
  const dialog = page.getByRole("dialog", { name: "Nový výkaz práce" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Datum práce").fill(date);
  await dialog.getByLabel("Hodiny").fill(hours);
  await dialog.getByLabel("Popis práce").fill(description);
  await submitAndAwaitAction(
    page,
    dialog.getByRole("button", { name: "Vytvořit výkaz" }),
  );
  await expect(dialog).toBeHidden();
  await ensureDescriptionColumn(page);
  await expect(page.getByRole("row").filter({ hasText: description })).toHaveCount(1);
}

function rowWith(page: Page, text: string) {
  return page.getByRole("row").filter({ hasText: text });
}

test.describe("duplikace výkazu práce", () => {
  test("Duplikovat v řádku předvyplní dialog a uloží kopii s dnešním datem", async ({
    page,
  }) => {
    const description = e2eName("dup");
    await createWorkLog(page, { description, date: "2026-07-15", hours: "1.5" });

    await rowWith(page, description)
      .getByRole("link", { name: "Duplikovat" })
      .click();
    await expect(page).toHaveURL(/[?&]duplicate=/);
    const dialog = page.getByRole("dialog", { name: "Duplikovat výkaz práce" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Kopie výkazu z 15. 07. 2026.")).toBeVisible();
    await expect(dialog.getByLabel("Hodiny")).toHaveValue("1.5");
    await expect(dialog.getByLabel("Popis práce")).toHaveValue(description);
    await expect(dialog.getByLabel("Datum práce")).toHaveValue(pragueToday());

    const copy = `${description}-kopie`;
    await dialog.getByLabel("Popis práce").fill(copy);
    await submitAndAwaitAction(
      page,
      dialog.getByRole("button", { name: "Vytvořit kopii výkazu" }),
    );
    await expect(dialog).toBeHidden();
    await expectNoErrorPage(page);

    // Bez reloadu: kopie i originál jsou v seznamu, originál beze změny.
    await expect(rowWith(page, copy)).toHaveCount(1);
    const original = page
      .getByRole("row")
      .filter({ hasText: description })
      .filter({ hasNotText: copy });
    await expect(original).toHaveCount(1);
    await expect(original).toContainText("15. 07. 2026");
    await expect(rowWith(page, copy)).toContainText("Odesláno");
  });

  test("zavření dialogu Esc vrátí URL bez parametru duplicate", async ({ page }) => {
    const description = e2eName("dupesc");
    await createWorkLog(page, { description, date: "2026-07-16", hours: "1" });

    await rowWith(page, description)
      .getByRole("link", { name: "Duplikovat" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Duplikovat výkaz práce" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/duplicate=/);
    await expect(rowWith(page, description)).toHaveCount(1);
  });

  test("na stránce Upravit výkaz je Duplikovat", async ({ page }) => {
    const description = e2eName("dupedit");
    await createWorkLog(page, { description, date: "2026-07-17", hours: "2" });

    const editHref = await rowWith(page, description)
      .getByRole("link", { name: "Upravit" })
      .getAttribute("href");
    expect(editHref).toMatch(/^\/work-logs\/[^/]+\/edit$/);
    const id = editHref!.split("/")[2];
    await page.goto(editHref!);
    await page.getByRole("link", { name: "Duplikovat" }).click();

    await expect(page).toHaveURL(new RegExp(`/work-logs\\?duplicate=${id}$`));
    const dialog = page.getByRole("dialog", { name: "Duplikovat výkaz práce" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Popis práce")).toHaveValue(description);
    await expect(dialog.getByLabel("Hodiny")).toHaveValue("2");
  });

  test("koncipient duplikuje vlastní výkaz bez pole Sazba", async ({ browser }) => {
    const page = await pageAs(browser, "trainee");
    const description = e2eName("dupkonc");
    await createWorkLog(page, { description, date: "2026-07-18", hours: "0.5" });

    await rowWith(page, description)
      .getByRole("link", { name: "Duplikovat" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Duplikovat výkaz práce" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Sazba")).toHaveCount(0);
    await expect(dialog.getByLabel("Hodiny")).toHaveValue("0.5");

    const copy = `${description}-kopie`;
    await dialog.getByLabel("Popis práce").fill(copy);
    await submitAndAwaitAction(
      page,
      dialog.getByRole("button", { name: "Vytvořit kopii výkazu" }),
    );
    await expect(dialog).toBeHidden();
    await expect(rowWith(page, copy)).toHaveCount(1);
    await expect(page.getByRole("columnheader", { name: "Sazba" })).toHaveCount(0);
    await page.context().close();
  });

  test("neexistující výkaz k duplikaci otevře nový výkaz s upozorněním", async ({
    page,
  }) => {
    await page.goto("/work-logs?duplicate=neexistujici");
    await expectNoErrorPage(page);
    const dialog = page.getByRole("dialog", { name: "Nový výkaz práce" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        "Výkaz pro duplikaci nebyl nalezen nebo k němu nemáte přístup.",
      ),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Vytvořit výkaz" })).toBeVisible();
  });
});
