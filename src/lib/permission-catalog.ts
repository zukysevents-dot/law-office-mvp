import { ModuleKey, UserRole } from "@/generated/prisma/enums";

// Katalog oprávnění = JEDINÝ zdroj pravdy o tom, co lze v matici oprávnění
// nastavit, a o výchozích hodnotách pro každou roli. Absence řádku v DB
// (rolePermissionOverrides / userPermissionOverrides) znamená výchozí hodnotu
// odsud, takže změna defaultu tady se projeví všem kancelářím, které si danou
// buňku neupravily. Čistý TS bez DB — importuje ho i klientská matice.
//
// ADMIN má v resolveru VŽDY vše (nikdo se nemůže zamknout); jeho sloupec tady je
// jen informativní a musí být true / "ALL" (hlídá unit test).

export type PermissionScope = "ALL" | "ASSIGNED" | "OWN";

export const MODULE_PERMISSION_KEYS = [
  "module.subjects",
  "module.conflictCheck",
  "module.registry",
  "module.aml",
  "module.projects",
  "module.cases",
  "module.dataBoxes",
  "module.tasks",
  "module.workLogs",
  "module.billing",
  "module.reports",
  "module.performance",
  "module.references",
  "module.deadlines",
  "module.calendar",
  "module.documents",
  "module.hr",
  "module.auditLog",
] as const;

export const SCOPE_PERMISSION_KEYS = [
  "scope.subjects",
  "scope.projects",
  "scope.cases",
  "scope.tasks",
  "scope.workLogs",
  "scope.deadlines",
  "scope.documents",
  "scope.dataMessages",
  "scope.invoices",
  "scope.references",
] as const;

export const FUNCTION_PERMISSION_KEYS = [
  "function.viewRates",
  "function.setBillable",
  "function.approveWorkLogs",
  "function.manageInvoices",
  "function.manageSubjects",
  "function.manageReferences",
  "function.editAllMatters",
  "function.editAssignedMatters",
  "function.editAllWorkLogs",
  "function.archiveRecords",
  "function.manageDeadlines",
  "function.manageDocuments",
  "function.manageDocumentTemplates",
  "function.manageDataBoxes",
  "function.manageAml",
  "function.managePortal",
  "function.manageHr",
  "function.viewTeamReports",
  "function.manageUsers",
  "function.manageOrganization",
  "function.managePermissions",
] as const;

export type ModulePermissionKey = (typeof MODULE_PERMISSION_KEYS)[number];
export type ScopePermissionKey = (typeof SCOPE_PERMISSION_KEYS)[number];
export type FunctionPermissionKey = (typeof FUNCTION_PERMISSION_KEYS)[number];
export type PermissionKey =
  | ModulePermissionKey
  | ScopePermissionKey
  | FunctionPermissionKey;

type Base = {
  label: string;
  description: string;
  // Klíč existuje (resolver ho zná, helpery se ho můžou ptát), ale v matici se
  // zatím nezobrazuje a uložit ho nejde — stránka modulu teprve přijde.
  comingSoon?: boolean;
};

export type ModulePermission = Base & {
  kind: "module";
  key: ModulePermissionKey;
  // Modul kanceláře (entitlement), bez kterého sekce nefunguje ani s oprávněním.
  entitlement: ModuleKey;
  defaults: Record<UserRole, boolean>;
};

export type ScopePermission = Base & {
  kind: "scope";
  key: ScopePermissionKey;
  // Povolené hodnoty v pořadí od nejširší po nejužší.
  options: readonly PermissionScope[];
  defaults: Record<UserRole, PermissionScope>;
  // Co přesně znamená „přiřazené“ / „vlastní“ pro tuto entitu.
  scopeHint: string;
};

export type FunctionPermission = Base & {
  kind: "function";
  key: FunctionPermissionKey;
  defaults: Record<UserRole, boolean>;
  // Hodnotu může měnit jen administrátor (ochrana před eskalací práv).
  adminOnlyEdit?: boolean;
};

export type PermissionDef = ModulePermission | ScopePermission | FunctionPermission;

// Pořadí parametrů = pořadí sloupců: Administrátor, Partner, Advokát,
// Koncipient, Praktikant.
function flags(
  admin: boolean,
  partner: boolean,
  lawyer: boolean,
  trainee: boolean,
  intern: boolean,
): Record<UserRole, boolean> {
  return {
    [UserRole.ADMIN]: admin,
    [UserRole.PARTNER]: partner,
    [UserRole.LAWYER]: lawyer,
    [UserRole.TRAINEE]: trainee,
    [UserRole.INTERN]: intern,
  };
}

