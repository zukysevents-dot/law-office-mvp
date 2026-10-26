import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "./support/e2e-env";
import {
  appAlert,
  e2eName,
  expectNoErrorPage,
  submitAndAwaitAction,
} from "./support/helpers";

// Týmy a řešitelé (audit balík 04): centrální stránka, hromadné přiřazení
// týmu, detail projektu/případu a audit. Jen administrátor a vlastní `e2e-`
// tým a projekty — praktikant je vyhrazen sériovému bloku v
// roles-and-permissions.spec.ts. Testy v souboru na sebe navazují.
test.describe.configure({ mode: "serial" });

const teamName = e2eName("tym");
const renamedTeam = `${teamName}-spory`;
const base = e2eName("hromadne");
const projectA = `${base}-a`;
const projectB = `${base}-b`;
const CLIENT_OPTION = "ABC s.r.o., IČO 12345678";

async function createProject(page: Page, name: string) {
  await page.goto("/projects");
  const form = page.locator("#new-project");
  await form.getByLabel("Název projektu").fill(name);
  await form
    .getByRole("combobox", { name: "Klient", exact: true })
    .selectOption({ label: CLIENT_OPTION });
  await form.getByRole("button", { name: "Vytvořit projekt" }).click();
  await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  return new URL(page.url()).pathname;
}

function teamCard(page: Page, name: string) {
  return page.getByRole("article", { name, exact: true });
}

async function filterOverview(page: Page) {
  await page.goto(`/settings/assignments?q=${encodeURIComponent(base)}&show=projects`);
  await expect(
    page.getByRole("heading", { name: "Řešitelé projektů a případů" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: `Vybrat ${projectA}` })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: `Vybrat ${projectB}` })).toBeVisible();
}

let projectAPath = "";

test("centrální stránka: tým se založí, přejmenuje a duplicitní název ohlásí chybu", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page
    .getByRole("navigation", { name: "Hlavní navigace" })
    .getByRole("link", { name: "Týmy a řešitelé" })
    .click();
  await expect(page).toHaveURL(/\/settings\/assignments$/);
  await expect(
    page.getByRole("heading", { name: "Týmy a řešitelé", level: 1 }),
  ).toBeVisible();

  await page.getByLabel("Název týmu").fill(teamName);
  await submitAndAwaitAction(page, page.getByRole("button", { name: "Vytvořit tým" }));
  await expect(
    page.getByRole("status").filter({ hasText: `Tým „${teamName}“ byl vytvořen.` }),
  ).toBeVisible();
  await expect(teamCard(page, teamName)).toBeVisible();
  await expect(page.getByLabel("Název týmu")).toHaveValue("");

  // Duplicitní název: srozumitelná chyba místo 500, zadaný text zůstane.
  await page.getByLabel("Název týmu").fill(teamName);
  await submitAndAwaitAction(page, page.getByRole("button", { name: "Vytvořit tým" }));
  await expect(appAlert(page)).toHaveText("Tým s tímto názvem už existuje.");
  await expect(page.getByLabel("Název týmu")).toHaveValue(teamName);
  await expectNoErrorPage(page);

  // Přejmenování v dialogu: Esc i × zavřou bez uložení.
  const renameButton = page.getByRole("button", { name: `Přejmenovat tým ${teamName}` });
  const dialog = page.getByRole("dialog", { name: "Přejmenovat tým" });
  await renameButton.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await renameButton.click();
  await dialog.getByRole("button", { name: "Zavřít" }).click();
  await expect(dialog).toBeHidden();
  await expect(teamCard(page, teamName)).toBeVisible();

  await renameButton.click();
  await dialog.getByLabel("Název týmu").fill(renamedTeam);
  await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Uložit" }));
  await expect(dialog).toBeHidden();
  await expect(teamCard(page, renamedTeam)).toBeVisible();
  await expect(teamCard(page, teamName)).toHaveCount(0);
});

