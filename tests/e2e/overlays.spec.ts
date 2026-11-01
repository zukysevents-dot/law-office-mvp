import { expect, test, type Page } from "@playwright/test";

import { storageStatePath } from "./support/e2e-env";
import { e2eName } from "./support/helpers";

// Audit „pop-up okna“: každé vyskakovací okno se zavře klikem mimo (na ztmavené
// pozadí), klávesou Esc i viditelným křížkem „Zavřít“ – a klik mimo okno
// NESPUSTÍ nic, co je pod ním (řádek tabulky, odkaz, tlačítko).

const MOBILE = { width: 390, height: 844 };

function palette(page: Page) {
  return page.getByRole("dialog", { name: "Rychlé hledání" });
}

async function openPaletteByMouse(page: Page) {
  const trigger = page
    .getByRole("navigation", { name: "Hlavní navigace" })
    .getByRole("button", { name: "Hledat v celé aplikaci" });
  await expect(async () => {
    await trigger.click();
    await expect(palette(page)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return trigger;
}

/** Collects POST requests (server actions) fired while `fn` runs. */
async function postsDuring(page: Page, fn: () => Promise<void>) {
  const posts: string[] = [];
  const onRequest = (request: { method(): string; url(): string }) => {
    if (request.method() === "POST") posts.push(request.url());
  };
  page.on("request", onRequest);
  try {
    await fn();
    // Give a stray submit time to fire.
    await page.waitForTimeout(400);
  } finally {
    page.off("request", onRequest);
  }
  return posts;
}

test.describe("rychlé hledání (paleta)", () => {
  test("zavře se křížkem, Escapem i klikem mimo a vrátí fokus", async ({ page }) => {
    await page.goto("/dashboard");

    // ×
    const trigger = await openPaletteByMouse(page);
    await palette(page).getByRole("button", { name: "Zavřít" }).click();
    await expect(palette(page)).toBeHidden();
    await expect(trigger).toBeFocused();

    // Esc – i když je v poli rozepsaný dotaz (Chrome by jinak prvním Esc
    // jen vymazal vyhledávací pole).
    await openPaletteByMouse(page);
    await palette(page).getByRole("searchbox").fill("ABC");
    await page.keyboard.press("Escape");
    await expect(palette(page)).toBeHidden();
    await expect(trigger).toBeFocused();

    // Klik na pozadí (levý horní roh je mimo okno)
    await openPaletteByMouse(page);
    await page.mouse.click(8, 8);
    await expect(palette(page)).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("klik mimo paletu nad řádkem tabulky nepřejde na detail", async ({ page }) => {
    await page.goto("/subjects");
    const row = page.locator("tbody tr[data-href]").first();
    await expect(row).toBeVisible();
    // Poslední buňka řádku leží vpravo, mimo okno palety, a není to odkaz –
    // bez otevřené palety by klik na ni otevřel detail subjektu.
    const box = await row.locator("td").last().boundingBox();
    expect(box).not.toBeNull();

    await openPaletteByMouse(page);
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(palette(page)).toBeHidden();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/subjects$/);
  });
});

test.describe("dialog nového výkazu", () => {
  for (const [label, close] of [
    [
      "křížkem",
      (page: Page) =>
        page
          .getByRole("dialog", { name: "Nový výkaz práce" })
          .getByRole("button", { name: "Zavřít" })
          .click(),
    ],
    ["Escapem", (page: Page) => page.keyboard.press("Escape")],
    ["klikem mimo", (page: Page) => page.mouse.click(8, 8)],
  ] as const) {
    test(`zavře se ${label} a z URL zmizí new=1`, async ({ page }) => {
      await page.goto("/work-logs?new=1");
      const dialog = page.getByRole("dialog", { name: "Nový výkaz práce" });
      await expect(dialog).toBeVisible();
      // Fokus je uvnitř dialogu (první pole formuláře).
      expect(
        await dialog.evaluate((element) => element.contains(document.activeElement)),
      ).toBe(true);

      await close(page);

      await expect(dialog).toBeHidden();
      await expect(page).not.toHaveURL(/new=1/);
      await expect(page).toHaveURL(/\/work-logs/);
    });
  }
});

test.describe("výběr sloupců", () => {
  test("dialog Sloupce se zavře Escapem, křížkem i klikem mimo", async ({ page }) => {
    await page.goto("/projects");
    const trigger = page
      .getByTestId("column-visibility-panel")
      .getByRole("button", { name: /Sloupce/ });
    const dialog = page.getByRole("dialog", { name: "Zobrazené sloupce" });

    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByTestId("column-visibility-checkbox").first(),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByRole("button", { name: "Zavřít" }).click();
    await expect(dialog).toBeHidden();

    await trigger.click();
    const posts = await postsDuring(page, () => page.mouse.click(8, 8));
    await expect(dialog).toBeHidden();
    expect(posts).toEqual([]);
  });
});

test.describe("potvrzovací dialog", () => {
  // Partner: reset dashboardu nesmí ovlivnit souběžné testy admina.
  test.use({ storageState: storageStatePath("partner") });

  test("Zrušit a klik mimo nic neodešlou, potvrzení odešle", async ({ page }) => {
    await page.goto("/dashboard/settings");
    const trigger = page.getByRole("button", { name: "Resetovat dashboard" });
    const dialog = page.getByRole("dialog", { name: "Potvrzení" });

    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Opravdu chcete resetovat dashboard do výchozího nastavení?"),
    ).toBeVisible();
    let posts = await postsDuring(page, () =>
      dialog.getByRole("button", { name: "Zrušit" }).click(),
    );
    await expect(dialog).toBeHidden();
    expect(posts).toEqual([]);

    await trigger.click();
    posts = await postsDuring(page, () => page.mouse.click(8, 8));
    await expect(dialog).toBeHidden();
    expect(posts).toEqual([]);

    await trigger.click();
    posts = await postsDuring(page, () => page.keyboard.press("Escape"));
    await expect(dialog).toBeHidden();
    expect(posts).toEqual([]);

    await trigger.click();
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.request().method() === "POST"),
      dialog.getByRole("button", { name: "Resetovat dashboard" }).click(),
    ]);
    expect(response.status()).toBeLessThan(400);
    await expect(dialog).toBeHidden();
  });
});

