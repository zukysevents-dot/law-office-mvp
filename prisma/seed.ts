import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { hashCode } from "../src/lib/join-code";
import { hashPassword } from "../src/lib/password";
import { defaultTableViewPreferenceData } from "../src/lib/table-view-preferences";
import {
  BillingStatus,
  CaseStatus,
  DashboardWidgetSize,
  DashboardWidgetType,
  FeeType,
  ModuleKey,
  ModuleStatus,
  OrganizationMemberStatus,
  PlanInterval,
  ProjectStatus,
  SubjectRole,
  SubjectType,
  SubscriptionStatus,
  TaskDeadlineType,
  TaskPriority,
  TaskStatus,
  UserRole,
} from "../src/generated/prisma/enums";

// Module catalog. `requiresKeys` here is DISPLAY-ONLY (shown in the admin UI);
// the runtime authority for the dependency graph is MODULE_DEPENDENCIES in
// src/lib/entitlements.ts. Keep the two in sync — a completeness test in
// entitlements.test.ts guards against a key missing from the runtime graph.
const MODULE_CATALOG: {
  key: ModuleKey;
  name: string;
  description: string;
  requiresKeys: ModuleKey[];
  isCore: boolean;
}[] = [
  { key: ModuleKey.CORE, name: "Jádro", description: "Subjekty, spisy, úkoly, výkazy a reporty.", requiresKeys: [], isCore: true },
  { key: ModuleKey.BILLING, name: "Fakturace", description: "Vystavování faktur klientům z výkazů práce.", requiresKeys: [], isCore: false },
  { key: ModuleKey.DATA_BOXES, name: "Datové schránky", description: "Příjem, odeslání a přiřazení datových zpráv ke spisu.", requiresKeys: [], isCore: false },
  { key: ModuleKey.AML, name: "AML", description: "Identifikace klienta a hodnocení rizik.", requiresKeys: [], isCore: false },
  { key: ModuleKey.DEADLINES, name: "Lhůtník", description: "Procesní lhůty, soudní jednání a hlídání termínů.", requiresKeys: [], isCore: false },
  { key: ModuleKey.DOCUMENTS, name: "Dokumenty a šablony", description: "DMS s verzováním a generování dokumentů ze šablon.", requiresKeys: [], isCore: false },
  { key: ModuleKey.CLIENT_PORTAL, name: "Klientský portál", description: "Sdílení dokumentů a stavu spisu s klientem.", requiresKeys: [ModuleKey.DOCUMENTS], isCore: false },
  { key: ModuleKey.HR_ATTENDANCE, name: "HR a docházka", description: "Zaměstnanci, docházka, absence a saldo dovolené.", requiresKeys: [], isCore: false },
];

const PLAN_CATALOG: {
  id: string;
  name: string;
  includedKeys: ModuleKey[];
  priceCzk: string;
  interval: PlanInterval;
}[] = [
  { id: "plan-start", name: "Start", includedKeys: [ModuleKey.CORE], priceCzk: "0", interval: PlanInterval.MONTHLY },
  { id: "plan-profi", name: "Profi", includedKeys: [ModuleKey.CORE, ModuleKey.BILLING, ModuleKey.DEADLINES, ModuleKey.AML], priceCzk: "1990", interval: PlanInterval.MONTHLY },
  { id: "plan-komplet", name: "Komplet", includedKeys: MODULE_CATALOG.map((m) => m.key), priceCzk: "3990", interval: PlanInterval.MONTHLY },
];

