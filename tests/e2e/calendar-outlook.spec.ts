import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { buildOutlookSampleIcs } from "../../src/lib/calendar/__fixtures__/outlook-sample";
import { E2E_DATABASE_URL } from "./support/e2e-env";
import {
  appAlert,
  e2eName,
  expectNoErrorPage,
  pageAs,
  submitAndAwaitAction,
} from "./support/helpers";

// Audit 09: „Kalendář propojit s Outlookem – přidám něco do Outlooku – zobrazí
// se mi to v kalendáři v iuriverse." No real network here: the connect form is
// exercised only with addresses the SSRF guard refuses, and the feed itself is
// injected as a fresh cache row (the app never refetches a fresh cache).

const LAWYER_EMAIL = "advokat.demo@example.local";
const SECRET_PATH = "/owa/calendar/e2e-secret-token/";

// Serial: the tests share the lawyer's single feed row.
test.describe.configure({ mode: "serial" });

function pragueToday(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function lawyerFeedCount() {
  return withDb(async (client) => {
    const result = await client.query(
      `SELECT 1 FROM "calendarFeeds" f JOIN "users" u ON u."id" = f."userId"
       WHERE u."email" = $1`,
      [LAWYER_EMAIL],
    );
    return result.rowCount ?? 0;
  });
}

async function injectLawyerFeed() {
  const body = buildOutlookSampleIcs({ anchor: new Date(`${pragueToday()}T12:00:00Z`) });
  await withDb((client) =>
    client.query(
      `INSERT INTO "calendarFeeds"
         ("id", "organizationId", "userId", "secretUrl", "isEncrypted", "urlHint",
          "icsBody", "fetchedAt", "lastAttemptAt", "updatedAt")
       SELECT 'e2e-feed-lawyer', m."organizationId", u."id", $2, false,
              'outlook.office365.com/…/calendar.ics', $3, now(), now(), now()
       FROM "users" u
       JOIN "organizationMembers" m ON m."userId" = u."id" AND m."status" = 'ACTIVE'
       WHERE u."email" = $1
       LIMIT 1
       ON CONFLICT ("organizationId", "userId") DO UPDATE
         SET "icsBody" = EXCLUDED."icsBody", "fetchedAt" = now(), "lastErrorCode" = NULL`,
      [LAWYER_EMAIL, `https://outlook.office365.com${SECRET_PATH}calendar.ics`, body],
    ),
  );
}

async function showWeek(page: Page) {
  await page.getByRole("button", { name: "Týden" }).click();
  await expect(page.locator(".fc-timeGridWeek-view")).toBeVisible();
}

function outlookEvent(page: Page, title: string) {
  return page.locator(".fc-event-outlook", { hasText: title });
}

test.afterAll(async () => {
  await withDb((client) =>
    client.query(`DELETE FROM "calendarFeeds" WHERE "id" = 'e2e-feed-lawyer'`),
  );
});

test("propojení: návod, české chyby a ochrana před vnitřní sítí", async ({ browser }) => {
  await withDb((client) =>
    client.query(`DELETE FROM "calendarFeeds" WHERE "id" = 'e2e-feed-lawyer'`),
  );
  const page = await pageAs(browser, "lawyer");
  await page.goto("/calendar");
  await expectNoErrorPage(page);

  await page.getByRole("button", { name: "Outlook", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Propojení s Outlookem" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Sdílené kalendáře");
  await expect(dialog).toContainText("Publikovat kalendář");

  const field = dialog.getByLabel("Odkaz ICS z Outlooku");
  const submit = dialog.getByRole("button", { name: "Propojit kalendář" });

  await field.fill("http://example.com/calendar.ics");
  await submitAndAwaitAction(page, submit);
  await expect(appAlert(page)).toContainText("musí začínat https://");

  for (const url of [
    "https://127.0.0.1/calendar.ics",
    "https://169.254.169.254/latest/meta-data",
  ]) {
    await field.fill(url);
    await submitAndAwaitAction(page, submit);
    await expect(appAlert(page)).toContainText("neveřejnou adresu");
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await lawyerFeedCount()).toBe(0);
  await page.context().close();
});

test("události z Outlooku v kalendáři, přepínač a detail jen pro čtení", async ({ browser }) => {
  await injectLawyerFeed();
  const page = await pageAs(browser, "lawyer");
  await page.goto("/calendar");
  await expectNoErrorPage(page);

  // Month view: the all-day event of tomorrow and today's meeting.
  await page.getByRole("button", { name: "Měsíc" }).click();
  await expect(outlookEvent(page, "e2e-outlook-celodenní")).toBeVisible({ timeout: 15_000 });

  await showWeek(page);
  const meeting = outlookEvent(page, "e2e-outlook-porada");
  await expect(meeting).toBeVisible();
  await expect(meeting).toContainText("10:00");
  // The weekly series has an occurrence today (anchor − 7 d, weekly).
  await expect(outlookEvent(page, "e2e-outlook-týdenní").first()).toContainText("8:30");

  // Legend toggle hides / shows them without a reload.
  const toggle = page.getByRole("checkbox", { name: "Outlook" });
  await toggle.uncheck();
  await expect(page.locator(".fc-event-outlook")).toHaveCount(0);
  await toggle.check();
  await expect(meeting).toBeVisible();

  // Clicking opens a read-only detail; no navigation.
  const url = page.url();
  await meeting.click();
  const detail = page.getByRole("dialog", { name: "Událost z Outlooku" });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("e2e-outlook-porada");
  await expect(detail).toContainText("10:00–11:00");
  await expect(detail).toContainText("Zasedačka");
  await expect(detail).toContainText("jen pro čtení");
  expect(page.url()).toBe(url);
  await detail.getByRole("button", { name: "Zavřít" }).first().click();
  await expect(detail).toBeHidden();
  await page.context().close();
});

test("cizí Outlook kalendář nevidí ani partner", async ({ browser }) => {
  await injectLawyerFeed();
  const partner = await pageAs(browser, "partner");
  await partner.goto("/calendar");
  await showWeek(partner);
  // Wait for the office events to load before asserting the absence.
  await partner.waitForLoadState("networkidle");
  await expect(partner.locator(".fc-event-outlook")).toHaveCount(0);
  await expect(partner.getByText("e2e-outlook-porada")).toHaveCount(0);
  await partner.context().close();
});

test("nastavení ukazuje jen masku odkazu; odpojení bez reloadu", async ({ browser }) => {
  await injectLawyerFeed();
  const page = await pageAs(browser, "lawyer");
  await page.goto("/settings");
  await expectNoErrorPage(page);

  await expect(page.getByRole("heading", { name: "Outlook kalendář" })).toBeVisible();
  await expect(page.getByText("outlook.office365.com/…/calendar.ics")).toBeVisible();
  expect(await page.content()).not.toContain(SECRET_PATH);

  await page.getByRole("button", { name: "Odpojit Outlook" }).click();
  const confirm = page.getByRole("dialog", { name: "Odpojit Outlook kalendář" });
  await expect(confirm).toContainText("Publikování v Outlooku tím nezrušíte");
  await submitAndAwaitAction(page, confirm.getByRole("button", { name: "Odpojit", exact: true }));
  await expect(page.getByLabel("Odkaz ICS z Outlooku")).toBeVisible();
  expect(await lawyerFeedCount()).toBe(0);

  await page.goto("/calendar");
  await showWeek(page);
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".fc-event-outlook")).toHaveCount(0);
  await page.context().close();
});

