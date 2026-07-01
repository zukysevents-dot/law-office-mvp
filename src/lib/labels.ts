import {
  AmlRiskLevel,
  ApprovalStatus,
  BillingStatus,
  Capability,
  CaseStatus,
  DataMessageDirection,
  DataMessageStatus,
  DeadlineStatus,
  DeadlineType,
  DocumentKind,
  FeeType,
  HrAbsenceStatus,
  HrAbsenceType,
  HrAttendanceSource,
  HrEmploymentType,
  InternalTaskCategory,
  InvoiceStatus,
  ModuleKey,
  ModuleStatus,
  OrganizationMemberStatus,
  OrganizationStatus,
  PaymentMethod,
  ProjectStatus,
  RegistryChangeType,
  ReminderLevel,
  SalaryTaxMode,
  SubjectRole,
  SubjectType,
  SubscriptionStatus,
  TaskDeadlineType,
  TaskPriority,
  TaskStatus,
  UserRole,
  VatMode,
} from "@/generated/prisma/enums";

export const salaryTaxModeLabels: Record<SalaryTaxMode, string> = {
  [SalaryTaxMode.EMPLOYMENT]: "Závislá činnost (zaměstnanec)",
  [SalaryTaxMode.DPP]: "DPP (dohoda o provedení práce)",
  [SalaryTaxMode.DPC]: "DPČ (dohoda o pracovní činnosti)",
  [SalaryTaxMode.CONTRACTOR]: "OSVČ / fakturuje",
  [SalaryTaxMode.OTHER]: "Jiné",
};

export const capabilityOptions = [
  Capability.MANAGE_INVOICES,
  Capability.VIEW_RATES,
] as const;

export const capabilityLabels: Record<Capability, string> = {
  [Capability.MANAGE_INVOICES]: "Správa faktur",
  [Capability.VIEW_RATES]: "Zobrazení sazeb a částek",
};

export const capabilityDescriptions: Record<Capability, string> = {
  [Capability.MANAGE_INVOICES]:
    "Vystavování a správa faktur, plateb, upomínek a paušálů.",
  [Capability.VIEW_RATES]:
    "Vidí hodinové sazby a fakturované částky (jinak skryté).",
};

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

export const amlRiskLevelLabels: Record<AmlRiskLevel, string> = {
  LOW: "Nízké",
  MEDIUM: "Střední",
  HIGH: "Vysoké",
};

export const dataMessageDirectionLabels: Record<DataMessageDirection, string> = {
  IN: "Doručená",
  OUT: "Odeslaná",
};

export const dataMessageStatusLabels: Record<DataMessageStatus, string> = {
  RECEIVED: "Doručená",
  ACCEPTED: "Doručeno (fikce/přihlášením)",
  READ: "Přečtená",
  SENT: "Odeslaná",
  ARCHIVED: "Archivovaná",
};

export const deadlineTypeLabels: Record<DeadlineType, string> = {
  PROCEDURAL: "Procesní",
  COURT: "Soudní",
  INTERNAL: "Interní",
};

export const deadlineStatusLabels: Record<DeadlineStatus, string> = {
  OPEN: "Otevřená",
  COMPLETED: "Splněná",
  CANCELLED: "Zrušená",
};

export const documentKindLabels: Record<DocumentKind, string> = {
  CONTRACT: "Smlouva",
  SUBMISSION: "Podání",
  POWER_OF_ATTORNEY: "Plná moc",
  LETTER: "Dopis / výzva",
  INTERNAL_NOTE: "Interní",
  OTHER: "Jiný",
};

export const hrEmploymentTypeLabels: Record<HrEmploymentType, string> = {
  FULL_TIME: "Plný úvazek",
  PART_TIME: "Částečný úvazek",
  AGREEMENT: "Dohoda (DPP/DPČ)",
  CONTRACTOR: "OSVČ / kontraktor",
};

export const hrAbsenceTypeLabels: Record<HrAbsenceType, string> = {
  VACATION: "Dovolená",
  SICK: "Nemoc",
  HOME_OFFICE: "Home office",
  DOCTOR: "Lékař",
  UNPAID: "Neplacené volno",
  SEMINAR_CAK: "Seminář ČAK",
  BAR_EXAM: "Advokátní zkoušky",
  EDUCATION: "Vzdělávání",
  OTHER: "Jiné",
};

export const internalTaskCategoryLabels: Record<InternalTaskCategory, string> = {
  ADMINISTRATION: "Administrativa",
  EDUCATION: "Vzdělávání",
  ERRAND: "Pochůzka",
  ACQUISITION: "Akviziční činnost",
  REPORTING: "Vykazování",
  OFFICE_MANAGEMENT: "Správa kanceláře",
};

export const hrAbsenceStatusLabels: Record<HrAbsenceStatus, string> = {
  PENDING: "Čeká na schválení",
  APPROVED: "Schváleno",
  REJECTED: "Zamítnuto",
  CANCELLED: "Zrušeno",
};

export const hrAttendanceSourceLabels: Record<HrAttendanceSource, string> = {
  MANUAL: "Ruční",
  IMPORT: "Import",
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
  HIDDEN_WRITE_OFF: "Skrytý odpis",
  VISIBLE_WRITE_OFF: "Viditelný odpis",
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

export const registryChangeTypeLabels: Record<RegistryChangeType, string> = {
  INSOLVENCY: "Insolvence",
  DISSOLVED: "Zánik subjektu",
  LIQUIDATION: "Likvidace",
  RISK_CLEARED: "Riziko pominulo",
  OTHER: "Změna v rejstříku",
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
  "Rodinné právo",
  "Správní právo",
  "Trestní právo",
  "Insolvence",
  "Veřejné zakázky",
  "Soudní spor",
  "Compliance",
  "Ztráta času cestováním",
  "Jednání s klientem",
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
  deadlineTypes: Object.values(DeadlineType),
  documentKinds: Object.values(DocumentKind),
  hrEmploymentTypes: Object.values(HrEmploymentType),
  salaryTaxModes: Object.values(SalaryTaxMode),
  hrAbsenceTypes: Object.values(HrAbsenceType),
  internalTaskCategories: Object.values(InternalTaskCategory),
  taskPriorities: Object.values(TaskPriority),
  billingStatuses: Object.values(BillingStatus),
  approvalStatuses: Object.values(ApprovalStatus),
  projectStatuses: Object.values(ProjectStatus),
  caseStatuses: Object.values(CaseStatus),
};
