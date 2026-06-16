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
  UserRole,
} from "@/generated/prisma/enums";

export const userRoleLabels: Record<UserRole, string> = {
  PARTNER: "Partner",
  LAWYER: "Advokát",
  TRAINEE: "Koncipient",
  INTERN: "Stážista",
};

export const subjectTypeLabels: Record<SubjectType, string> = {
  COMPANY: "Společnost",
  PERSON: "Fyzická osoba",
  ENTREPRENEUR: "Podnikatel",
  OTHER: "Jiný subjekt",
};

export const subjectRoleLabels: Record<SubjectRole, string> = {
  CLIENT: "Klient",
  COUNTERPARTY: "Protistrana",
  POTENTIAL_CLIENT: "Potenciální klient",
  CONTACT_PERSON: "Kontaktní osoba",
  WITNESS: "Svědek",
  REPRESENTATIVE: "Zástupce",
  STATUTORY_BODY: "Statutární orgán",
  OTHER: "Jiné",
};

export const feeTypeLabels: Record<FeeType, string> = {
  HOURLY: "Hodinová sazba",
  FLAT: "Paušální odměna",
  MIXED: "Kombinovaná odměna",
  OTHER: "Jiné",
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  CREATED: "Vytvořeno",
  ACCEPTED: "Přijato",
  IN_PROGRESS: "Rozpracováno",
  FOR_REVIEW: "Ke kontrole",
  WAITING_FOR_CLIENT: "Čeká na klienta",
  WAITING_FOR_COUNTERPARTY: "Čeká na protistranu",
  POSTPONED: "Odloženo",
  FILED: "Podáno",
  COMPLETED: "Dokončeno",
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  LOW: "Nízká",
  STANDARD: "Standardní",
  HIGH: "Vysoká",
  CRITICAL: "Kritická",
};

export const taskDeadlineTypeLabels: Record<TaskDeadlineType, string> = {
  INTERNAL: "Interní lhůta",
  PROCEDURAL: "Procesní lhůta",
};

export const billingStatusLabels: Record<BillingStatus, string> = {
  BILLABLE: "Fakturovatelné",
  NEEDS_APPROVAL: "Ke schválení",
  INTERNAL_NON_BILLABLE: "Interní nefakturovatelné",
};

export const approvalStatusLabels: Record<ApprovalStatus, string> = {
  DRAFT: "Koncept",
  SUBMITTED: "Odesláno",
  APPROVED: "Schváleno",
  REJECTED: "Zamítnuto",
  ADJUSTED: "Upraveno",
};

export const projectStatusLabels: Record<ProjectStatus, string> = {
  ACTIVE: "Aktivní",
  PAUSED: "Pozastavený",
  COMPLETED: "Dokončený",
  ARCHIVED: "Archivovaný",
};

export const caseStatusLabels: Record<CaseStatus, string> = {
  ACTIVE: "Aktivní",
  PAUSED: "Pozastavený",
  COMPLETED: "Dokončený",
  ARCHIVED: "Archivovaný",
};

export const legalAreaOptions = [
  "Civilní právo",
  "Obchodní právo",
  "Pracovní právo",
  "Správní právo",
  "Trestní právo",
  "Insolvence",
  "Veřejné zakázky",
  "Soudní spor",
  "Compliance",
  "Jiné",
];

export const options = {
  userRoles: Object.values(UserRole),
  subjectTypes: Object.values(SubjectType),
  subjectRoles: Object.values(SubjectRole),
  feeTypes: Object.values(FeeType),
  taskStatuses: Object.values(TaskStatus),
  taskDeadlineTypes: Object.values(TaskDeadlineType),
  taskPriorities: Object.values(TaskPriority),
  billingStatuses: Object.values(BillingStatus),
  approvalStatuses: Object.values(ApprovalStatus),
  projectStatuses: Object.values(ProjectStatus),
  caseStatuses: Object.values(CaseStatus),
};
