import { expect, type Browser, type Locator, type Page } from "@playwright/test";

import {
  E2E_PASSWORD,
  E2E_PREFIX,
  E2E_USERS,
  storageStatePath,
  type RoleKey,
} from "./e2e-env";

/** A fresh page already signed in as `role` (reuses the stored session). */
export async function pageAs(browser: Browser, role: RoleKey): Promise<Page> {
  const context = await browser.newContext({
    storageState: storageStatePath(role),
    viewport: { width: 1440, height: 900 },
  });
  return context.newPage();
}

/** Real UI login — for the auth flows themselves, not for reaching a page. */
export async function loginViaForm(
  page: Page,
  role: RoleKey,
  password: string = E2E_PASSWORD,
) {
  await page.getByLabel("E-mail").fill(E2E_USERS[role].email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Odhlásit se" }).first().click();
  await expect(page).toHaveURL(/\/login/);
}

/**
 * The app's own `role="alert"` regions. Next.js injects its route announcer
 * (`div#__next-route-announcer__[role=alert]`) into every page, so a plain
 * `getByRole("alert")` is always ambiguous — the id filter is the only way to
 * exclude a framework-owned element.
 */
export function appAlert(page: Page) {
  return page.locator('[role="alert"]:not([id="__next-route-announcer__"])');
}

/** Fails if the route rendered the 500 boundary or the 404 page. */
export async function expectNoErrorPage(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Něco se pokazilo" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Tuto stránku jsme nenašli" }),
  ).toHaveCount(0);
}

/** Fails if a query degraded to the "database not ready" fallback. */
export async function expectDatabaseReady(page: Page) {
  await expect(page.getByText(/Databáze .*není připraven/)).toHaveCount(0);
}

/** The document must not scroll sideways — the classic mobile-layout bug. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  // 1px of rounding slack; anything more is a real layout overflow.
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

/**
 * Every visible form control on the page that has no accessible name — the
 * single most common WCAG 4.1.2 / 3.3.2 failure. Mirrors how a screen reader
 * resolves the name: aria-label → aria-labelledby → <label for> → wrapping
 * <label> → title.
 */
export async function unlabeledFormControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const describe = (element: Element) =>
      `${element.tagName.toLowerCase()}[name=${
        (element as HTMLInputElement).name || "?"
      }]`;

    return [...document.querySelectorAll("input, select, textarea")]
      .filter((element) => {
        const input = element as HTMLInputElement;
        if (input.type === "hidden") return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }

        if (element.getAttribute("aria-label")?.trim()) return false;
        const labelledBy = element.getAttribute("aria-labelledby");
        if (labelledBy) {
          const text = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ")
            .trim();
          if (text) return false;
        }
        if (element.id) {
          const explicit = document.querySelector(
            `label[for="${CSS.escape(element.id)}"]`,
          );
          if (explicit?.textContent?.trim()) return false;
        }
        if (element.closest("label")?.textContent?.trim()) return false;
        if (element.getAttribute("title")?.trim()) return false;
        return true;
      })
      .map(describe);
  });
}

/** Collects console errors and page exceptions for the lifetime of the page. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

/**
 * Clicks a submit button and waits for the server action's POST to come back.
 * Needed whenever the test navigates right after a mutation: `click()` resolves
 * as soon as the event is dispatched, so navigating immediately would cancel
 * the in-flight action.
 */
export async function submitAndAwaitAction(page: Page, button: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    button.click(),
  ]);
  expect(response.status()).toBeLessThan(400);
}

/** Unique-per-run name so parallel workers never collide on the same record. */
export function e2eName(label: string) {
  return `${E2E_PREFIX}${label}-${process.pid}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * Opens the ⌘K command palette. The shortcut listener is attached by a client
 * effect, so a keypress fired before hydration is simply lost — retry until the
 * dialog actually opens instead of guessing a delay.
 */
export async function openCommandPalette(page: Page) {
  const palette = page.getByRole("dialog");
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return palette;
}

/** Opens the app shell's main navigation on a mobile viewport. */
export async function openMobileMenu(page: Page) {
  await page.getByRole("button", { name: "Otevřít menu" }).click();
  await expect(page.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible();
}