test("soudní jednání ukazuje v týdnu skutečný čas", async ({ page }) => {
  const court = e2eName("soud");
  await withDb((client) =>
    client.query(
      `INSERT INTO "courtHearings"
         ("id", "organizationId", "caseId", "court", "hearingAt", "updatedAt")
       SELECT $1, c."organizationId", c."id", $2, $3::timestamp, now()
       FROM "cases" c WHERE c."archivedAt" IS NULL
       ORDER BY c."createdAt" ASC LIMIT 1`,
      [`e2e-hearing-${Math.random().toString(36).slice(2, 10)}`, court, `${pragueToday()} 09:30:00`],
    ),
  );
  await page.goto("/calendar");
  await showWeek(page);
  await expect(page.locator(".fc-event", { hasText: court })).toContainText("9:30");
});

test("zastaralý Outlook kalendář nezdrží lhůty ani události z mezipaměti", async ({ browser }) => {
  // Stale cache (> 10 min) → the calendar refreshes it in the background. The
  // refresh is held for 8 s below (= a slow Outlook server); deadlines and
  // the cached Outlook events must show meanwhile, not after it.
  await injectLawyerFeed();
  await withDb((client) =>
    client.query(
      `UPDATE "calendarFeeds"
          SET "fetchedAt" = now() - interval '20 minutes', "lastAttemptAt" = NULL,
              "refreshLockedAt" = NULL, "secretUrl" = 'https://127.0.0.1/calendar.ics',
              "isEncrypted" = false
        WHERE "id" = 'e2e-feed-lawyer'`,
    ),
  );
  const deadlineTitle = e2eName("lhuta-vedle-outlooku");
  await withDb((client) =>
    client.query(
      `INSERT INTO "deadlines"
         ("id", "organizationId", "caseId", "type", "status", "title", "dueDate",
          "responsibleUserId", "updatedAt")
       SELECT $1, c."organizationId", c."id", 'PROCEDURAL', 'OPEN', $2, $3::date, u."id", now()
       FROM "cases" c
       JOIN "users" u ON u."email" = $4
       WHERE c."archivedAt" IS NULL AND c."organizationId" IN (
         SELECT m."organizationId" FROM "organizationMembers" m
         WHERE m."userId" = u."id" AND m."status" = 'ACTIVE')
       ORDER BY c."createdAt" ASC
       LIMIT 1`,
      [`e2e-dl-${Math.random().toString(36).slice(2, 10)}`, deadlineTitle, pragueToday(), LAWYER_EMAIL],
    ),
  );

  const page = await pageAs(browser, "lawyer");
  let releaseRefresh: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshRequests = 0;
  await page.route("**/api/calendar/outlook/refresh", async (route) => {
    refreshRequests += 1;
    await Promise.race([held, new Promise((resolve) => setTimeout(resolve, 8_000))]);
    await route.continue().catch(() => {});
  });

  await page.goto("/calendar");
  await expectNoErrorPage(page);
  // Year list: no „+N další" collapsing of a busy day.
  await page.getByRole("button", { name: "Rok", exact: true }).click();
  // Well before the held refresh (8 s) would finish.
  await expect(page.locator(".fc-event", { hasText: deadlineTitle })).toBeVisible({
    timeout: 5_000,
  });
  await expect(outlookEvent(page, "e2e-outlook-porada").first()).toBeVisible({ timeout: 5_000 });
  expect(refreshRequests).toBe(1);

  // Once the refresh answers (the guard refuses 127.0.0.1), the Outlook button
  // reports the failure without a reload.
  const refreshed = page.waitForResponse("**/api/calendar/outlook/refresh");
  releaseRefresh();
  expect((await refreshed).status()).toBe(200);
  await expect(
    page.getByRole("button", { name: /poslední aktualizace se nezdařila/ }),
  ).toBeVisible();
  await page.context().close();
});
