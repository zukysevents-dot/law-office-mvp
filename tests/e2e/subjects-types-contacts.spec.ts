import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "./support/e2e-env";
import {
  appAlert,
  e2eName,
  expectNoErrorPage,
  expectNoHorizontalScroll,
  openCommandPalette,
  pageAs,
} from "./support/helpers";

// Audit 02 – Subjekty: fyzická osoba, FOP (hybrid), více kontaktů a
// statutárních orgánů. Osoby mají `firstName = e2eName(...)`, takže jejich
// složené jméno začíná prefixem `e2e-` a úklid je smaže.

/** IČO, které v seedu ani v jiném testu neexistuje. */
function uniqueIco() {
  return String(50_000_000 + Math.floor(Math.random() * 40_000_000));
}

/** Náhodné platné rodné číslo (10 číslic, dělitelné 11, narozen 1960–1999). */
function uniqueBirthNumber() {
  for (;;) {
    const yy = 60 + Math.floor(Math.random() * 40);
    const mm = 1 + Math.floor(Math.random() * 12);
    const dd = 1 + Math.floor(Math.random() * 28);
    const serial = Math.floor(Math.random() * 1000);
    const head = `${String(yy).padStart(2, "0")}${String(mm).padStart(2, "0")}${String(
      dd,
    ).padStart(2, "0")}`;
    const first9 = Number(`${head}${String(serial).padStart(3, "0")}`);
    const check = (11 - ((first9 * 10) % 11)) % 11;
    if (check === 10) continue;
    return `${head}/${String(serial).padStart(3, "0")}${check}`;
  }
}

