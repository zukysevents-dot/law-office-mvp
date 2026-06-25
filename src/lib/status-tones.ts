import type { BadgeTone } from "@/components/ui/badge";
import type {
  AmlRiskLevel,
  ApprovalStatus,
  BillingStatus,
  DataMessageStatus,
  DeadlineStatus,
  DeadlineType,
  DocumentKind,
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

export function billingStatusTone(status: BillingStatus): BadgeTone {
  const tones: Record<BillingStatus, BadgeTone> = {
    BILLABLE: "dark",
    NEEDS_APPROVAL: "amber",
    INTERNAL_NON_BILLABLE: "neutral",
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
