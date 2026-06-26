import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  ApprovalStatus,
  BillingStatus,
  CaseStatus,
  FeeType,
  ProjectStatus,
  SubjectRole,
  SubjectType,
  TaskDeadlineType,
  TaskPriority,
  TaskStatus,
} from "../src/generated/prisma/enums";

// Naplní organizaci realistickými demo daty advokátní kanceláře, přiřazenými
// napříč rolemi tak, aby byl vidět rozdíl ve viditelnosti (ADMIN/PARTNER vidí
// vše; LAWYER/TRAINEE/INTERN jen "svoje"). Idempotentní: když už v org subjekty
// jsou, skončí bez zásahu. Předpoklad: db:bootstrap + seed-test-users.
//
// Env: SEED_ORG_SLUG (default "syndikat")

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ORG_SLUG = (process.env.SEED_ORG_SLUG ?? "syndikat").trim().toLowerCase();

const now = new Date();
const at = (d: number, h = 10) => {
  const x = new Date(now);
  x.setDate(x.getDate() + d);
  x.setHours(h, 0, 0, 0);
  return x;
};
const thisMonth = (day: number, h = 10) =>
  new Date(now.getFullYear(), now.getMonth(), day, h, 0, 0);

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (!org) {
    throw new Error(`Organizace "${ORG_SLUG}" neexistuje. Spusť npm run db:bootstrap.`);
  }
  const orgId = org.id;

  // Volitelný reset: smaže demo data v org (v pořadí kvůli FK Restrict).
  if (process.env.SEED_RESET === "1") {
    await prisma.subjectRelation.deleteMany({ where: { subject: { organizationId: orgId } } });
    await prisma.conflictCheck.deleteMany({ where: { organizationId: orgId } });
    await prisma.reference.deleteMany({ where: { organizationId: orgId } });
    await prisma.workLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.task.deleteMany({ where: { organizationId: orgId } });
    await prisma.case.deleteMany({ where: { organizationId: orgId } });
    await prisma.project.deleteMany({ where: { organizationId: orgId } });
    await prisma.subject.deleteMany({ where: { organizationId: orgId } });
    console.log("🧹 Demo data v org vymazána (SEED_RESET=1).");
  }

  const existing = await prisma.subject.count({ where: { organizationId: orgId } });
  if (existing > 0) {
    console.log(
      `\nℹ️  Org "${ORG_SLUG}" už obsahuje ${existing} subjektů — demo seed přeskočen ` +
        `(idempotentní). Smaž data nebo použij čistou org pro nové naplnění.\n`,
    );
    return;
  }

  // --- Uživatelé podle rolí (test účty) ---
  const emails = [
    "admin@syndikat.test",
    "partner@syndikat.test",
    "advokat@syndikat.test",
    "koncipient@syndikat.test",
    "stazista@syndikat.test",
  ];
  const users = await prisma.user.findMany({ where: { email: { in: emails } } });
  const id = (email: string) => {
    const u = users.find((x) => x.email === email);
    if (!u) throw new Error(`Chybí uživatel ${email}. Spusť npx tsx scripts/seed-test-users.ts.`);
    return u.id;
  };
  const ADMIN = id("admin@syndikat.test");
  const PARTNER = id("partner@syndikat.test");
  const LAWYER = id("advokat@syndikat.test");
  const TRAINEE = id("koncipient@syndikat.test");
  const INTERN = id("stazista@syndikat.test");

  // --- Subjekty (klienti, protistrany, potenciální klient) ---
  const mk = (data: {
    type: SubjectType;
    name: string;
    ico?: string;
    dic?: string;
    email?: string;
    address?: string;
    legalForm?: string;
    statutoryBody?: string;
    riskFlag?: boolean;
    vatPayer?: boolean;
    feeType?: FeeType;
    hourlyRate?: number;
    internalNote?: string;
  }) =>
    prisma.subject.create({
      data: {
        organizationId: orgId,
        status: "ACTIVE",
        aresVerifiedAt: data.ico ? at(-20) : null,
        ...data,
      },
    });

  const sNovak = await mk({
    type: SubjectType.COMPANY,
    name: "Stavební firma Novák s.r.o.",
    ico: "27654321",
    dic: "CZ27654321",
    email: "fakturace@stavby-novak.cz",
    address: "Průmyslová 12, 370 01 České Budějovice",
    legalForm: "s.r.o.",
    statutoryBody: "Ing. Petr Novák, jednatel",
    vatPayer: true,
    feeType: FeeType.HOURLY,
    hourlyRate: 2800,
  });
  const sDvorak = await mk({
    type: SubjectType.PERSON,
    name: "Jan Dvořák",
    email: "jan.dvorak@email.cz",
    address: "Nová 45, 140 00 Praha 4",
    feeType: FeeType.FLAT,
    internalNote: "Rozvod — citlivá rodinná situace, komunikovat opatrně.",
  });
  const sTechSoft = await mk({
    type: SubjectType.COMPANY,
    name: "TechSoft a.s.",
    ico: "29012345",
    dic: "CZ29012345",
    email: "legal@techsoft.cz",
    address: "Karlovo náměstí 10, 120 00 Praha 2",
    legalForm: "a.s.",
    vatPayer: true,
    feeType: FeeType.MIXED,
    hourlyRate: 3500,
  });
  const sSvobodova = await mk({
    type: SubjectType.PERSON,
    name: "Marie Svobodová",
    email: "m.svobodova@email.cz",
    address: "Lipová 8, 602 00 Brno",
    feeType: FeeType.HOURLY,
    hourlyRate: 2200,
  });
  const sPekarna = await mk({
    type: SubjectType.COMPANY,
    name: "Pekárna U Lípy s.r.o.",
    ico: "25098765",
    dic: "CZ25098765",
    email: "ucetni@pekarna-ulipy.cz",
    address: "Náměstí 3, 500 02 Hradec Králové",
    legalForm: "s.r.o.",
    vatPayer: true,
    feeType: FeeType.HOURLY,
    hourlyRate: 2500,
  });
  const sRealitni = await mk({
    type: SubjectType.COMPANY,
    name: "Realitní skupina Praha s.r.o.",
    ico: "06123456",
    dic: "CZ06123456",
    email: "info@rsp.cz",
    address: "Vinohradská 100, 130 00 Praha 3",
    legalForm: "s.r.o.",
    vatPayer: true,
    feeType: FeeType.HOURLY,
    hourlyRate: 3200,
  });
  // protistrany
  const sBetonMix = await mk({
    type: SubjectType.COMPANY,
    name: "Beton-Mix s.r.o.",
    ico: "28765432",
    address: "Betonová 1, 370 01 České Budějovice",
    legalForm: "s.r.o.",
    riskFlag: true,
  });
  const sCerny = await mk({
    type: SubjectType.PERSON,
    name: "Petr Černý",
    address: "Krátká 2, 140 00 Praha 4",
  });
  const sDruzstvo = await mk({
    type: SubjectType.OTHER,
    name: "Bytové družstvo Kavčí Hory",
    ico: "63987654",
    address: "Kavčí Hory 5, 140 00 Praha 4",
    legalForm: "družstvo",
  });
  // potenciální klient (s rizikem)
  const sStartup = await mk({
    type: SubjectType.COMPANY,
    name: "StartUp Vize s.r.o.",
    ico: "17345678",
    email: "hello@startupvize.cz",
    address: "Sokolovská 200, 190 00 Praha 9",
    legalForm: "s.r.o.",
    riskFlag: true,
    internalNote: "Potenciální klient — ověřit konflikt + AML před převzetím.",
  });

  // --- Projekty (mainSubject + odpovědný) ---
  const project = (
    name: string,
    mainSubjectId: string,
    responsibleUserId: string,
    hourlyRate?: number,
    status: ProjectStatus = ProjectStatus.ACTIVE,
  ) =>
    prisma.project.create({
      data: { organizationId: orgId, name, mainSubjectId, responsibleUserId, hourlyRate, status },
    });

  const pNovak = await project("Výstavba administrativní budovy — spory", sNovak.id, LAWYER, 2800);
  const pDvorak = await project("Rozvod a úprava poměrů nezletilých", sDvorak.id, PARTNER);
  const pTechSoft = await project("Ochrana softwaru a licencování", sTechSoft.id, LAWYER, 3500);
  const pSvobodova = await project("Pracovněprávní spor — neplatná výpověď", sSvobodova.id, ADMIN, 2200);
  const pRealitni = await project("Korporátní agenda 2026", sRealitni.id, PARTNER, 3200);
  const pPekarna = await project("Vymáhání pohledávek", sPekarna.id, LAWYER, 2500);

  // --- Případy (spisy) ---
  const legalCase = (
    projectId: string,
    name: string,
    fileNumber: string,
    responsibleUserId: string,
    status: CaseStatus = CaseStatus.ACTIVE,
  ) =>
    prisma.case.create({
      data: { organizationId: orgId, projectId, name, fileNumber, responsibleUserId, status },
    });

  const cViceprace = await legalCase(pNovak.id, "Žaloba o zaplacení víceprací", "SP-2026/001", LAWYER);
  const cReklamace = await legalCase(pNovak.id, "Reklamace vad díla", "SP-2026/002", LAWYER);
  const cPece = await legalCase(pDvorak.id, "Úprava poměrů nezletilých", "SP-2026/003", PARTNER);
  const cLicence = await legalCase(pTechSoft.id, "Licenční smlouva SaaS", "SP-2026/004", LAWYER);
  const cVypoved = await legalCase(pSvobodova.id, "Žaloba na neplatnost výpovědi", "SP-2026/005", ADMIN);
  const cAkvizice = await legalCase(pRealitni.id, "Akvizice pozemků Letňany", "SP-2026/006", PARTNER);
  const cPohledavka = await legalCase(pPekarna.id, "Upomínka a žaloba — Beton-Mix", "SP-2026/007", LAWYER);

  // --- Vztahy subjektů (klienti + protistrany k případům) ---
  const rel = (
    subjectId: string,
    role: SubjectRole,
    where: { projectId?: string; caseId?: string },
    createdById: string,
  ) =>
    prisma.subjectRelation.create({
      data: { subjectId, role, relationType: role, ...where, createdById },
    });

  await rel(sNovak.id, SubjectRole.CLIENT, { projectId: pNovak.id }, LAWYER);
  await rel(sBetonMix.id, SubjectRole.COUNTERPARTY, { caseId: cViceprace.id }, LAWYER);
  await rel(sBetonMix.id, SubjectRole.COUNTERPARTY, { caseId: cPohledavka.id }, LAWYER);
  await rel(sDvorak.id, SubjectRole.CLIENT, { projectId: pDvorak.id }, PARTNER);
  await rel(sCerny.id, SubjectRole.COUNTERPARTY, { caseId: cPece.id }, PARTNER);
  await rel(sTechSoft.id, SubjectRole.CLIENT, { projectId: pTechSoft.id }, LAWYER);
  await rel(sSvobodova.id, SubjectRole.CLIENT, { projectId: pSvobodova.id }, ADMIN);
  await rel(sRealitni.id, SubjectRole.CLIENT, { projectId: pRealitni.id }, PARTNER);
  await rel(sDruzstvo.id, SubjectRole.COUNTERPARTY, { caseId: cAkvizice.id }, PARTNER);

  // --- Úkoly (přiřazené napříč rolemi, různé stavy/termíny) ---
  const task = (data: {
    title: string;
    caseId?: string;
    projectId?: string;
    assignedToId?: string;
    responsibleUserId?: string;
    createdById?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    deadlineType?: TaskDeadlineType;
    deadline?: Date | null;
    completedAt?: Date | null;
    shortDescription?: string;
  }) =>
    prisma.task.create({
      data: {
        organizationId: orgId,
        status: data.status ?? TaskStatus.IN_PROGRESS,
        priority: data.priority ?? TaskPriority.STANDARD,
        deadlineType: data.deadlineType ?? TaskDeadlineType.INTERNAL,
        ...data,
      },
    });

  // P1/Novák (LAWYER) — advokát + koncipient
  await task({
    title: "Připravit žalobu o zaplacení víceprací",
    caseId: cViceprace.id, projectId: pNovak.id,
    assignedToId: LAWYER, responsibleUserId: LAWYER, createdById: LAWYER,
    status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH,
    deadlineType: TaskDeadlineType.PROCEDURAL, deadline: at(6),
    shortDescription: "Doplnit znalecký posudek a vyčíslení.",
  });
  await task({
    title: "Rešerše judikatury k vícepracím",
    caseId: cViceprace.id, projectId: pNovak.id,
    assignedToId: TRAINEE, responsibleUserId: LAWYER, createdById: LAWYER,
    status: TaskStatus.IN_PROGRESS, priority: TaskPriority.STANDARD, deadline: at(2),
  });
  await task({
    title: "Reklamace vad — výzva k odstranění",
    caseId: cReklamace.id, projectId: pNovak.id,
    assignedToId: LAWYER, responsibleUserId: LAWYER, createdById: LAWYER,
    status: TaskStatus.FOR_REVIEW, priority: TaskPriority.STANDARD, deadline: at(-1),
  });

  // P2/Dvořák (PARTNER) — koncipient dostane úkol (TRAINEE uvidí, LAWYER ne)
  await task({
    title: "Návrh na úpravu poměrů nezletilých",
    caseId: cPece.id, projectId: pDvorak.id,
    assignedToId: TRAINEE, responsibleUserId: PARTNER, createdById: PARTNER,
    status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH,
    deadlineType: TaskDeadlineType.PROCEDURAL, deadline: at(-3),
    shortDescription: "Po termínu — urgovat podklady od klienta.",
  });

  // P3/TechSoft (LAWYER)
  await task({
    title: "Revize licenční smlouvy SaaS",
    caseId: cLicence.id, projectId: pTechSoft.id,
    assignedToId: LAWYER, responsibleUserId: LAWYER, createdById: LAWYER,
    status: TaskStatus.WAITING_FOR_CLIENT, priority: TaskPriority.STANDARD, deadline: at(9),
  });
  // intern dostane drobný úkol na C4 (INTERN uvidí jen tenhle úkol)
  await task({
    title: "Anonymizace příloh k licenční smlouvě",
    caseId: cLicence.id, projectId: pTechSoft.id,
    assignedToId: INTERN, responsibleUserId: LAWYER, createdById: LAWYER,
    status: TaskStatus.IN_PROGRESS, priority: TaskPriority.LOW, deadline: at(1),
  });

  // P4/Svobodová (ADMIN) — intern úkol (INTERN uvidí), lawyer NE
  await task({
    title: "Zakládání spisu — pracovní spor",
    caseId: cVypoved.id, projectId: pSvobodova.id,
    assignedToId: INTERN, responsibleUserId: ADMIN, createdById: ADMIN,
    status: TaskStatus.COMPLETED, priority: TaskPriority.LOW,
    deadline: at(-10), completedAt: at(-8),
  });
  await task({
    title: "Podání žaloby na neplatnost výpovědi",
    caseId: cVypoved.id, projectId: pSvobodova.id,
    assignedToId: ADMIN, responsibleUserId: ADMIN, createdById: ADMIN,
    status: TaskStatus.IN_PROGRESS, priority: TaskPriority.CRITICAL,
    deadlineType: TaskDeadlineType.PROCEDURAL, deadline: at(4),
  });

  // P5/Realitní (PARTNER) — jen partner (žádný junior) → neviditelné juniorům
  await task({
    title: "Due diligence pozemků Letňany",
    caseId: cAkvizice.id, projectId: pRealitni.id,
    assignedToId: PARTNER, responsibleUserId: PARTNER, createdById: PARTNER,
    status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, deadline: at(12),
  });

  // P6/Pekárna (LAWYER) — advokát + koncipient
  await task({
    title: "Předžalobní upomínka — Beton-Mix",
    caseId: cPohledavka.id, projectId: pPekarna.id,
    assignedToId: LAWYER, responsibleUserId: LAWYER, createdById: LAWYER,
    status: TaskStatus.FILED, priority: TaskPriority.STANDARD, deadline: at(-5),
  });
  await task({
    title: "Lustrace majetku dlužníka",
    caseId: cPohledavka.id, projectId: pPekarna.id,
    assignedToId: TRAINEE, responsibleUserId: LAWYER, createdById: LAWYER,
    status: TaskStatus.IN_PROGRESS, priority: TaskPriority.STANDARD, deadline: at(3),
  });

  // --- Výkazy práce (hodiny tento měsíc; každý junior vidí jen své) ---
  const wl = (data: {
    userId: string;
    caseId?: string;
    projectId?: string;
    subjectId?: string;
    workDate: Date;
    hours: number;
    hourlyRate: number;
    legalArea: string;
    description: string;
    billingStatus?: BillingStatus;
    approvalStatus?: ApprovalStatus;
  }) =>
    prisma.workLog.create({
      data: {
        organizationId: orgId,
        userId: data.userId,
        caseId: data.caseId,
        projectId: data.projectId,
        subjectId: data.subjectId,
        workDate: data.workDate,
        hours: data.hours,
        hourlyRate: data.hourlyRate,
        amountCzk: Math.round(data.hours * data.hourlyRate),
        legalArea: data.legalArea,
        description: data.description,
        billingStatus: data.billingStatus ?? BillingStatus.BILLABLE,
        approvalStatus: data.approvalStatus ?? ApprovalStatus.APPROVED,
      },
    });

  await wl({ userId: LAWYER, caseId: cViceprace.id, projectId: pNovak.id, subjectId: sNovak.id,
    workDate: thisMonth(8), hours: 4.5, hourlyRate: 2800, legalArea: "Stavební právo",
    description: "Příprava žaloby, studium smlouvy o dílo." });
  await wl({ userId: LAWYER, caseId: cReklamace.id, projectId: pNovak.id, subjectId: sNovak.id,
    workDate: thisMonth(12), hours: 2, hourlyRate: 2800, legalArea: "Stavební právo",
    description: "Výzva k odstranění vad, korespondence." });
  await wl({ userId: TRAINEE, caseId: cViceprace.id, projectId: pNovak.id, subjectId: sNovak.id,
    workDate: thisMonth(15), hours: 6, hourlyRate: 1200, legalArea: "Stavební právo",
    description: "Rešerše judikatury NS k vícepracím.", approvalStatus: ApprovalStatus.SUBMITTED });
  await wl({ userId: PARTNER, caseId: cPece.id, projectId: pDvorak.id, subjectId: sDvorak.id,
    workDate: thisMonth(10), hours: 3, hourlyRate: 3500, legalArea: "Rodinné právo",
    description: "Konzultace s klientem, strategie řízení." });
  await wl({ userId: TRAINEE, caseId: cPece.id, projectId: pDvorak.id, subjectId: sDvorak.id,
    workDate: thisMonth(16), hours: 4, hourlyRate: 1200, legalArea: "Rodinné právo",
    description: "Příprava návrhu na úpravu poměrů." });
  await wl({ userId: LAWYER, caseId: cLicence.id, projectId: pTechSoft.id, subjectId: sTechSoft.id,
    workDate: thisMonth(11), hours: 5, hourlyRate: 3500, legalArea: "IT / IP právo",
    description: "Revize licenčních podmínek SaaS." });
  await wl({ userId: INTERN, caseId: cLicence.id, projectId: pTechSoft.id, subjectId: sTechSoft.id,
    workDate: thisMonth(17), hours: 3, hourlyRate: 800, legalArea: "IT / IP právo",
    description: "Anonymizace a kompletace příloh.", approvalStatus: ApprovalStatus.DRAFT });
  await wl({ userId: INTERN, caseId: cVypoved.id, projectId: pSvobodova.id, subjectId: sSvobodova.id,
    workDate: thisMonth(5), hours: 2, hourlyRate: 800, legalArea: "Pracovní právo",
    description: "Zakládání a digitalizace spisu.", approvalStatus: ApprovalStatus.APPROVED });
  await wl({ userId: PARTNER, caseId: cAkvizice.id, projectId: pRealitni.id, subjectId: sRealitni.id,
    workDate: thisMonth(9), hours: 6.5, hourlyRate: 3200, legalArea: "Korporátní právo",
    description: "Due diligence pozemků, smluvní dokumentace." });
  await wl({ userId: LAWYER, caseId: cPohledavka.id, projectId: pPekarna.id, subjectId: sPekarna.id,
    workDate: thisMonth(18), hours: 1.5, hourlyRate: 2500, legalArea: "Vymáhání pohledávek",
    description: "Předžalobní upomínka, výpočet úroků z prodlení." });

  // --- Reference (portfolio dokončených/běžících matters) ---
  const reference = (data: {
    title: string;
    projectId?: string;
    caseId?: string;
    subjectId?: string;
    legalArea: string;
    valueCzk: number;
    startDate: Date;
    endDate?: Date | null;
    description: string;
  }) => prisma.reference.create({ data: { organizationId: orgId, ...data } });

  await reference({
    title: "Zastupování ve sporu o vícepráce (stavebnictví)",
    projectId: pNovak.id, caseId: cViceprace.id, subjectId: sNovak.id,
    legalArea: "Stavební právo", valueCzk: 1_200_000, startDate: at(-120),
    description: "Spor o zaplacení víceprací při výstavbě administrativní budovy.",
  });
  await reference({
    title: "Příprava licenční a SaaS dokumentace",
    projectId: pTechSoft.id, caseId: cLicence.id, subjectId: sTechSoft.id,
    legalArea: "IT / IP právo", valueCzk: 350_000, startDate: at(-90),
    description: "Komplexní revize licenčních podmínek a ochrany SW.",
  });
  await reference({
    title: "Korporátní akvizice pozemků",
    projectId: pRealitni.id, caseId: cAkvizice.id, subjectId: sRealitni.id,
    legalArea: "Korporátní právo", valueCzk: 5_000_000, startDate: at(-60),
    description: "Due diligence a akviziční dokumentace k pozemkům Letňany.",
  });

  // --- Conflict checky ---
  const conflict = (
    searchedQuery: string,
    resultStatus: string,
    subjectId: string | null,
    checkedById: string,
    note?: string,
  ) =>
    prisma.conflictCheck.create({
      data: { organizationId: orgId, searchedQuery, resultStatus, subjectId, checkedById, note },
    });

  await conflict("Stavební firma Novák s.r.o.", "NO_CONFLICT", sNovak.id, LAWYER);
  await conflict("Beton-Mix s.r.o.", "POTENTIAL_CONFLICT", sBetonMix.id, LAWYER,
    "Protistrana — ověřit, že kancelář nezastupuje Beton-Mix v jiné věci.");
  await conflict("StartUp Vize s.r.o.", "NO_CONFLICT", sStartup.id, PARTNER,
    "Před převzetím potenciálního klienta.");
  await conflict("Petr Černý", "NO_CONFLICT", sCerny.id, PARTNER);

  // --- Souhrn ---
  const counts = {
    subjekty: await prisma.subject.count({ where: { organizationId: orgId } }),
    projekty: await prisma.project.count({ where: { organizationId: orgId } }),
    případy: await prisma.case.count({ where: { organizationId: orgId } }),
    úkoly: await prisma.task.count({ where: { organizationId: orgId } }),
    výkazy: await prisma.workLog.count({ where: { organizationId: orgId } }),
    reference: await prisma.reference.count({ where: { organizationId: orgId } }),
    conflicty: await prisma.conflictCheck.count({ where: { organizationId: orgId } }),
  };
  console.log(`\n✅ Demo data nahrána do org "${ORG_SLUG}":\n`);
  for (const [k, v] of Object.entries(counts)) console.log(`   ${String(v).padStart(3)} ${k}`);
  console.log(
    "\n   Viditelnost: ADMIN/PARTNER vidí vše; advokát vidí své projekty " +
      "(Novák, TechSoft, Pekárna); koncipient/stážista jen matters se svým úkolem/výkazem.\n",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
