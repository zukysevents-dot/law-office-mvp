import type { BadgeTone } from "@/components/ui/badge";
import type {
  AmlRiskLevel,
  ApprovalStatus,
  BillingStatus,
  DataMessageStatus,
  DeadlineStatus,
  DeadlineType,
  DocumentKind,
  HrAbsenceStatus,
  InvoiceStatus,
  SubjectRole,
  TaskDeadlineType,
  TaskStatus,
} from "@/generated/prisma/enums";

export function amlRiskLevelTone(level: AmlRiskLevel): BadgeTone {
  const tones: Record<AmlRiskLevel, BadgeTone> = {
    LOW: "green",
    MEDIUM: "amber",
    HIGH: "red",
  };

  return tones[level];
}

export function dataMessageStatusTone(status: DataMessageStatus): BadgeTone {
  const tones: Record<DataMessageStatus, BadgeTone> = {
    RECEIVED: "blue",
    ACCEPTED: "amber",
    READ: "neutral",
    SENT: "mint",
    ARCHIVED: "neutral",
  };

  return tones[status];
}

export function invoiceStatusTone(status: InvoiceStatus): BadgeTone {
  const tones: Record<InvoiceStatus, BadgeTone> = {
    DRAFT: "neutral",
    ISSUED: "blue",
    SENT: "mint",
    PARTIALLY_PAID: "amber",
    PAID: "green",
    CANCELLED: "red",
  };

  return tones[status];
}

export function taskStatusTone(status: TaskStatus): BadgeTone {
  const tones: Record<TaskStatus, BadgeTone> = {
    CREATED: "neutral",
    ACCEPTED: "mint",
    IN_PROGRESS: "dark",
    FOR_REVIEW: "amber",
    WAITING_FOR_CLIENT: "blue",
    WAITING_FOR_COUNTERPARTY: "purple",
    POSTPONED: "neutral",
    FILED: "mint",
    COMPLETED: "green",
  };

  return tones[status];
}

// Whole-row background tint for task tables, keyed by status. Lawyers asked for
// the *entire row* to be colored (not just the badge) so the list can be scanned
// at a glance. Kept as subtle/translucent tints so text stays readable. Returns a
// Tailwind class applied to <tr>; empty string = no tint (default rows).
export function taskStatusRowClass(status: TaskStatus): string {
  const classes: Record<TaskStatus, string> = {
    CREATED: "bg-amber-50",
    ACCEPTED: "bg-sky-50",
    IN_PROGRESS: "bg-yellow-50",
    FOR_REVIEW: "bg-blue-50",
    WAITING_FOR_CLIENT: "bg-indigo-50",
    WAITING_FOR_COUNTERPARTY: "bg-purple-50",
    POSTPONED: "bg-stone-100",
    FILED: "bg-emerald-50",
    COMPLETED: "bg-green-50",
  };

  return classes[status] ?? "";
}

export function billingStatusTone(status: BillingStatus): BadgeTone {
  const tones: Record<BillingStatus, BadgeTone> = {
    BILLABLE: "dark",
    NEEDS_APPROVAL: "amber",
    INTERNAL_NON_BILLABLE: "neutral",
    HIDDEN_WRITE_OFF: "neutral",
    VISIBLE_WRITE_OFF: "purple",
  };

  return tones[status];
}

export function approvalStatusTone(status: ApprovalStatus): BadgeTone {
  const tones: Record<ApprovalStatus, BadgeTone> = {
    DRAFT: "neutral",
    SUBMITTED: "amber",
    APPROVED: "green",
    REJECTED: "red",
    ADJUSTED: "blue",
  };

  return tones[status];
}

export function subjectRoleTone(role: SubjectRole): BadgeTone {
  return role === "COUNTERPARTY" ? "red" : "mint";
}

export function taskDeadlineTypeTone(type: TaskDeadlineType): BadgeTone {
  return type === "PROCEDURAL" ? "red" : "mint";
}

export function deadlineTypeTone(type: DeadlineType): BadgeTone {
  const tones: Record<DeadlineType, BadgeTone> = {
    PROCEDURAL: "red",
    COURT: "purple",
    INTERNAL: "mint",
  };

  return tones[type];
}

export function deadlineStatusTone(status: DeadlineStatus): BadgeTone {
  const tones: Record<DeadlineStatus, BadgeTone> = {
    OPEN: "blue",
    COMPLETED: "green",
    CANCELLED: "neutral",
  };

  return tones[status];
}

export function documentKindTone(kind: DocumentKind): BadgeTone {
  const tones: Record<DocumentKind, BadgeTone> = {
    CONTRACT: "blue",
    SUBMISSION: "purple",
    POWER_OF_ATTORNEY: "amber",
    LETTER: "mint",
    INTERNAL_NOTE: "neutral",
    OTHER: "neutral",
  };

  return tones[kind];
}

export function hrAbsenceStatusTone(status: HrAbsenceStatus): BadgeTone {
  const tones: Record<HrAbsenceStatus, BadgeTone> = {
    PENDING: "amber",
    APPROVED: "green",
    REJECTED: "red",
    CANCELLED: "neutral",
  };

  return tones[status];
}
