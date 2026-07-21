import type { BadgeTone } from "@/components/ui/badge";
import type {
  ApprovalStatus,
  BillingStatus,
  SubjectRole,
  TaskDeadlineType,
  TaskStatus,
} from "@/generated/prisma/enums";

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

// Subtle full-row tint by task status (zadáno=oranžová, řeší se=žlutá,
// ke kontrole=modrá, …) so a task list is scannable at a glance.
export function taskStatusRowClass(status: TaskStatus): string {
  const classes: Record<TaskStatus, string> = {
    CREATED: "bg-orange-50",
    ACCEPTED: "bg-teal-50",
    IN_PROGRESS: "bg-yellow-50",
    FOR_REVIEW: "bg-blue-50",
    WAITING_FOR_CLIENT: "bg-sky-50",
    WAITING_FOR_COUNTERPARTY: "bg-purple-50",
    POSTPONED: "bg-stone-100",
    FILED: "bg-emerald-50",
    COMPLETED: "bg-green-50",
  };

  return classes[status];
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
