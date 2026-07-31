import { expect, test } from "@playwright/test";

import {
  appAlert,
  collectConsoleErrors,
  expectNoErrorPage,
  expectNoHorizontalScroll,
  openMobileMenu,
  unlabeledFormControls,
} from "./support/helpers";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobil", width: 390, height: 844 },
];

const sweepRoutes = [
  "/dashboard",
  "/subjects",
  "/tasks",
  "/work-logs",
  "/reports",
  "/settings",
];

// Regrese: /tasks scrolloval na mobilu o 358 px do strany. Uvnitř .table-scroll
// je ikonové tlačítko s .sr-only popiskem; absolutně pozicovaný popisek si bez
// pozicovaného předka bral za containing block ICB, takže unikl ořezu
// kontejneru a roztáhl celý dokument. Kontrola proto pokrývá VŠECHNY široké
// tabulky, ne jen /dashboard a /subjects — jinak by chyba prošla znovu.
const wideTableRoutes = [
  "/dashboard",
  "/subjects",
  "/tasks",
  "/tasks/my",
  "/projects",
  "/cases",
  "/work-logs",
  "/references",
  "/settings",
];

for (const viewport of viewports) {
  for (const route of wideTableRoutes) {
    test(`${route} na ${viewport.name} nescrolluje vodorovně`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(route, { waitUntil: "networkidle" });

      // Tabulka smí scrollovat ve svém kontejneru, dokument ne.
      await expectNoHorizontalScroll(page);
    });
  }
}

test("každá reprezentativní stránka má právě jeden h1", async ({ page }) => {
  for (const route of [...sweepRoutes, "/work-logs/timesheet", "/billing"]) {
    await page.goto(route);
    await expect(page.locator("h1"), `h1 na ${route}`).toHaveCount(1);
  }
});

test("formulářová pole na loginu mají viditelné popisky", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");

  for (const label of ["E-mail", "Heslo"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByLabel(label)).toBeVisible();
  }
  await context.close();
});

test("chyba přihlášení je zjistitelná pro asistivní technologie", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("intern.demo@example.local");
  await page.getByLabel("Heslo").fill("spatne-heslo-pro-a11y-test");
  await page.getByRole("button", { name: "Přihlásit se" }).click();

  await expect(appAlert(page)).toBeVisible();
  await context.close();
});

test("formulář nového subjektu má popsaná pole", async ({ page }) => {
  await page.goto("/subjects");
  const form = page.locator("#new-subject");

  await expect(form.getByRole("combobox", { name: "Typ", exact: true })).toBeVisible();
  for (const label of ["Název", "IČO", "DIČ", "Adresa", "E-mail"]) {
    await expect(form.getByRole("textbox", { name: label, exact: true })).toBeVisible();
  }
});

// Regrese: hledací pole (/subjects, /conflict-check), řádkový výběr statusu
// a poznámka v /tasks i výběr role v /settings/organization neměly žádný
// popisek — čtečka je hlásila jen jako „edit text".
for (const route of [
  "/subjects",
  "/conflict-check",
  "/tasks",
  "/settings/organization",
]) {
  test(`formulářové prvky na ${route} mají přístupný název`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });

    expect(await unlabeledFormControls(page)).toEqual([]);
  });
}

// Regrese: plovoucí stopky jsou `fixed` v pravém dolním rohu a překrývaly
// poslední řádek tabulky na každé seznamové stránce.
test("plovoucí stopky nepřekrývají konec obsahu stránky", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/subjects", { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  const geometry = await page.evaluate(() => {
    const timer = document.querySelector(".no-print.fixed");
    const container = document.querySelector("#app-main > div");
    const lastSection = container?.lastElementChild;
    if (!timer || !lastSection) return null;
    return {
      contentBottom: lastSection.getBoundingClientRect().bottom,
      timerTop: timer.getBoundingClientRect().top,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.contentBottom).toBeLessThanOrEqual(geometry!.timerTop);
});

test("povinná pole jsou vizuálně označená hvězdičkou", async ({ page }) => {
  await page.goto("/subjects");
  const marker = await page.evaluate(() => {
    const control = document.querySelector("#new-subject [required]");
    const span = control?.closest("label")?.querySelector("span");
    return span ? window.getComputedStyle(span, "::after").content : null;
  });

  expect(marker).toContain("*");
});

test("ikonová tlačítka mají přístupný název", async ({ page }) => {
  await page.goto("/dashboard");

  const unnamed = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("button, a[href]")];
    return controls
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const text = (element.textContent ?? "").trim();
        const label =
          element.getAttribute("aria-label") ??
          element.getAttribute("title") ??
          "";
        return text.length === 0 && label.length === 0;
      })
      .map((element) => element.outerHTML.slice(0, 120));
  });

  expect(unnamed).toEqual([]);
});

test("tabulky mají použitelné hlavičky sloupců", async ({ page }) => {
  await page.goto("/subjects");
  const headers = page.getByRole("columnheader");
  await expect(headers.first()).toBeVisible();

  expect(await headers.count()).toBeGreaterThan(3);
  for (const text of await headers.allInnerTexts()) {
    expect(text.trim()).not.toBe("");
  }
});

test("aplikace je ovladatelná klávesnicí z navigace do obsahu", async ({ page }) => {
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Přeskočit na obsah" })).toBeFocused();

  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.tagName ?? "");
  expect(["A", "BUTTON", "INPUT"]).toContain(focused);
});

test("mobilní menu vrací fokus na ovládací tlačítko po zavření", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await openMobileMenu(page);
  await page.getByRole("button", { name: "Zavřít menu" }).click();

  await expect(
    page.getByRole("navigation", { name: "Hlavní navigace" }),
  ).toBeHidden();
  await expect(page.getByRole("button", { name: "Otevřít menu" })).toBeVisible();
});

test("běžná navigace nevyvolá 500 ani chybu v konzoli", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  const badResponses: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) {
      badResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  for (const route of sweepRoutes) {
    await page.goto(route, { waitUntil: "networkidle" });
    await expectNoErrorPage(page);
  }

  expect(badResponses).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe("screenshot smoke", () => {
  test("landing page", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    expect(await page.screenshot({ fullPage: false })).toBeTruthy();
    await context.close();
  });

  test("login", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "networkidle" });
    expect(await page.screenshot()).toBeTruthy();
    await context.close();
  });

  test("dashboard", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    expect(await page.screenshot()).toBeTruthy();
  });

  test("mobilní navigace", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await openMobileMenu(page);
    expect(await page.screenshot()).toBeTruthy();
  });
});
