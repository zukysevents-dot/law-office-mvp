import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL, E2E_SERVER_ENV } from "./support/e2e-env";
import {
  appAlert,
  e2eName,
  expectNoErrorPage,
  pageAs,
  submitAndAwaitAction,
} from "./support/helpers";

// Audit 09: „U lhůt by měla být možnost vyznačit, že povinnost vázoucí na
// lhůtu byla splněna – a dát k archivaci." Every deadline here is `e2e-`
// prefixed (prepare-e2e-db drops them); most are inserted straight into the
// disposable E2E database so the tests stay independent and fast.

const SEED_CASE = "Žaloba na zaplacení";

function pragueDate(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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

async function insertDeadline({
  title,
  dueInDays,
  responsibleEmail = null,
}: {
  title: string;
  dueInDays: number;
  responsibleEmail?: string | null;
}): Promise<{ id: string; caseId: string }> {
  return withDb(async (client) => {
    const id = `e2e-dl-${Math.random().toString(36).slice(2, 12)}`;
    const result = await client.query<{ id: string; caseId: string }>(
      `INSERT INTO "deadlines"
         ("id", "organizationId", "caseId", "type", "status", "title", "dueDate",
          "responsibleUserId", "updatedAt")
       SELECT $1, c."organizationId", c."id", 'PROCEDURAL', 'OPEN', $2, $3::date,
              (SELECT "id" FROM "users" WHERE "email" = $4), now()
       FROM "cases" c
       WHERE c."name" = $5 AND c."archivedAt" IS NULL
       ORDER BY c."createdAt" ASC
       LIMIT 1
       RETURNING "id", "caseId"`,
      [id, title, pragueDate(dueInDays), responsibleEmail, SEED_CASE],
    );
    expect(result.rowCount, "seed case for deadlines").toBe(1);
    return result.rows[0];
  });
}

function tabs(page: Page) {
  return page.getByRole("navigation", { name: "Zobrazení lhůt" });
}

async function openTab(page: Page, label: "Aktivní" | "Splněné" | "Archiv") {
  await tabs(page).getByRole("link", { name: label, exact: true }).click();
  await expect(
    tabs(page).getByRole("link", { name: label, exact: true }),
  ).toHaveAttribute("aria-current", "page");
}

function row(page: Page | Locator, title: string) {
  return page.getByRole("row", { name: new RegExp(title) });
}

function fulfilDialog(page: Page) {
  return page.getByRole("dialog", { name: "Označit lhůtu jako splněnou" });
}

test.describe("Lhůtník – splnění a archivace lhůt", () => {
  test("splnění s poznámkou, archiv, obnovení a vrácení mezi aktivní", async ({ page }) => {
    const title = e2eName("lhuta-splneni");

    await page.goto("/deadlines");
    await expectNoErrorPage(page);
    const form = page.locator("#new-deadline");
    const caseSelect = form.getByLabel("Případ");
    const caseValue = await caseSelect
      .locator("option", { hasText: SEED_CASE })
      .first()
      .getAttribute("value");
    await caseSelect.selectOption(caseValue!);
    await form.getByLabel("Název lhůty").fill(title);
    await form.getByLabel("Termín", { exact: true }).fill(pragueDate(5));
    await submitAndAwaitAction(page, form.getByRole("button", { name: "Vytvořit lhůtu" }));

    // Shows up in „Blíží se" right away (no reload).
    const upcoming = page.locator("section", {
      has: page.getByRole("heading", { name: "Blíží se (do 30 dní)" }),
    });
    await expect(row(upcoming, title)).toBeVisible();

    // The dialog closes on Escape without changing anything.
    await row(page, title).getByRole("button", { name: "Splněno…" }).click();
    await expect(fulfilDialog(page)).toBeVisible();
    await expect(fulfilDialog(page)).toContainText(title);
    await expect(fulfilDialog(page).getByLabel("Datum splnění")).toHaveValue(pragueDate(0));
    await page.keyboard.press("Escape");
    await expect(fulfilDialog(page)).toBeHidden();
    await expect(row(page, title)).toBeVisible();

    await row(page, title).getByRole("button", { name: "Splněno…" }).click();
    await fulfilDialog(page)
      .getByLabel("Poznámka ke splnění (volitelné)")
      .fill("Podáno datovou schránkou, ID 42");
    await submitAndAwaitAction(
      page,
      fulfilDialog(page).getByRole("button", { name: "Označit jako splněnou" }),
    );
    await expect(fulfilDialog(page)).toBeHidden();
    // Left the active list without a reload.
    await expect(row(page, title)).toHaveCount(0);

    await openTab(page, "Splněné");
    const fulfilled = row(page, title);
    await expect(fulfilled).toBeVisible();
    await expect(fulfilled).toContainText("Splněná");
    await expect(fulfilled).toContainText("Admin Demo");
    await expect(fulfilled).toContainText("Podáno datovou schránkou, ID 42");

    // Archive → leaves „Splněné", shows in „Archiv".
    await submitAndAwaitAction(page, fulfilled.getByRole("button", { name: "Archivovat" }));
    await expect(row(page, title)).toHaveCount(0);
    await openTab(page, "Archiv");
    await expect(row(page, title)).toContainText("Splněná");

    // Restore → back in „Splněné".
    await submitAndAwaitAction(
      page,
      row(page, title).getByRole("button", { name: "Obnovit z archivu" }),
    );
    await expect(row(page, title)).toHaveCount(0);
    await openTab(page, "Splněné");
    await expect(row(page, title)).toBeVisible();

    // Back to active (confirmed in a dialog).
    await row(page, title).getByRole("button", { name: "Vrátit mezi aktivní" }).click();
    const confirm = page.getByRole("dialog", { name: "Vrátit lhůtu mezi aktivní" });
    await expect(confirm).toContainText("Znovu se začne hlídat");
    await submitAndAwaitAction(
      page,
      confirm.getByRole("button", { name: "Vrátit mezi aktivní" }),
    );
    await expect(row(page, title)).toHaveCount(0);
    await openTab(page, "Aktivní");
    await expect(row(page, title)).toBeVisible();

    // Audit log has the Czech labels.
    await page.goto("/audit-log?entityType=Deadline");
    await expect(page.getByRole("cell", { name: "Splnění", exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Vrácení mezi aktivní", exact: true }).first(),
    ).toBeVisible();
  });

  test("„Splnit a archivovat“ jde rovnou do archivu; budoucí datum je chyba", async ({ page }) => {
    const title = e2eName("lhuta-archiv");
    await insertDeadline({ title, dueInDays: 3 });

    await page.goto("/deadlines");
    await row(page, title).getByRole("button", { name: "Splněno…" }).click();
    const dialog = fulfilDialog(page);

    await dialog.getByLabel("Datum splnění").fill(pragueDate(2));
    await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Označit jako splněnou" }));
    await expect(appAlert(page).filter({ hasText: "Datum splnění nemůže být v budoucnosti." })).toBeVisible();
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Datum splnění").fill(pragueDate(-1));
    await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Splnit a archivovat" }));
    await expect(dialog).toBeHidden();
    await expect(row(page, title)).toHaveCount(0);

    await openTab(page, "Splněné");
    await expect(row(page, title)).toHaveCount(0);
    await openTab(page, "Archiv");
    await expect(row(page, title)).toContainText("Splněná");

    await page.goto("/audit-log?entityType=Deadline&action=COMPLETE_ARCHIVE");
    await expect(
      page.getByRole("cell", { name: "Splnění a archivace", exact: true }).first(),
    ).toBeVisible();
  });

  test("lhůta za více než 30 dní je v sekci „Později“", async ({ page }) => {
    const title = e2eName("lhuta-pozdeji");
    await insertDeadline({ title, dueInDays: 45 });

    await page.goto("/deadlines");
    const later = page.locator("section", {
      has: page.getByRole("heading", { name: "Později", exact: true }),
    });
    await expect(row(later, title)).toBeVisible();
    // „Po termínu" stays the first section of the default view.
    await expect(page.getByRole("heading", { name: "Po termínu" })).toBeVisible();
  });

  test("splněná lhůta už neposílá upozornění, čekající se přeskočí", async ({ page, request }) => {
    const open = e2eName("lhuta-hlidana");
    const done = e2eName("lhuta-splnena");
    const openDeadline = await insertDeadline({
      title: open,
      dueInDays: 1,
      responsibleEmail: "admin.demo@example.local",
    });
    const doneDeadline = await insertDeadline({
      title: done,
      dueInDays: 1,
      responsibleEmail: "admin.demo@example.local",
    });
    // A reminder already queued for the deadline about to be fulfilled.
    await withDb((client) =>
      client.query(
        `INSERT INTO "notifications"
           ("id", "recipientUserId", "type", "status", "subject", "body",
            "entityType", "entityId", "dedupeKey", "updatedAt")
         SELECT $1, u."id", 'DEADLINE_SOON', 'PENDING', 'e2e', 'e2e', 'Deadline', $2, $1, now()
         FROM "users" u WHERE u."email" = 'admin.demo@example.local'`,
        [`e2e-notif-${doneDeadline.id}`, doneDeadline.id],
      ),
    );

    await page.goto("/deadlines");
    await row(page, done).getByRole("button", { name: "Splněno…" }).click();
    await submitAndAwaitAction(
      page,
      fulfilDialog(page).getByRole("button", { name: "Označit jako splněnou" }),
    );
    await expect(fulfilDialog(page)).toBeHidden();

    const response = await request.post("/api/internal/notifications/run", {
      headers: {
        Authorization: `Bearer ${E2E_SERVER_ENV.NOTIFICATION_RUN_SECRET}`,
      },
    });
    expect(response.status()).toBe(200);

    const rows = await withDb(async (client) => {
      const result = await client.query<{ entityId: string; status: string; lastError: string | null }>(
        `SELECT "entityId", "status", "lastError" FROM "notifications"
         WHERE "entityType" = 'Deadline' AND "entityId" = ANY($1)`,
        [[openDeadline.id, doneDeadline.id]],
      );
      return result.rows;
    });
    const forOpen = rows.filter((entry) => entry.entityId === openDeadline.id);
    const forDone = rows.filter((entry) => entry.entityId === doneDeadline.id);
    expect(forOpen.length).toBeGreaterThan(0);
    // Only the pre-queued one, now skipped — the cron created nothing new.
    expect(forDone).toEqual([
      { entityId: doneDeadline.id, status: "SKIPPED", lastError: "DEADLINE_COMPLETED" },
    ]);
  });

  test("koncipient vidí lhůty jen pro čtení, advokát je může splnit", async ({ browser }) => {
    const traineeTitle = e2eName("lhuta-koncipient");
    const lawyerTitle = e2eName("lhuta-advokat");
    await insertDeadline({
      title: traineeTitle,
      dueInDays: 4,
      responsibleEmail: "koncipient.demo@example.local",
    });
    await insertDeadline({
      title: lawyerTitle,
      dueInDays: 4,
      responsibleEmail: "advokat.demo@example.local",
    });

    const trainee = await pageAs(browser, "trainee");
    await trainee.goto("/deadlines");
    await expectNoErrorPage(trainee);
    await expect(row(trainee, traineeTitle)).toBeVisible();
    await expect(trainee.getByRole("button", { name: "Splněno…" })).toHaveCount(0);
    await expect(trainee.getByRole("heading", { name: "Nová lhůta" })).toHaveCount(0);
    await openTab(trainee, "Splněné");
    await expect(trainee.getByRole("button", { name: "Archivovat" })).toHaveCount(0);
    await trainee.context().close();

    const lawyer = await pageAs(browser, "lawyer");
    await lawyer.goto("/deadlines");
    await expect(row(lawyer, lawyerTitle).getByRole("button", { name: "Splněno…" })).toBeVisible();
    await lawyer.context().close();
  });

  test("splnění z detailu spisu a zašedlá lhůta v kalendáři", async ({ page }) => {
    const title = e2eName("lhuta-spis");
    const { caseId } = await insertDeadline({ title, dueInDays: 0 });

    await page.goto(`/cases/${caseId}`);
    await expectNoErrorPage(page);
    await row(page, title).getByRole("button", { name: "Splněno…" }).click();
    await expect(fulfilDialog(page)).toContainText(title);
    await submitAndAwaitAction(
      page,
      fulfilDialog(page).getByRole("button", { name: "Označit jako splněnou" }),
    );
    await expect(fulfilDialog(page)).toBeHidden();
    await expect(row(page, title)).toContainText("Splněná");
    await expect(row(page, title)).toContainText(/Splněno .* · Admin Demo/);
    await expect(row(page, title).getByRole("button", { name: "Archivovat" })).toBeVisible();

    // Calendar: still shown, greyed + struck through (agenda view: no
    // „+N další" collapsing of a busy day).
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Agenda" }).click();
    const event = page.locator(".fc-event-done", { hasText: `Lhůta (splněno): ${title}` });
    await expect(event).toBeVisible({ timeout: 15_000 });
  });
});