// Must match the migration + src/lib/organization.ts DEMO_ORG_ID.
const DEMO_ORG_ID = "org-demo-syndikat-legal";
// Known demo registration code (plaintext) for local testing of the join flow.
const DEMO_JOIN_CODE = "DEMO-2026-CODE";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function defaultDashboardWidgetData(userId: string) {
  return [
    {
      userId,
      type: DashboardWidgetType.ACTIVE_TASKS,
      title: "Aktivní úkoly",
      position: 0,
      size: DashboardWidgetSize.SMALL,
      visible: true,
      config: {},
    },
    {
      userId,
      type: DashboardWidgetType.OVERDUE_TASKS,
      title: "Úkoly po termínu",
      position: 1,
      size: DashboardWidgetSize.SMALL,
      visible: true,
      config: {},
    },
    {
      userId,
      type: DashboardWidgetType.FOR_REVIEW_TASKS,
      title: "Ke kontrole",
      position: 2,
      size: DashboardWidgetSize.SMALL,
      visible: true,
      config: {},
    },
    {
      userId,
      type: DashboardWidgetType.SUBJECTS_TABLE,
      title: "Subjekty",
      position: 3,
      size: DashboardWidgetSize.MEDIUM,
      visible: true,
      config: { columns: ["name", "type", "ico", "riskFlag"] },
    },
    {
      userId,
      type: DashboardWidgetType.PROJECTS_TABLE,
      title: "Projekty",
      position: 4,
      size: DashboardWidgetSize.MEDIUM,
      visible: true,
      config: { columns: ["name", "subject", "status", "responsibleUser"] },
    },
    {
      userId,
      type: DashboardWidgetType.WORK_LOGS_SUMMARY,
      title: "Hodiny tento měsíc",
      position: 5,
      size: DashboardWidgetSize.SMALL,
      visible: true,
      config: {},
    },
    {
      userId,
      type: DashboardWidgetType.RECENT_CONFLICT_CHECKS,
      title: "Poslední conflict checky",
      position: 6,
      size: DashboardWidgetSize.FULL,
      visible: true,
      config: {},
    },
  ];
}