function scopes(
  admin: PermissionScope,
  partner: PermissionScope,
  lawyer: PermissionScope,
  trainee: PermissionScope,
  intern: PermissionScope,
): Record<UserRole, PermissionScope> {
  return {
    [UserRole.ADMIN]: admin,
    [UserRole.PARTNER]: partner,
    [UserRole.LAWYER]: lawyer,
    [UserRole.TRAINEE]: trainee,
    [UserRole.INTERN]: intern,
  };
}

const ALL_ROLES = flags(true, true, true, true, true);
const LEADERSHIP = flags(true, true, false, false, false);
const WITH_LAWYER = flags(true, true, true, false, false);

const ALL_ASSIGNED = ["ALL", "ASSIGNED"] as const;
const ALL_ASSIGNED_OWN = ["ALL", "ASSIGNED", "OWN"] as const;

export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  // --- Moduly a sekce -------------------------------------------------------
  {
    kind: "module",
    key: "module.subjects",
    label: "Subjekty",
    description:
      "Seznam a detail subjektů – klienti, protistrany, kontakty. Skrytím sekce lze subjekty dál vybírat ve výkazech podle rozsahu dat.",
    entitlement: ModuleKey.CORE,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.conflictCheck",
    label: "Kontrola střetu zájmů",
    description: "Prověření nového klienta nebo protistrany proti evidenci.",
    entitlement: ModuleKey.CORE,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.registry",
    label: "Hlídání rejstříků",
    description: "Sledování změn v ISIR a obchodním rejstříku.",
    entitlement: ModuleKey.CORE,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.aml",
    label: "AML / KYC",
    description: "Identifikace klientů, hodnocení rizik a sankční prověrky.",
    entitlement: ModuleKey.AML,
    defaults: LEADERSHIP,
  },
  {
    kind: "module",
    key: "module.projects",
    label: "Projekty",
    description: "Seznam a detail projektů.",
    entitlement: ModuleKey.CORE,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.cases",
    label: "Případy",
    description: "Seznam a detail případů (spisů).",
    entitlement: ModuleKey.CORE,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.dataBoxes",
    label: "Datové schránky",
    description: "Přijaté a odeslané datové zprávy.",
    entitlement: ModuleKey.DATA_BOXES,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.tasks",
    label: "Úkoly",
    description: "Úkoly, Moje úkoly a archiv úkolů.",
    entitlement: ModuleKey.CORE,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.workLogs",
    label: "Výkazy práce",
    description:
      "Zápis a přehled odpracovaného času, výkaz pro klienta.",
    entitlement: ModuleKey.CORE,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.billing",
    label: "Fakturace",
    description:
      "Sekce Fakturace v menu. Podklady, faktury a paušály se v ní zobrazí jen spolu s funkcí „Spravuje fakturaci“; schvalovat výkazy lze i bez této sekce (funkce „Schvaluje výkazy celé kanceláře“ nebo schvalovatel u klienta).",
    entitlement: ModuleKey.BILLING,
    defaults: WITH_LAWYER,
  },
  {
    kind: "module",
    key: "module.reports",
    label: "Reporty",
    description:
      "Přehledy hodin a exporty. Reporty za kolegy řídí funkce „Vidí reporty za celou kancelář“.",
    entitlement: ModuleKey.CORE,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.performance",
    label: "Výkonnost",
    description:
      "Přehled výkonnosti zaměstnanců: plnění KPI hodin, úkoly, docházka a vytížení.",
    entitlement: ModuleKey.CORE,
    defaults: LEADERSHIP,
  },
  {
    kind: "module",
    key: "module.references",
    label: "Reference",
    description: "Reference z ukončených věcí pro nabídky.",
    entitlement: ModuleKey.CORE,
    defaults: WITH_LAWYER,
  },
  {
    kind: "module",
    key: "module.deadlines",
    label: "Lhůtník",
    description: "Procesní lhůty a soudní jednání.",
    entitlement: ModuleKey.DEADLINES,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.calendar",
    label: "Kalendář",
    description: "Kalendář lhůt, jednání a termínů úkolů.",
    entitlement: ModuleKey.DEADLINES,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.documents",
    label: "Spisovna a dokumenty",
    description: "Dokumenty, šablony, generování a SharePoint.",
    entitlement: ModuleKey.DOCUMENTS,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.hr",
    label: "HR a docházka",
    description:
      "Vlastní docházka, absence a karta zaměstnance. Správu všech zaměstnanců řídí funkce „Spravuje HR a docházku“.",
    entitlement: ModuleKey.HR_ATTENDANCE,
    defaults: ALL_ROLES,
  },
  {
    kind: "module",
    key: "module.auditLog",
    label: "Audit log",
    description: "Historie změn v kanceláři.",
    entitlement: ModuleKey.CORE,
    defaults: LEADERSHIP,
  },

  // --- Rozsah dat -----------------------------------------------------------
  {
    kind: "scope",
    key: "scope.subjects",
    label: "Subjekty",
    description: "Které subjekty uživatel vidí v seznamech, výběrech a hledání.",
    scopeHint:
      "Přiřazené = klient nebo účastník projektu či případu, na kterém pracuje (i přes tým), nebo subjekt s jeho výkazem.",
    options: ALL_ASSIGNED,
    defaults: scopes("ALL", "ALL", "ALL", "ALL", "ALL"),
  },
  {
    kind: "scope",
    key: "scope.projects",
    label: "Projekty",
    description: "Které projekty uživatel vidí v seznamech, výběrech a hledání.",
    scopeHint:
      "Přiřazené = je odpovědný nebo řešitel projektu či jeho případu (osobně nebo přes tým), má v něm úkol (jako řešitel nebo dohled) nebo výkaz.",
    options: ALL_ASSIGNED,
    defaults: scopes("ALL", "ALL", "ALL", "ALL", "ALL"),
  },
  {
    kind: "scope",
    key: "scope.cases",
    label: "Případy",
    description: "Které případy uživatel vidí v seznamech, výběrech a hledání.",
    scopeHint:
      "Přiřazené = je odpovědný nebo řešitel případu či jeho projektu (osobně nebo přes tým), má v něm úkol (jako řešitel nebo dohled) nebo výkaz.",
    options: ALL_ASSIGNED,
    defaults: scopes("ALL", "ALL", "ALL", "ALL", "ALL"),
  },
  {
    kind: "scope",
    key: "scope.tasks",
    label: "Úkoly",
    description: "Které úkoly uživatel vidí v seznamech, výběrech a hledání.",
    scopeHint:
      "Přiřazené = úkol zadal, řeší, má na něj dohled nebo za něj odpovídá, případně je odpovědný nebo řešitel projektu či případu úkolu (osobně nebo přes tým).",
    options: ALL_ASSIGNED,
    defaults: scopes("ALL", "ALL", "ALL", "ALL", "ALL"),
  },
  {
    kind: "scope",
    key: "scope.workLogs",
    label: "Výkazy práce",
    description: "Čí výkazy práce uživatel vidí.",
    scopeHint:
      "Přiřazené = vlastní a výkazy na jeho úkolech, projektech a případech (i přes tým). Vlastní = jen své výkazy.",
    options: ALL_ASSIGNED_OWN,
    defaults: scopes("ALL", "ALL", "ASSIGNED", "OWN", "OWN"),
  },
  {
    kind: "scope",
    key: "scope.deadlines",
    label: "Lhůty a soudní jednání",
    description: "Které lhůty a jednání uživatel vidí v lhůtníku a kalendáři.",
    scopeHint:
      "Přiřazené = vlastní a lhůty jeho případů (i přes tým). Vlastní = je za lhůtu odpovědný nebo ji založil.",
    options: ALL_ASSIGNED_OWN,
    defaults: scopes("ALL", "ALL", "ASSIGNED", "OWN", "OWN"),
  },
  {
    kind: "scope",
    key: "scope.documents",
    label: "Dokumenty",
    description: "Které dokumenty uživatel vidí ve spisovně.",
    scopeHint:
      "Přiřazené = vlastní, dokumenty jeho případů (i přes tým) a jeho subjektů. Vlastní = dokumenty, které založil.",
    options: ALL_ASSIGNED_OWN,
    defaults: scopes("ALL", "ALL", "ASSIGNED", "OWN", "OWN"),
  },
  {
    kind: "scope",
    key: "scope.dataMessages",
    label: "Datové zprávy",
    description: "Které datové zprávy uživatel vidí.",
    scopeHint:
      "Přiřazené = vlastní a zprávy jeho případů (i přes tým). Vlastní = zprávy, které zapsal.",
    options: ALL_ASSIGNED_OWN,
    defaults: scopes("ALL", "ALL", "ASSIGNED", "OWN", "OWN"),
  },
  {
    kind: "scope",
    key: "scope.invoices",
    label: "Faktury",
    description: "Které faktury uživatel vidí ve fakturaci.",
    scopeHint:
      "Přiřazené = vlastní a faktury jeho projektů a případů (i přes tým). Vlastní = faktury, které vytvořil.",
    options: ALL_ASSIGNED_OWN,
    defaults: scopes("ALL", "ALL", "ASSIGNED", "OWN", "OWN"),
  },
  {
    kind: "scope",
    key: "scope.references",
    label: "Reference",
    description: "Které reference uživatel vidí.",
    scopeHint:
      "Přiřazené = reference projektů a případů, na kterých pracoval nebo které řeší (i přes tým).",
    options: ALL_ASSIGNED,
    defaults: scopes("ALL", "ALL", "ASSIGNED", "ASSIGNED", "ASSIGNED"),
  },

  // --- Funkce ---------------------------------------------------------------
  {
    kind: "function",
    key: "function.viewRates",
    label: "Vidí sazby a částky",
    description:
      "Hodinové sazby, paušály a částky ve výkazech, subjektech, projektech, případech a reportech.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.setBillable",
    label: "Nastavuje fakturovatelnost výkazů",
    description:
      "Může výkaz rovnou označit jako fakturovatelný; ostatní volí „ke schválení“ nebo „interní“.",
    defaults: WITH_LAWYER,
  },
  {
    kind: "function",
    key: "function.approveWorkLogs",
    label: "Schvaluje výkazy celé kanceláře",
    description:
      "Schvaluje fakturační podklady všech klientů. Schvalovatelé určení u klienta schvalují i bez tohoto oprávnění.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.manageInvoices",
    label: "Spravuje fakturaci",
    description:
      "Vystavuje a ruší faktury, eviduje platby, upomínky a paušály.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.manageSubjects",
    label: "Zakládá a upravuje subjekty",
    description:
      "Včetně kontaktních osob, schvalovatelů a hlídání rejstříků.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.manageReferences",
    label: "Zakládá a upravuje reference",
    description: "Reference z ukončených věcí pro nabídky.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.editAllMatters",
    label: "Upravuje všechny projekty, případy a úkoly",
    description:
      "Bez tohoto oprávnění upravuje jen ty, kde je odpovědný nebo řešitel.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.editAssignedMatters",
    label: "Upravuje svoje projekty a případy",
    description:
      "Projekty a případy, kde je odpovědný nebo řešitel (i přes tým). Úkoly, které zadal nebo řeší, upravuje každý.",
    defaults: WITH_LAWYER,
  },
  {
    kind: "function",
    key: "function.editAllWorkLogs",
    label: "Upravuje výkazy ostatních",
    description: "Bez tohoto oprávnění upravuje jen své výkazy.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.archiveRecords",
    label: "Archivuje a obnovuje záznamy",
    description:
      "Archivace a obnovení subjektů, projektů, případů, úkolů, výkazů, referencí a dokumentů.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.manageDeadlines",
    label: "Spravuje lhůty a soudní jednání",
    description: "Zakládá, upravuje a uzavírá procesní lhůty a jednání.",
    defaults: WITH_LAWYER,
  },
  {
    kind: "function",
    key: "function.manageDocuments",
    label: "Zakládá a upravuje dokumenty",
    description: "Nové dokumenty, verze a generování ze šablon.",
    defaults: WITH_LAWYER,
  },
  {
    kind: "function",
    key: "function.manageDocumentTemplates",
    label: "Spravuje šablony dokumentů",
    description: "Šablony platí pro celou kancelář.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.manageDataBoxes",
    label: "Pracuje s datovými zprávami",
    description:
      "Zapisuje zprávy, přiřazuje je ke spisu a stahuje přílohy.",
    defaults: WITH_LAWYER,
  },
  {
    kind: "function",
    key: "function.manageAml",
    label: "Provádí AML/KYC kontroly",
    description:
      "Identifikace klientů, hodnocení rizik a sankční prověrky.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.managePortal",
    label: "Sdílí s klientem přes portál",
    description: "Zve klienty do portálu a sdílí s nimi dokumenty.",
    defaults: WITH_LAWYER,
  },
  {
    kind: "function",
    key: "function.manageHr",
    label: "Spravuje HR a docházku",
    description:
      "Všichni zaměstnanci, schvalování absencí, mzdový export.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.viewTeamReports",
    label: "Vidí reporty za celou kancelář",
    description:
      "Reporty podle lidí a týmů, KPI fakturovatelnosti, nevyfakturovaná práce a filtr podle kolegů.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.manageUsers",
    label: "Spravuje uživatele",
    description:
      "Zakládá uživatele, posílá pozvánky, resetuje hesla a nastavuje plán hodin.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.manageOrganization",
    label: "Spravuje nastavení kanceláře",
    description:
      "Členové a role, registrační kódy, týmy, fakturační profil, datové schránky, SharePoint.",
    defaults: LEADERSHIP,
  },
  {
    kind: "function",
    key: "function.managePermissions",
    label: "Spravuje oprávnění",
    description:
      "Upravuje tuto tabulku a výjimky uživatelů. Toto oprávnění může měnit jen administrátor.",
    defaults: LEADERSHIP,
    adminOnlyEdit: true,
  },
];

