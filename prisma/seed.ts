import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { defaultTableViewPreferenceData } from "../src/lib/table-view-preferences";
import {
  BillingStatus,
  CaseStatus,
  DashboardWidgetSize,
  DashboardWidgetType,
  FeeType,
  ProjectStatus,
  SubjectRole,
  SubjectType,
  TaskDeadlineType,
  TaskPriority,
  TaskStatus,
  UserRole,
} from "../src/generated/prisma/enums";

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
  const admin = await prisma.user.upsert({
    where: { email: "admin.demo@example.local" },
    update: {
      name: "Admin Demo",
      role: UserRole.ADMIN,
      active: true,
    },
    create: {
      name: "Admin Demo",
      email: "admin.demo@example.local",
      role: UserRole.ADMIN,
      active: true,
    },
  });

  const partner = await prisma.user.upsert({
    where: { email: "partner.demo@example.local" },
    update: {
      name: "Partner Demo",
      role: UserRole.PARTNER,
      active: true,
    },
    create: {
      name: "Partner Demo",
      email: "partner.demo@example.local",
      role: UserRole.PARTNER,
      active: true,
    },
  });

  const lawyer = await prisma.user.upsert({
    where: { email: "advokat.demo@example.local" },
    update: {
      name: "Advokát Demo",
      role: UserRole.LAWYER,
      active: true,
    },
    create: {
      name: "Advokát Demo",
      email: "advokat.demo@example.local",
      role: UserRole.LAWYER,
      active: true,
    },
  });

  const trainee = await prisma.user.upsert({
    where: { email: "koncipient.demo@example.local" },
    update: {
      name: "Koncipient Demo",
      role: UserRole.TRAINEE,
      active: true,
    },
    create: {
      name: "Koncipient Demo",
      email: "koncipient.demo@example.local",
      role: UserRole.TRAINEE,
      active: true,
    },
  });

  const intern = await prisma.user.upsert({
    where: { email: "praktikant.demo@example.local" },
    update: {
      name: "Praktikant Demo",
      role: UserRole.INTERN,
      active: true,
    },
    create: {
      name: "Praktikant Demo",
      email: "praktikant.demo@example.local",
      role: UserRole.INTERN,
      active: true,
    },
  });

  const abc = await prisma.subject.upsert({
    where: { ico: "12345678" },
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
    where: { ico: "87654321" },
    update: {
      name: "XYZ s.r.o.",
      type: SubjectType.COMPANY,
      riskFlag: true,
      status: "ACTIVE",
    },
    create: {
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
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