test.describe("mobilní menu aplikace", () => {
  test.use({ viewport: MOBILE });

  test("zavře se křížkem i Escapem a klik do horní lišty nic nespustí", async ({
    page,
  }) => {
    await page.goto("/subjects");
    const toggle = page.getByRole("button", { name: "Otevřít menu" });
    const nav = page.getByRole("navigation", { name: "Hlavní navigace" });
    const searchInBar = page.getByRole("button", { name: "Hledat v celé aplikaci" });
    const searchBox = await searchInBar.first().boundingBox();
    expect(searchBox).not.toBeNull();

    await toggle.click();
    await expect(nav).toBeVisible();
    await page.getByRole("button", { name: "Zavřít menu" }).click();
    await expect(nav).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();

    // Otevřené menu překrývá horní lištu: klik tam, kde bylo tlačítko hledání,
    // hledání neotevře ani nikam nepřejde.
    await toggle.click();
    await expect(nav).toBeVisible();
    await page.mouse.click(
      searchBox!.x + searchBox!.width / 2,
      searchBox!.y + searchBox!.height / 2,
    );
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/subjects$/);
  });
});

test.describe("mobilní menu landingu", () => {
  test.use({ viewport: MOBILE, storageState: { cookies: [], origins: [] } });

  test("klik mimo menu ho zavře a nespustí odkaz pod ním", async ({ page }) => {
    await page.goto("/");
    // Přístupné jméno přepínače se mění (Otevřít/Zavřít menu) – drž se aria-controls.
    const toggle = page.locator('button[aria-controls="mobile-menu"]');
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    const cta = page.locator("#main").getByRole("link", { name: "Spustit systém" }).first();
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/$/);

    // Escape menu také zavře.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("zrušení registračního kódu", () => {
  test("je nevratné, proto se nejdřív potvrzuje", async ({ page }) => {
    const label = e2eName("kod");
    await page.goto("/settings/organization");
    const form = page.locator("form").filter({
      has: page.getByRole("button", { name: "Vytvořit registrační kód" }),
    });
    await form.getByLabel("Název kódu").fill(label);
    await form.getByRole("button", { name: "Vytvořit registrační kód" }).click();

    const row = page.getByRole("row").filter({ hasText: label });
    await expect(row).toContainText("Aktivní");
    const dialog = page.getByRole("dialog", { name: "Zrušit registrační kód" });

    // Klik mimo dialog nic neodešle a kód zůstane aktivní.
    await row.getByRole("button", { name: "Zrušit" }).click();
    await expect(dialog).toBeVisible();
    const posts = await postsDuring(page, () => page.mouse.click(8, 8));
    await expect(dialog).toBeHidden();
    expect(posts).toEqual([]);
    await expect(row).toContainText("Aktivní");

    // „Ponechat kód“ dialog jen zavře.
    await row.getByRole("button", { name: "Zrušit" }).click();
    await dialog.getByRole("button", { name: "Ponechat kód" }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Aktivní");

    // Potvrzení kód zruší.
    await row.getByRole("button", { name: "Zrušit" }).click();
    await dialog.getByRole("button", { name: "Ano, zrušit kód" }).click();
    await expect(row).toContainText("Zrušený");
  });
});