/** Unikátní české mobilní číslo ve formátu „+420 7xx xxx xxx“. */
function uniquePhone() {
  const digits = String(700_000_000 + Math.floor(Math.random() * 99_999_999));
  return `+420 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

const newForm = (page: Page) => page.locator("#new-subject");
const textbox = (scope: Locator, name: string) =>
  scope.getByRole("textbox", { name, exact: true });

async function openNewForm(page: Page, type?: "PERSON" | "ENTREPRENEUR" | "COMPANY") {
  await page.goto("/subjects", { waitUntil: "networkidle" });
  const form = newForm(page);
  if (type) {
    await form.getByRole("combobox", { name: "Typ", exact: true }).selectOption(type);
  }
  return form;
}

async function submitNew(page: Page) {
  await newForm(page).getByRole("button", { name: "Vytvořit subjekt" }).click();
  await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);
}

/** Vytvoří právnickou osobu se zadanými kontakty a statutáry, vrátí URL detailu. */
async function createCompany(
  page: Page,
  values: {
    name: string;
    emails?: Array<{ value: string; label?: string }>;
    phone?: string;
    statutory?: Array<{ name: string; fn?: string }>;
  },
) {
  const form = await openNewForm(page);
  await textbox(form, "Název").fill(values.name);
  await textbox(form, "IČO").fill(uniqueIco());
  const emails = values.emails ?? [];
  for (const [index, email] of emails.entries()) {
    // The form starts with an e-mail and a phone row; further e-mails are
    // appended as the last row.
    if (index > 0) {
      await form.getByRole("button", { name: "Přidat e-mail" }).click();
    }
    const row = index === 0 ? form.locator("#kontakty li").first() : form.locator("#kontakty li").last();
    await textbox(row, "E-mail").fill(email.value);
    if (email.label) {
      await row.getByRole("combobox", { name: "Označení" }).fill(email.label);
    }
  }
  if (values.phone) {
    await textbox(form, "Telefon").fill(values.phone);
  }
  for (const [index, body] of (values.statutory ?? []).entries()) {
    await form.getByRole("button", { name: "Přidat statutární orgán" }).click();
    // Nový řádek dostane fokus (klávesnice neztratí místo).
    await expect(textbox(form, "Jméno / název").nth(index)).toBeFocused();
    await textbox(form, "Jméno / název").nth(index).fill(body.name);
    if (body.fn) {
      await form.getByRole("combobox", { name: "Funkce" }).nth(index).fill(body.fn);
    }
  }
  await submitNew(page);
  return page.url();
}

async function createPerson(
  page: Page,
  values: { firstName: string; lastName: string; birthNumber?: string },
) {
  const form = await openNewForm(page, "PERSON");
  await textbox(form, "Jméno").fill(values.firstName);
  await textbox(form, "Příjmení").fill(values.lastName);
  if (values.birthNumber) {
    await textbox(form, "Rodné číslo").fill(values.birthNumber);
  }
  await submitNew(page);
  return page.url();
}

async function abcDetailPath(page: Page) {
  await page.goto("/subjects?q=ABC");
  const href = await page
    .getByRole("table")
    .getByRole("link", { name: "ABC s.r.o." })
    .first()
    .getAttribute("href");
  expect(href).toMatch(/^\/subjects\/[a-z0-9]+$/);
  return href as string;
}

test.describe("subjekty — fyzická osoba a FOP", () => {
  test("fyzická osoba má osobní pole, plné RČ na detailu a doplněné datum narození", async ({
    page,
  }) => {
    const firstName = e2eName("osoba");
    const form = await openNewForm(page, "PERSON");

    // Fyzická osoba nemá IČO, DIČ, právní formu ani ARES.
    await expect(textbox(form, "IČO")).toHaveCount(0);
    await expect(textbox(form, "DIČ")).toHaveCount(0);
    await expect(textbox(form, "Právní forma")).toHaveCount(0);
    await expect(form.getByRole("button", { name: "Načíst z ARES" })).toHaveCount(0);

    await textbox(form, "Jméno").fill(firstName);
    await textbox(form, "Příjmení").fill("Nováková");
    await textbox(form, "Rodné číslo").fill("855115/0003");
    await textbox(form, "Rodné číslo").blur();
    await expect(form.getByText("Datum narození jsme doplnili z rodného čísla.")).toBeVisible();
    await expect(form.locator('input[name="birthDate"]')).toHaveValue("1985-01-15");
    await form.getByRole("combobox", { name: "Státní příslušnost" }).fill("Česká republika");
    await textbox(form, "Titul za jménem").fill("Ph.D.");
    await textbox(form, "Adresa trvalého bydliště").fill("Dlouhá 1, Praha 1");
    await expect(form.getByText(`${firstName} Nováková, Ph.D.`)).toBeVisible();
    await submitNew(page);

    await expect(
      page.getByRole("heading", { name: `${firstName} Nováková, Ph.D.`, level: 1 }),
    ).toBeVisible();
    const basics = page.locator("section", { has: page.getByRole("heading", { name: "Základní údaje" }) });
    await expect(basics.getByText("855115/0003")).toBeVisible();
    await expect(basics.getByText(/15\.\s*0?1\.\s*1985/)).toBeVisible();
    await expect(basics.getByText("Česká republika")).toBeVisible();
    await expect(basics.getByText("Trvalé bydliště")).toBeVisible();
    await expect(basics.getByText("Dlouhá 1, Praha 1")).toBeVisible();
    // Osoba bez IČO nemá hlídání rejstříků.
    await expect(page.getByRole("heading", { name: "Hlídání rejstříků" })).toHaveCount(0);
  });

  test("RČ s chybným součtem se uloží s varováním, nesmyslné RČ formulář neodešle", async ({
    page,
  }) => {
    const firstName = e2eName("rc");
    const form = await openNewForm(page, "PERSON");
    await textbox(form, "Jméno").fill(firstName);
    await textbox(form, "Příjmení").fill("Kontrolní");

    await textbox(form, "Rodné číslo").fill("12345");
    await form.getByRole("button", { name: "Vytvořit subjekt" }).click();
    await expect(page).toHaveURL(/\/subjects$/);
    expect(
      await textbox(form, "Rodné číslo").evaluate((input: HTMLInputElement) =>
        input.checkValidity(),
      ),
    ).toBe(false);

    await textbox(form, "Rodné číslo").fill("800101/0007");
    await textbox(form, "Rodné číslo").blur();
    await expect(
      form.getByText(
        "Rodné číslo nemá platný kontrolní součet nebo datum – zkontrolujte ho. Uložit ho lze i tak.",
      ),
    ).toBeVisible();
    await submitNew(page);
    await expect(page.getByText("800101/0007")).toBeVisible();
  });

  test("fyzická osoba podnikatel je hybrid: jméno a příjmení + IČO a místo podnikání", async ({
    page,
  }) => {
    const firstName = e2eName("fop");
    const tradeName = `${firstName} Dvořák – Truhlářství`;
    const ico = uniqueIco();
    const form = await openNewForm(page, "ENTREPRENEUR");

    await expect(textbox(form, "Rodné číslo")).toHaveCount(0);
    await expect(form.getByRole("button", { name: "Načíst z ARES" })).toBeVisible();
    await textbox(form, "Jméno").fill(firstName);
    await textbox(form, "Příjmení").fill("Dvořák");
    await textbox(form, "Obchodní firma (volitelné)").fill(tradeName);
    await textbox(form, "IČO").fill(ico);
    await textbox(form, "DIČ").fill(`CZ${ico}`);
    await textbox(form, "Místo podnikání / sídlo").fill("Řemeslná 5, Brno");
    await submitNew(page);

    await expect(page.getByRole("heading", { name: tradeName, level: 1 })).toBeVisible();
    const basics = page.locator("section", { has: page.getByRole("heading", { name: "Základní údaje" }) });
    await expect(basics.getByText("Fyzická osoba podnikatel")).toBeVisible();
    await expect(basics.getByText(`${firstName} Dvořák`, { exact: true })).toBeVisible();
    await expect(basics.getByText("Místo podnikání")).toBeVisible();
    await expect(basics.getByText("Řemeslná 5, Brno")).toBeVisible();
    await expect(basics.getByRole("link", { name: ico })).toBeVisible();
    await expect(basics.getByText(`CZ${ico}`)).toBeVisible();
  });
});

test.describe("subjekty — více kontaktů a statutárních orgánů", () => {
  test("více e-mailů a telefon: odkazy mailto/tel, úprava se projeví bez reloadu", async ({
    page,
  }) => {
    const name = e2eName("kontakty");
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const phone = uniquePhone();
    await createCompany(page, {
      name,
      emails: [
        { value: `info-${slug}@example.test` },
        { value: `fakturace-${slug}@example.test`, label: "fakturace" },
      ],
      phone,
    });

    const contacts = page.locator("#kontaktni-udaje");
    await expect(contacts.getByRole("link", { name: `info-${slug}@example.test` })).toHaveAttribute(
      "href",
      `mailto:info-${slug}@example.test`,
    );
    await expect(
      contacts.getByRole("link", { name: `fakturace-${slug}@example.test` }),
    ).toBeVisible();
    await expect(contacts.getByText("fakturace", { exact: false }).first()).toBeVisible();
    await expect(contacts.getByRole("link", { name: phone })).toHaveAttribute(
      "href",
      `tel:${phone.replace(/[^+\d]/g, "")}`,
    );
    await expect(contacts.getByText("Hlavní").first()).toBeVisible();

    await contacts.getByRole("link", { name: "Upravit kontakty" }).click();
    await expect(page).toHaveURL(/\/edit#kontakty$/);
    // Pořadí řádků: info (hlavní), telefon, fakturace.
    await page.getByRole("button", { name: "Odebrat kontakt 2" }).click();
    // Fokus přejde na další řádek (bývalý třetí je teď druhý).
    await expect(page.getByRole("button", { name: "Odebrat kontakt 2" })).toBeFocused();
    await textbox(page.locator("#kontakty"), "E-mail").nth(0).fill(`nove-${slug}@example.test`);
    await page.getByRole("button", { name: /Uložit/ }).click();

    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);
    await expect(contacts.getByRole("link", { name: `nove-${slug}@example.test` })).toBeVisible();
    await expect(contacts.getByRole("link", { name: phone })).toHaveCount(0);
    await expect(contacts.getByRole("link", { name: `info-${slug}@example.test` })).toHaveCount(0);
    await expect(
      contacts.getByRole("link", { name: `fakturace-${slug}@example.test` }),
    ).toBeVisible();
  });

  test("statutární orgány: přidání a odebrání", async ({ page }) => {
    const name = e2eName("statutari");
    const statutory = `Statutár ${e2eName("jednatel")}`;
    await createCompany(page, { name, statutory: [{ name: statutory, fn: "jednatel" }] });

    const section = page.locator("section#statutarni-organy");
    await expect(section.getByText(statutory)).toBeVisible();
    await expect(section.getByText("jednatel", { exact: true })).toBeVisible();

    await section.getByRole("link", { name: "Upravit statutární orgány" }).click();
    await page.getByRole("button", { name: "Odebrat statutární orgán 1" }).click();
    await expect(page.getByRole("button", { name: "Přidat statutární orgán" })).toBeFocused();
    await page.getByRole("button", { name: /Uložit/ }).click();

    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);
    await expect(
      section.getByText("Zatím nejsou evidovány žádné statutární orgány."),
    ).toBeVisible();
    await expect(section.getByText(statutory)).toHaveCount(0);
  });

  test("conflict check najde subjekt podle druhého e-mailu a statutára, paleta podle telefonu", async ({
    page,
  }) => {
    const name = e2eName("konflikt");
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const second = `druhy-${slug}@example.test`;
    const statutory = `Statutár ${e2eName("hledany")}`;
    const phone = uniquePhone();
    await createCompany(page, {
      name,
      emails: [{ value: `prvni-${slug}@example.test` }, { value: second }],
      phone,
      statutory: [{ name: statutory, fn: "jednatel" }],
    });

    await page.goto(`/conflict-check?q=${encodeURIComponent(second)}`);
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
    await expect(page.getByText(`Důvod shody: e-mail ${second}`)).toBeVisible();

    await page.goto(`/conflict-check?q=${encodeURIComponent(statutory)}`);
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
    await expect(page.getByText(`Důvod shody: statutární orgán ${statutory} (jednatel)`)).toBeVisible();

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const palette = await openCommandPalette(page);
    // Bez mezer a bez předvolby — hledání telefonu ignoruje formát.
    await palette.getByRole("searchbox").fill(phone.replace(/\D/g, "").slice(3));
    await expect(palette.getByRole("button", { name: new RegExp(name) })).toBeVisible();
  });

  test("hledání podle rodného čísla; paleta ukáže RČ jen maskované", async ({ page }) => {
    const firstName = e2eName("rcHledani");
    const birthNumber = uniqueBirthNumber();
    await createPerson(page, { firstName, lastName: "Hledaná", birthNumber });

    await page.goto("/subjects");
    await page
      .getByPlaceholder("Název, jméno, IČO, e-mail nebo telefon")
      .fill(birthNumber.replace("/", ""));
    await page.getByRole("button", { name: "Hledat", exact: true }).click();
    const table = page.getByRole("table");
    await expect(table.getByRole("link", { name: `${firstName} Hledaná` })).toBeVisible();
    await expect(table.getByText(birthNumber)).toHaveCount(0);

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const palette = await openCommandPalette(page);
    await palette.getByRole("searchbox").fill(birthNumber);
    const hit = palette.getByRole("button", { name: new RegExp(firstName) });
    await expect(hit).toBeVisible();
    await expect(hit).toContainText(`rodné číslo ••••••/••${birthNumber.slice(-2)}`);
    await expect(palette.getByText(birthNumber)).toHaveCount(0);
  });
});

test.describe("subjekty — oprávnění, audit a mobil", () => {
  test("koncipient vidí kontakty a statutáry, ale nemůže je upravit; praktikant editaci nedostane", async ({
    browser,
    page,
  }) => {
    const abcPath = await abcDetailPath(page);

    const trainee = await pageAs(browser, "trainee");
    await trainee.goto(abcPath);
    const contacts = trainee.locator("#kontaktni-udaje");
    await expect(contacts.getByRole("link", { name: "info@abc.example" })).toBeVisible();
    await expect(contacts.getByRole("link", { name: "Upravit kontakty" })).toHaveCount(0);
    const statutory = trainee.locator("section#statutarni-organy");
    await expect(statutory.getByText("Jan Novák")).toBeVisible();
    await expect(
      statutory.getByRole("link", { name: "Upravit statutární orgány" }),
    ).toHaveCount(0);
    await expect(trainee.getByRole("link", { name: "Upravit subjekt" })).toHaveCount(0);
    await trainee.context().close();

    const intern = await pageAs(browser, "intern");
    await intern.goto(`${abcPath}/edit`);
    await expect(
      intern.getByRole("heading", { name: "Tuto stránku jsme nenašli" }),
    ).toBeVisible();
    await intern.context().close();
  });

  test("audit zaznamená kontakty a rodné číslo jen maskované", async ({ page }) => {
    const firstName = e2eName("audit");
    const birthNumber = uniqueBirthNumber();
    const form = await openNewForm(page, "PERSON");
    await textbox(form, "Jméno").fill(firstName);
    await textbox(form, "Příjmení").fill("Auditovaná");
    await textbox(form, "Rodné číslo").fill(birthNumber);
    await textbox(form, "E-mail").fill(`${firstName.toLowerCase()}@example.test`);
    await submitNew(page);
    const subjectId = page.url().split("/").pop() as string;

    await page.goto("/audit-log?entityType=SubjectContact");
    await expect(page.getByRole("cell", { name: "Kontakt subjektu" }).first()).toBeVisible();
    await expectNoErrorPage(page);

    const client = new Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{ newValue: Record<string, unknown> }>(
        `SELECT "newValue" FROM "auditLogs" WHERE "entityType" = 'Subject' AND "entityId" = $1`,
        [subjectId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].newValue.birthNumber).toBe(`••••••/••${birthNumber.slice(-2)}`);
      expect(JSON.stringify(rows[0].newValue)).not.toContain(birthNumber.slice(0, 6));
      // Plné RČ je uložené jen v záznamu subjektu.
      const subject = await client.query<{ birthNumber: string }>(
        `SELECT "birthNumber" FROM "subjects" WHERE "id" = $1`,
        [subjectId],
      );
      expect(subject.rows[0].birthNumber).toBe(birthNumber);
      // Každý kontakt má vlastní auditní záznam.
      const contactAudit = await client.query(
        `SELECT 1 FROM "auditLogs" WHERE "entityType" = 'SubjectContact' AND "action" = 'CREATE' AND "newValue"->>'subjectId' = $1`,
        [subjectId],
      );
      expect(contactAudit.rowCount).toBe(1);
    } finally {
      await client.end();
    }
  });

  test("uložený conflict check podle RČ drží RČ jen maskované (DB, audit, historie)", async ({
    page,
  }) => {
    const firstName = e2eName("rcCheck");
    const birthNumber = uniqueBirthNumber();
    const masked = `••••••/••${birthNumber.slice(-2)}`;
    const detailUrl = await createPerson(page, {
      firstName,
      lastName: "Prověřovaná",
      birthNumber,
    });
    const subjectId = detailUrl.split("/").pop() as string;

    await page.goto(`/conflict-check?q=${encodeURIComponent(birthNumber)}`);
    await expect(page.getByText(`Důvod shody: rodné číslo ${masked}`)).toBeVisible();
    await page.getByRole("button", { name: "Uložit check" }).click();
    await expect(page.getByRole("button", { name: "Uloženo" })).toBeVisible();

    const client = new Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
      const checks = await client.query<{ searchedQuery: string }>(
        `SELECT "searchedQuery" FROM "conflictChecks" WHERE "subjectId" = $1`,
        [subjectId],
      );
      expect(checks.rows).toHaveLength(1);
      expect(checks.rows[0].searchedQuery).toBe(masked);
      const audit = await client.query<{ entityId: string; newValue: unknown }>(
        `SELECT "entityId", "newValue" FROM "auditLogs" WHERE "entityType" = 'ConflictCheck' AND "newValue"->>'subjectId' = $1`,
        [subjectId],
      );
      expect(audit.rows).toHaveLength(1);
      expect(JSON.stringify(audit.rows[0])).not.toContain(birthNumber.slice(0, 6));
      expect(JSON.stringify(audit.rows[0].newValue)).toContain(masked);
    } finally {
      await client.end();
    }

    await page.goto(detailUrl);
    const history = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Conflict check historie" }) })
      .last();
    await expect(history.getByRole("cell", { name: masked })).toBeVisible();
    await expect(history.getByText(birthNumber)).toHaveCount(0);
  });

  test("formulář s kontakty a statutáry nemá na mobilu vodorovný scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const form = await openNewForm(page);
    await form.getByRole("button", { name: "Přidat e-mail" }).click();
    await form.getByRole("button", { name: "Přidat statutární orgán" }).click();
    await expectNoHorizontalScroll(page);
    await form.getByRole("combobox", { name: "Typ", exact: true }).selectOption("PERSON");
    await expectNoHorizontalScroll(page);

    const abcPath = await abcDetailPath(page);
    await page.goto(abcPath);
    await expect(page.locator("#kontaktni-udaje")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.goto(`${abcPath}/edit`);
    await expect(page.locator("#kontakty")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("neplatný kontakt vrátí formulář se srozumitelnou hláškou", async ({ page }) => {
    const form = await openNewForm(page);
    await textbox(form, "Název").fill(e2eName("spatny-web"));
    await form.getByRole("button", { name: "Přidat jiný kontakt" }).click();
    await form.getByRole("combobox", { name: "Typ kontaktu" }).nth(2).selectOption("WEB");
    await textbox(form, "Webová adresa").fill("javascript:alert(1)");
    await form.getByRole("button", { name: "Vytvořit subjekt" }).click();

    await expect(page).toHaveURL(/\/subjects\?error=contact/);
    await expect(appAlert(page)).toHaveText(
      "Některý kontakt není platný (zkontrolujte e-mail, telefon nebo web).",
    );
  });
});