test("hromadné přiřazení týmu ke dvěma projektům se projeví hned", async ({ page }) => {
  projectAPath = await createProject(page, projectA);
  await createProject(page, projectB);

  // Člen týmu: Partner Demo.
  await page.goto("/settings/assignments");
  const card = teamCard(page, renamedTeam);
  await card
    .getByRole("combobox", { name: `Přidat člena do týmu ${renamedTeam}` })
    .selectOption({ label: "Partner Demo" });
  await submitAndAwaitAction(page, card.getByRole("button", { name: "Přidat", exact: true }));
  await expect(
    card.getByRole("button", { name: `Odebrat Partner Demo z týmu ${renamedTeam}` }),
  ).toBeVisible();
  await expect(card.getByText("1 člen", { exact: false })).toBeVisible();

  await filterOverview(page);
  await page.getByRole("checkbox", { name: `Vybrat ${projectA}` }).check();
  await page.getByRole("checkbox", { name: `Vybrat ${projectB}` }).check();
  await expect(page.getByText("Vybráno: 2")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Řešitel", exact: true })
    .selectOption({ label: renamedTeam });
  await submitAndAwaitAction(
    page,
    page.getByRole("button", { name: "Přiřadit vybraným" }),
  );

  // Bez reloadu: hláška, vyprázdněný výběr a chip týmu v obou řádcích.
  await expect(
    page.getByRole("status").filter({
      hasText: `Tým „${renamedTeam}“ přiřazen k 2 záznamům.`,
    }),
  ).toBeVisible();
  await expect(page.getByText("Vybráno: 0")).toBeVisible();
  for (const name of [projectA, projectB]) {
    await expect(
      page.getByRole("row").filter({ hasText: name }).getByText(`Tým ${renamedTeam}`),
    ).toBeVisible();
  }

  // Seznam projektů: sloupec Řešitelé a filtr podle týmu.
  await page.goto("/projects");
  await expect(page.getByRole("columnheader", { name: "Řešitelé" })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Řešitel", exact: true })
    .selectOption({ label: renamedTeam });
  await page.getByRole("button", { name: "Filtrovat" }).click();
  await expect(page).toHaveURL(/assignee=team%3A/);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.getByRole("row").filter({ hasText: projectA })).toContainText(
    `Tým ${renamedTeam}`,
  );

  // Detail projektu ukazuje tým i jeho členy.
  await page.goto(projectAPath);
  await expect(page.getByText(`Tým ${renamedTeam}`)).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Odebrat tým ${renamedTeam}` }),
  ).toBeVisible();
  await expect(page.getByText("Partner Demo", { exact: true }).first()).toBeVisible();

  // Člen týmu dostal jednu souhrnnou notifikaci (stav podle SMTP nezáleží).
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `select n.subject from notifications n
         join users u on u.id = n."recipientUserId"
        where u.email = 'partner.demo@example.local'
          and n.type = 'MATTER_ASSIGNED'
          and n.body like $1`,
      [`%${base}%`],
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].subject).toBe("Přiřazení k 2 projektům");
  } finally {
    await client.end();
  }
});

test("hromadné odebrání se potvrzuje v dialogu", async ({ page }) => {
  await filterOverview(page);
  await page.getByRole("checkbox", { name: "Vybrat vše" }).check();
  await expect(page.getByText("Vybráno: 2")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Řešitel", exact: true })
    .selectOption({ label: renamedTeam });

  const dialog = page.getByRole("dialog", { name: "Odebrat řešitele" });
  await page.getByRole("button", { name: "Odebrat vybraným" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`Odebrat tým ${renamedTeam} z 2 vybraných záznamů?`);

  // Klik mimo dialog nic neodešle.
  const posts: string[] = [];
  const onRequest = (request: { method(): string; url(): string }) => {
    if (request.method() === "POST") posts.push(request.url());
  };
  page.on("request", onRequest);
  await page.mouse.click(8, 8);
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(400);
  page.off("request", onRequest);
  expect(posts).toEqual([]);

  await page.getByRole("button", { name: "Odebrat vybraným" }).click();
  await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Odebrat" }));
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("status").filter({
      hasText: `Tým „${renamedTeam}“ odebrán z 2 záznamů.`,
    }),
  ).toBeVisible();
  for (const name of [projectA, projectB]) {
    await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
      "Bez řešitelů",
    );
  }
});

test("detail případu: přidání a odebrání týmu, zdědění řešitelé z projektu", async ({
  page,
}) => {
  // Tým zpět k projektu A přes detail projektu.
  await page.goto(projectAPath);
  await page
    .getByRole("combobox", { name: "Přidat řešitele nebo tým" })
    .selectOption({ label: `${renamedTeam} (1 člen)` });
  await submitAndAwaitAction(page, page.getByRole("button", { name: "Přidat", exact: true }));
  await expect(
    page.getByRole("button", { name: `Odebrat tým ${renamedTeam}` }),
  ).toBeVisible();

  // Nový případ projektu A.
  const caseName = e2eName("pripad");
  await page.getByRole("link", { name: "Nový případ" }).click();
  const form = page.locator("#new-case");
  await form.getByLabel("Název případu").fill(caseName);
  await form.getByRole("button", { name: "Vytvořit případ" }).click();
  await expect(page).toHaveURL(/\/cases\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: caseName, level: 1 })).toBeVisible();

  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Řešitelé případu" }),
  });
  await expect(section).toContainText("Z projektu (vidí případ díky přiřazení k projektu):");
  await expect(section).toContainText(`Tým ${renamedTeam} (Partner Demo)`);
  await expect(section).toContainText("Zatím bez řešitelů.");

  await section
    .getByRole("combobox", { name: "Přidat řešitele nebo tým" })
    .selectOption({ label: `${renamedTeam} (1 člen)` });
  await submitAndAwaitAction(page, section.getByRole("button", { name: "Přidat", exact: true }));
  const removeTeam = section.getByRole("button", { name: `Odebrat tým ${renamedTeam}` });
  await expect(removeTeam).toBeVisible();

  await submitAndAwaitAction(page, removeTeam);
  await expect(removeTeam).toHaveCount(0);
  await expect(section).toContainText("Zatím bez řešitelů.");
  await expectNoErrorPage(page);
});

test("změny přiřazení jsou v audit logu", async ({ page }) => {
  await page.goto("/audit-log");
  await page.getByLabel("Entita").selectOption({ label: "Tým u projektu" });
  await page.getByRole("button", { name: "Filtrovat" }).click();

  await expect(page).toHaveURL(/entityType=ProjectTeamAssignment/);
  await expect(page.getByRole("row").filter({ hasText: "Vytvoření" }).first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Smazání" }).first()).toBeVisible();
});
