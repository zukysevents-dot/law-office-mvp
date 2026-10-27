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
  "SubjectContact",
  "SubjectStatutoryBody",
  "ContactPerson",
  "SubjectRelation",
  "ProjectAssignee",
  "CaseAssignee",
  "ProjectTeamAssignment",
  "CaseTeamAssignment",
  "LegalTeam",
  "LegalTeamMember",
  "Reference",
  "ConflictCheck",
  "NotificationPreference",
  "User",
  "OrganizationMember",
  "RolePermission",
  "UserPermission",
  "UserCapabilityGrant",
  "Deadline",
  "CourtHearing",
  "CalendarFeed",
] as const;

export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "STATUS_CHANGE",
  "APPROVE",
  "REJECT",
  "ARCHIVE",
  "RESTORE",
  "ARES_VERIFY",
  "SHAREPOINT_FOLDER",
  "SHAREPOINT_UPLOAD",
  "SHAREPOINT_DELETE",
  "CREATE_PROJECT_RELATION",
  "CREATE_CASE_RELATION",
  "EXPORT",
  "PASSWORD_RESET",
  "PASSWORD_CHANGE",
  "INVITATION_SENT",
  "INVITATION_NOT_SENT",
  "PASSWORD_SET_VIA_INVITATION",
  "JOIN",
  "JOIN_NOTIFICATION",
  "ROLE_CHANGE",
  "RESET",
  "ASSIGN",
  "REMOVE",
  "COMPLETE",
  "COMPLETE_ARCHIVE",
  "REOPEN",
  "CANCEL",
  "CREATE_FROM_DS",
  "CONNECT",
  "DISCONNECT",
  "UPDATE_CALENDAR_VIEW",
] as const;

export const auditEntityTypeLabels: Record<string, string> = {
  Task: "Úkol",
  TaskComment: "Komentář úkolu",
  Project: "Projekt",
  Case: "Případ",
  WorkLog: "Výkaz práce",
  Subject: "Subjekt",
  SubjectContact: "Kontakt subjektu",
  SubjectStatutoryBody: "Statutární orgán subjektu",
  ContactPerson: "Kontaktní osoba",
  SubjectRelation: "Vazba subjektu",
  ProjectAssignee: "Řešitel projektu",
  CaseAssignee: "Řešitel případu",
  ProjectTeamAssignment: "Tým u projektu",
  CaseTeamAssignment: "Tým u případu",
  LegalTeam: "Tým",
  LegalTeamMember: "Člen týmu",
  Reference: "Reference",
  ConflictCheck: "Kontrola konfliktu",
  NotificationPreference: "Nastavení notifikací",
  User: "Uživatel",
  OrganizationMember: "Člen kanceláře",
  RolePermission: "Oprávnění role",
  UserPermission: "Oprávnění uživatele",
  UserCapabilityGrant: "Granty uživatele (starší)",
  Deadline: "Lhůta",
  CourtHearing: "Soudní jednání",
  CalendarFeed: "Outlook kalendář",
};

export const auditActionLabels: Record<string, string> = {
  CREATE: "Vytvoření",
  UPDATE: "Úprava",
  DELETE: "Smazání",
  STATUS_CHANGE: "Změna stavu",
  APPROVE: "Schválení",
  REJECT: "Zamítnutí",
  ARCHIVE: "Archivace",
  RESTORE: "Obnovení",
  ARES_VERIFY: "Ověření v ARES",
  SHAREPOINT_FOLDER: "SharePoint složka",
  SHAREPOINT_UPLOAD: "SharePoint nahrání",
  SHAREPOINT_DELETE: "SharePoint smazání",
  CREATE_PROJECT_RELATION: "Vazba na projekt",
  CREATE_CASE_RELATION: "Vazba na případ",
  EXPORT: "Export",
  PASSWORD_RESET: "Reset hesla",
  PASSWORD_CHANGE: "Změna hesla",
  INVITATION_SENT: "Odeslání pozvánky",
  INVITATION_NOT_SENT: "Pozvánka neodeslána",
  PASSWORD_SET_VIA_INVITATION: "Nastavení hesla z pozvánky",
  JOIN: "Připojení ke kanceláři",
  JOIN_NOTIFICATION: "Upozornění na nového člena",
  ROLE_CHANGE: "Změna role",
  RESET: "Obnovení výchozích",
  ASSIGN: "Přiřazení",
  REMOVE: "Odebrání",
  COMPLETE: "Splnění",
  COMPLETE_ARCHIVE: "Splnění a archivace",
  REOPEN: "Vrácení mezi aktivní",
  CANCEL: "Zrušení",
  CREATE_FROM_DS: "Vytvoření z datové zprávy",
  CONNECT: "Propojení",
  DISCONNECT: "Odpojení",
  UPDATE_CALENDAR_VIEW: "Změna zobrazení kalendáře",
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