export const permissionGroupLabels: Record<PermissionDef["kind"], string> = {
  module: "Moduly a sekce",
  scope: "Rozsah dat",
  function: "Funkce",
};

export const permissionGroupDescriptions: Record<PermissionDef["kind"], string> =
  {
    module:
      "Které sekce uživatel vidí v menu a smí otevřít. Skrytá sekce zmizí z menu, hledání i dashboardu a její adresa ukáže „Přístup odepřen“.",
    scope:
      "Které záznamy uživatel vidí v seznamech, výběrech a hledání v rámci kanceláře.",
    function: "Co smí uživatel dělat nad rámec prohlížení.",
  };

export const permissionScopeLabels: Record<PermissionScope, string> = {
  ALL: "Vše v kanceláři",
  ASSIGNED: "Jen přiřazené",
  OWN: "Jen vlastní",
};

// Popisky sloupců matice (plná jména rolí).
export const permissionRoleLabels: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Administrátor",
  [UserRole.PARTNER]: "Partner",
  [UserRole.LAWYER]: "Advokát",
  [UserRole.TRAINEE]: "Koncipient",
  [UserRole.INTERN]: "Praktikant",
};

export const PERMISSION_ROLES: readonly UserRole[] = [
  UserRole.ADMIN,
  UserRole.PARTNER,
  UserRole.LAWYER,
  UserRole.TRAINEE,
  UserRole.INTERN,
];

