import type { BadgeTone } from "@/components/ui/badge";
import type {
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

export function billingStatusTone(status: BillingStatus): BadgeTone {
  const tones: Record<BillingStatus, BadgeTone> = {
    BILLABLE: "dark",
    NEEDS_APPROVAL: "amber",
    INTERNAL_NON_BILLABLE: "neutral",
  };

  return tones[status];
}

export function subjectRoleTone(role: SubjectRole): BadgeTone {
  return role === "COUNTERPARTY" ? "red" : "mint";
}

export function taskDeadlineTypeTone(type: TaskDeadlineType): BadgeTone {
  return type === "PROCEDURAL" ? "red" : "mint";
}