async function ensureCaseRelation(input: {
  subjectId: string;
  projectId: string;
  caseId: string;
  role: SubjectRole;
  createdById: string;
  note: string;
}) {
  const existing = await prisma.subjectRelation.findFirst({
    where: {
      subjectId: input.subjectId,
      projectId: input.projectId,
      caseId: input.caseId,
      relationType: "CASE",
      role: input.role,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.subjectRelation.create({
    data: {
      ...input,
      relationType: "CASE",
    },
  });
}

async function main() {
  // All demo users share one known password (override with SEED_USER_PASSWORD).
  const demoPasswordHash = await hashPassword(
    process.env.SEED_USER_PASSWORD?.trim() || "demo1234",
  );

  const demoOrg = await prisma.organization.upsert({
    where: { id: DEMO_ORG_ID },
    update: { name: "syndikat.legal demo", status: "ACTIVE" },
    create: {
      id: DEMO_ORG_ID,
      name: "syndikat.legal demo",
      slug: "syndikat-legal-demo",
      seatLimit: 10,
      status: "ACTIVE",
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin.demo@example.local" },
    update: {
      name: "Admin Demo",
      role: UserRole.ADMIN,
      active: true,
      passwordHash: demoPasswordHash,
    },
    create: {
      name: "Admin Demo",
      email: "admin.demo@example.local",
      role: UserRole.ADMIN,
      active: true,
      passwordHash: demoPasswordHash,
    },
  });

  const partner = await prisma.user.upsert({
    where: { email: "partner.demo@example.local" },
    update: {
      name: "Partner Demo",
      role: UserRole.PARTNER,
      active: true,
      passwordHash: demoPasswordHash,
    },
    create: {
      name: "Partner Demo",
      email: "partner.demo@example.local",
      role: UserRole.PARTNER,
      active: true,
      passwordHash: demoPasswordHash,
    },
  });

  const lawyer = await prisma.user.upsert({
    where: { email: "advokat.demo@example.local" },
    update: {
      name: "Advokát Demo",
      role: UserRole.LAWYER,
      active: true,
      passwordHash: demoPasswordHash,
    },
    create: {
      name: "Advokát Demo",
      email: "advokat.demo@example.local",
      role: UserRole.LAWYER,
      active: true,
      passwordHash: demoPasswordHash,
    },
  });

  const trainee = await prisma.user.upsert({
    where: { email: "koncipient.demo@example.local" },
    update: {
      name: "Koncipient Demo",
      role: UserRole.TRAINEE,
      active: true,
      passwordHash: demoPasswordHash,
    },
    create: {
      name: "Koncipient Demo",
      email: "koncipient.demo@example.local",
      role: UserRole.TRAINEE,
      active: true,
      passwordHash: demoPasswordHash,
    },
  });

  const intern = await prisma.user.upsert({
    where: { email: "praktikant.demo@example.local" },
    update: {
      name: "Praktikant Demo",
      role: UserRole.INTERN,
      active: true,
      passwordHash: demoPasswordHash,
    },
    create: {
      name: "Praktikant Demo",
      email: "praktikant.demo@example.local",
      role: UserRole.INTERN,
      active: true,
      passwordHash: demoPasswordHash,
    },
  });

  // Connect the five demo users to the demo org as ACTIVE members.
  for (const member of [admin, partner, lawyer, trainee, intern]) {
    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: demoOrg.id, userId: member.id },
      },
      update: { role: member.role, status: OrganizationMemberStatus.ACTIVE },
      create: {
        organizationId: demoOrg.id,
        userId: member.id,
        role: member.role,
        status: OrganizationMemberStatus.ACTIVE,
        approvedAt: new Date(),
      },
    });
  }

  // Developer / platform super-admin — no org membership, manages /admin.
  await prisma.user.upsert({
    where: { email: "developer.demo@example.local" },
    update: {
      name: "Developer Admin",
      isPlatformAdmin: true,
      active: true,
      passwordHash: demoPasswordHash,
    },
    create: {
      name: "Developer Admin",
      email: "developer.demo@example.local",
      role: UserRole.ADMIN,
      isPlatformAdmin: true,
      active: true,
      passwordHash: demoPasswordHash,
    },
  });

  // Known demo registration code so the join flow can be tested locally.
  await prisma.organizationJoinCode.upsert({
    where: { codeHash: hashCode(DEMO_JOIN_CODE) },
    update: { label: "Demo onboarding", isActive: true },
    create: {
      organizationId: demoOrg.id,
      codeHash: hashCode(DEMO_JOIN_CODE),
      label: "Demo onboarding",
    },
  });

  // --- Produktizace / entitlements (F0) --------------------------------------
  // Read-mostly module catalog.
  for (const moduleDef of MODULE_CATALOG) {
    await prisma.module.upsert({
      where: { key: moduleDef.key },
      update: {
        name: moduleDef.name,
        description: moduleDef.description,
        requiresKeys: moduleDef.requiresKeys,
        isCore: moduleDef.isCore,
        active: true,
      },
      create: moduleDef,
    });
  }

  // Priced plans (informational for now; F8 wires real billing).
  for (const plan of PLAN_CATALOG) {
    await prisma.plan.upsert({
      where: { id: plan.id },
      update: {
        name: plan.name,
        includedKeys: plan.includedKeys,
        priceCzk: plan.priceCzk,
        interval: plan.interval,
        active: true,
      },
      create: plan,
    });
  }

  // Demo org entitlements: BILLING live, DEADLINES on trial, rest disabled.
  await prisma.organizationModule.upsert({
    where: {
      organizationId_moduleKey: {
        organizationId: demoOrg.id,
        moduleKey: ModuleKey.BILLING,
      },
    },
    update: { status: ModuleStatus.ENABLED, enabledAt: new Date(), disabledAt: null },
    create: {
      organizationId: demoOrg.id,
      moduleKey: ModuleKey.BILLING,
      status: ModuleStatus.ENABLED,
      enabledAt: new Date(),
    },
  });

  await prisma.organizationModule.upsert({
    where: {
      organizationId_moduleKey: {
        organizationId: demoOrg.id,
        moduleKey: ModuleKey.DEADLINES,
      },
    },
    update: {
      status: ModuleStatus.TRIAL,
      trialEndsAt: new Date("2026-12-31T00:00:00.000Z"),
      enabledAt: new Date(),
      disabledAt: null,
    },
    create: {
      organizationId: demoOrg.id,
      moduleKey: ModuleKey.DEADLINES,
      status: ModuleStatus.TRIAL,
      trialEndsAt: new Date("2026-12-31T00:00:00.000Z"),
      enabledAt: new Date(),
    },
  });

  // Demo subscription on the Profi plan (trialing).
  await prisma.subscription.upsert({
    where: { organizationId: demoOrg.id },
    update: { planId: "plan-profi", status: SubscriptionStatus.TRIALING },
    create: {
      organizationId: demoOrg.id,
      planId: "plan-profi",
      status: SubscriptionStatus.TRIALING,
      currentPeriodEnd: new Date("2026-12-31T00:00:00.000Z"),
    },
  });

  // Demo billing profile (issuer identity) so invoices can be issued out of the
  // box. VAT payer by default.
  const demoBillingProfile = {
    legalName: "syndikat.legal s.r.o., advokátní kancelář",
    ico: "12345678",
    dic: "CZ12345678",
    address: "Příkladná 1, 110 00 Praha 1",
    bankAccount: "123456789/0100",
    iban: "CZ6501000000000123456789",
    vatPayer: true,
    defaultDueDays: 14,
    invoiceNote: "Děkujeme za důvěru.",
  };
  await prisma.organizationBillingProfile.upsert({
    where: { organizationId: demoOrg.id },
    update: demoBillingProfile,
    create: { organizationId: demoOrg.id, ...demoBillingProfile },
  });

  const abc = await prisma.subject.upsert({
    where: { organizationId_ico: { organizationId: demoOrg.id, ico: "12345678" } },
    update: {
      name: "ABC s.r.o.",
      type: SubjectType.COMPANY,
      riskFlag: false,
      status: "ACTIVE",
      feeType: FeeType.HOURLY,
      hourlyRate: "3200",
      legalServicesContractUrl: "https://example.local/smlouvy/abc",
      feeNote: "Demo hodinová sazba klienta.",
    },
    create: {
      organizationId: demoOrg.id,
      name: "ABC s.r.o.",
      type: SubjectType.COMPANY,
      ico: "12345678",
      legalForm: "společnost s ručením omezeným",
      status: "ACTIVE",
      feeType: FeeType.HOURLY,
      hourlyRate: "3200",
      legalServicesContractUrl: "https://example.local/smlouvy/abc",
      feeNote: "Demo hodinová sazba klienta.",
    },
  });

  const xyz = await prisma.subject.upsert({
    where: { organizationId_ico: { organizationId: demoOrg.id, ico: "87654321" } },
    update: {
      name: "XYZ s.r.o.",
      type: SubjectType.COMPANY,
      riskFlag: true,
      status: "ACTIVE",
    },
    create: {
      organizationId: demoOrg.id,
      name: "XYZ s.r.o.",
      type: SubjectType.COMPANY,
      ico: "87654321",
      legalForm: "společnost s ručením omezeným",
      riskFlag: true,
      status: "ACTIVE",
    },
  });

  const janNovak =
    (await prisma.subject.findFirst({
      where: { name: "Jan Novák", type: SubjectType.PERSON },
    })) ??
    (await prisma.subject.create({
      data: {
        organizationId: demoOrg.id,
        name: "Jan Novák",
        type: SubjectType.PERSON,
        status: "ACTIVE",
      },
    }));

  void janNovak;
  void lawyer;
  void intern;

  const project =
    (await prisma.project.findFirst({
      where: { name: "Soudní spor ABC" },
    })) ??
    (await prisma.project.create({
      data: {
        organizationId: demoOrg.id,
        name: "Soudní spor ABC",
        mainSubjectId: abc.id,
        responsibleUserId: partner.id,
        status: ProjectStatus.ACTIVE,
        hourlyRate: "4500",
        note: "Demo projekt pro první MVP.",
      },
    }));

  await prisma.project.update({
    where: { id: project.id },
    data: {
      mainSubjectId: abc.id,
      responsibleUserId: partner.id,
      status: ProjectStatus.ACTIVE,
      hourlyRate: "4500",
    },
  });

  const legalCase =
    (await prisma.case.findFirst({
      where: {
        projectId: project.id,
        name: "Žaloba na zaplacení",
      },
    })) ??
    (await prisma.case.create({
      data: {
        organizationId: demoOrg.id,
        projectId: project.id,
        name: "Žaloba na zaplacení",
        fileNumber: "ABC-001/2026",
        responsibleUserId: partner.id,
        status: CaseStatus.ACTIVE,
      },
    }));

  await ensureCaseRelation({
    subjectId: abc.id,
    projectId: project.id,
    caseId: legalCase.id,
    role: SubjectRole.CLIENT,
    createdById: partner.id,
    note: "ABC s.r.o. jako klient v soudním sporu.",
  });

  await ensureCaseRelation({
    subjectId: xyz.id,
    projectId: project.id,
    caseId: legalCase.id,
    role: SubjectRole.COUNTERPARTY,
    createdById: partner.id,
    note: "XYZ s.r.o. jako protistrana.",
  });

  const existingTask = await prisma.task.findFirst({
    where: {
      title: "Připravit vyjádření k žalobě",
      projectId: project.id,
      caseId: legalCase.id,
    },
  });

  const task = existingTask
    ? await prisma.task.update({
        where: { id: existingTask.id },
        data: {
          createdById: partner.id,
          assignedToId: trainee.id,
          responsibleUserId: lawyer.id,
          status: TaskStatus.CREATED,
          priority: TaskPriority.HIGH,
          deadlineType: TaskDeadlineType.PROCEDURAL,
        },
      })
    : await prisma.task.create({
        data: {
          organizationId: demoOrg.id,
          title: "Připravit vyjádření k žalobě",
          projectId: project.id,
          caseId: legalCase.id,
          createdById: partner.id,
          assignedToId: trainee.id,
          responsibleUserId: lawyer.id,
          status: TaskStatus.CREATED,
          priority: TaskPriority.HIGH,
          deadlineType: TaskDeadlineType.PROCEDURAL,
          shortDescription: "Připravit první návrh vyjádření.",
        },
      });

  const existingComment = await prisma.taskComment.findFirst({
    where: {
      taskId: task.id,
      comment: "Demo komentář: připravit návrh a poslat partnerovi ke kontrole.",
    },
  });

  if (!existingComment) {
    await prisma.taskComment.create({
      data: {
        taskId: task.id,
        authorId: partner.id,
        comment: "Demo komentář: připravit návrh a poslat partnerovi ke kontrole.",
      },
    });
  }

  const existingReference = await prisma.reference.findFirst({
    where: {
      title: "Soudní spor o zaplacení pohledávky",
      projectId: project.id,
      caseId: legalCase.id,
    },
  });

  if (!existingReference) {
    await prisma.reference.create({
      data: {
        organizationId: demoOrg.id,
        title: "Soudní spor o zaplacení pohledávky",
        projectId: project.id,
        caseId: legalCase.id,
        subjectId: abc.id,
        legalArea: "Soudní spor",
        valueCzk: "1250000",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        description: "Zastupování klienta ABC s.r.o. ve sporu o zaplacení.",
      },
    });
  }

  const existingWorkLog = await prisma.workLog.findFirst({
    where: {
      taskId: task.id,
      description: "Revize podkladů a příprava návrhu vyjádření",
    },
  });

  if (!existingWorkLog) {
    await prisma.workLog.create({
      data: {
        organizationId: demoOrg.id,
        subjectId: abc.id,
        projectId: project.id,
        caseId: legalCase.id,
        taskId: task.id,
        userId: trainee.id,
        workDate: new Date("2026-06-10T00:00:00.000Z"),
        hours: "2.5",
        hourlyRate: "4500",
        amountCzk: "11250",
        description: "Revize podkladů a příprava návrhu vyjádření",
        billingStatus: BillingStatus.NEEDS_APPROVAL,
        legalArea: "Soudní spor",
      },
    });
  }

  const demoUsers = [admin, partner, lawyer, trainee, intern];

  for (const demoUser of demoUsers) {
    const existingDashboardWidgets = await prisma.dashboardWidget.count({
      where: { userId: demoUser.id },
    });

    if (existingDashboardWidgets === 0) {
      await prisma.dashboardWidget.createMany({
        data: defaultDashboardWidgetData(demoUser.id),
      });
    }

    for (const preference of defaultTableViewPreferenceData(demoUser.id)) {
      await prisma.tableViewPreference.upsert({
        where: {
          userId_tableKey: {
            userId: demoUser.id,
            tableKey: preference.tableKey,
          },
        },
        update: {},
        create: preference,
      });
    }

    await prisma.notificationPreference.upsert({
      where: { userId: demoUser.id },
      update: {},
      create: {
        userId: demoUser.id,
        emailEnabled: true,
        taskCreatedEmail: true,
        taskStatusChangedEmail: true,
        taskForReviewEmail: true,
        taskDeadlineSoonEmail: true,
        taskFiledFollowupEmail: true,
        deadlineReminderDays: 1,
        filedFollowupDays: 5,
      },
    });
  }

  console.log("Seed data created.");
  console.log(`Demo organization: ${demoOrg.name} (${demoOrg.id})`);
  console.log(`Demo registration code: ${DEMO_JOIN_CODE}`);
  console.log(
    "Platform admin login: developer.demo@example.local (heslo viz SEED_USER_PASSWORD nebo demo1234)",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
