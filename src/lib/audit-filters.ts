import { Prisma } from "@/generated/prisma/client";

// Free-form `entityType` / `action` strings actually written by the audit log
// (src/lib/audit.ts callers). Used to populate filter dropdowns and to ignore
// arbitrary user-supplied filter values that are not part of this set.
export const AUDIT_ENTITY_TYPES = [
  "Task",
  "TaskComment",
  "Project",
  "Case",
  "WorkLog",
  "Subject",
  "SubjectRelation",
  "Reference",
  "ConflictCheck",
  "NotificationPreference",
  "User",
] as const;

export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "STATUS_CHANGE",
  "APPROVE",
  "REJECT",
  "ARCHIVE",
  "RESTORE",
  "ARES_VERIFY",
  "SHAREPOINT_FOLDER",
  "CREATE_PROJECT_RELATION",
  "CREATE_CASE_RELATION",
  "EXPORT",
  "PASSWORD_RESET",
  "PASSWORD_CHANGE",
] as const;

export const auditEntityTypeLabels: Record<string, string> = {
  Task: "Úkol",
  TaskComment: "Komentář úkolu",
  Project: "Projekt",
  Case: "Případ",
  WorkLog: "Výkaz práce",
  Subject: "Subjekt",
  SubjectRelation: "Vazba subjektu",
  Reference: "Reference",
  ConflictCheck: "Kontrola konfliktu",
  NotificationPreference: "Nastavení notifikací",
  User: "Uživatel",
};

export const auditActionLabels: Record<string, string> = {
  CREATE: "Vytvoření",
  UPDATE: "Úprava",
  STATUS_CHANGE: "Změna stavu",
  APPROVE: "Schválení",
  REJECT: "Zamítnutí",
  ARCHIVE: "Archivace",
  RESTORE: "Obnovení",
  ARES_VERIFY: "Ověření v ARES",
  SHAREPOINT_FOLDER: "SharePoint složka",
  CREATE_PROJECT_RELATION: "Vazba na projekt",
  CREATE_CASE_RELATION: "Vazba na případ",
  EXPORT: "Export",
  PASSWORD_RESET: "Reset hesla",
  PASSWORD_CHANGE: "Změna hesla",
};

export function auditActionLabel(value: string) {
  return auditActionLabels[value] ?? value;
}

export function auditEntityTypeLabel(value: string) {
  return auditEntityTypeLabels[value] ?? value;
}

export type AuditFilters = {
  entityType: string;
  action: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
};

export function readAuditFilters(get: (key: string) => string): AuditFilters {
  return {
    entityType: get("entityType").trim(),
    action: get("action").trim(),
    userId: get("userId").trim(),
    dateFrom: get("dateFrom").trim(),
    dateTo: get("dateTo").trim(),
  };
}

export function buildAuditWhere(filters: AuditFilters): Prisma.AuditLogWhereInput {
  const entityTypeAllowed = (AUDIT_ENTITY_TYPES as readonly string[]).includes(
    filters.entityType,
  );
  const actionAllowed = (AUDIT_ACTIONS as readonly string[]).includes(
    filters.action,
  );

  return {
    ...(entityTypeAllowed ? { entityType: filters.entityType } : {}),
    ...(actionAllowed ? { action: filters.action } : {}),
    ...(filters.userId ? { changedById: filters.userId } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          createdAt: {
            ...(filters.dateFrom
              ? { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) }
              : {}),
            ...(filters.dateTo
              ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) }
              : {}),
          },
        }
      : {}),
  };
}
