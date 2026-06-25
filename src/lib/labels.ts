import {
  ApprovalStatus,
  BillingStatus,
  CaseStatus,
  FeeType,
  InvoiceStatus,
  ModuleKey,
  ModuleStatus,
  OrganizationMemberStatus,
  OrganizationStatus,
  PaymentMethod,
  ProjectStatus,
  ReminderLevel,
  SubjectRole,
  SubjectType,
  SubscriptionStatus,
  TaskDeadlineType,
  TaskPriority,
  TaskStatus,
  UserRole,
  VatMode,
} from "@/generated/prisma/enums";

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  DRAFT: "Rozpracovaná",
  ISSUED: "Vystavená",
  SENT: "Odeslaná",
  PARTIALLY_PAID: "Částečně uhrazená",
  PAID: "Uhrazená",
  CANCELLED: "Stornovaná",
};

export const vatModeLabels: Record<VatMode, string> = {
  PAYER: "Plátce DPH",
  NON_PAYER: "Neplátce DPH",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Bankovní převod",
  CASH: "Hotovost",
  CARD: "Karta",
  OTHER: "Jiné",
};

export const reminderLevelLabels: Record<ReminderLevel, string> = {
  FIRST: "Upozornění",
  SECOND: "Upomínka",
  THIRD: "Předžalobní výzva",
};

export const moduleKeyLabels: Record<ModuleKey, string> = {
  CORE: "Jádro",
  BILLING: "Fakturace",
  DATA_BOXES: "Datové schránky",
  AML: "AML",
  DEADLINES: "Lhůtník",
  DOCUMENTS: "Dokumenty a šablony",
  CLIENT_PORTAL: "Klientský portál",
  HR_ATTENDANCE: "HR a docházka",
};

export const moduleStatusLabels: Record<ModuleStatus, string> = {
  ENABLED: "Aktivní",
  DISABLED: "Neaktivní",
  TRIAL: "Zkušební",
};

export const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  ACTIVE: "Aktivní",
  PAST_DUE: "Po splatnosti",
  CANCELED: "Zrušené",
  TRIALING: "Zkušební období",
};

export const userRoleLabels: Record<UserRole, string> = {
  ADMIN: "Admin",
  PARTNER: "Partner",
  LAWYER: "Advokát",
  TRAINEE: "Koncipient",
  INTERN: "Praktikant",
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

export const organizationStatusLabels: Record<OrganizationStatus, string> = {
  ACTIVE: "Aktivní",
  SUSPENDED: "Pozastavená",
  ARCHIVED: "Archivovaná",
};

export const organizationMemberStatusLabels: Record<
  OrganizationMemberStatus,
  string
> = {
  PENDING: "Čeká na schválení",
  ACTIVE: "Aktivní",
  SUSPENDED: "Deaktivovaný",
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

// Roles assignable to org members (ADMIN is reserved/global, not assigned here).
export const orgMemberRoleOptions: UserRole[] = [
  UserRole.PARTNER,
  UserRole.LAWYER,
  UserRole.TRAINEE,
  UserRole.INTERN,
];

export const options = {
  userRoles: Object.values(UserRole),
  organizationStatuses: Object.values(OrganizationStatus),
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