// Role, jejichž sloupec lze v matici upravit (ADMIN je zamčený).
export const EDITABLE_ROLES: readonly UserRole[] = [
  UserRole.PARTNER,
  UserRole.LAWYER,
  UserRole.TRAINEE,
  UserRole.INTERN,
];

// Hodnoty ukládané do DB (sloupec value).
export const PERMISSION_ALLOW = "ALLOW";
export const PERMISSION_DENY = "DENY";

const catalogByKey = new Map<string, PermissionDef>(
  PERMISSION_CATALOG.map((def) => [def.key, def]),
);

export function getPermissionDef(key: string): PermissionDef | undefined {
  return catalogByKey.get(key);
}

export function isPermissionKey(key: string): key is PermissionKey {
  return catalogByKey.has(key);
}

export function getModulePermissionDef(
  key: ModulePermissionKey,
): ModulePermission {
  return catalogByKey.get(key) as ModulePermission;
}

// Is `value` a valid stored value for permission `key`? Booleans are stored as
// ALLOW/DENY, scopes as one of the permission's own options.
export function isValidPermissionValue(key: string, value: string): boolean {
  const def = catalogByKey.get(key);
  if (!def) {
    return false;
  }
  if (def.kind === "scope") {
    return (def.options as readonly string[]).includes(value);
  }
  return value === PERMISSION_ALLOW || value === PERMISSION_DENY;
}

// Rows shown (and saved) by the matrix — comingSoon keys stay hidden.
export function editablePermissionDefs(): PermissionDef[] {
  return PERMISSION_CATALOG.filter((def) => !def.comingSoon);
}
