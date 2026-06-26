import { PortalShareType } from "@/generated/prisma/enums";
import type { PortalClient } from "@/lib/portal/portal-auth";
import { getPrisma } from "@/lib/prisma";

// Read-only portal data, EXCLUSIVELY through the PortalShare whitelist. Every
// query filters by the client's own portalAccessId (from getPortalClient, never
// from the request) plus a redundant organizationId match (defense-in-depth).
// Clients see metadata only — NEVER storageUrl (a SharePoint link they can't open
// and which would leak internal infra) and NEVER internal notes.

export type SharedDocument = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  version: number;
  updatedAt: Date;
};

export type SharedCase = {
  id: string;
  name: string;
  fileNumber: string | null;
  status: string;
  updatedAt: Date;
};

export async function listSharedDocuments(
  client: PortalClient,
): Promise<SharedDocument[]> {
  const shares = await getPrisma().portalShare.findMany({
    where: {
      portalAccessId: client.portalAccessId,
      organizationId: client.organizationId,
      revokedAt: null,
      shareType: PortalShareType.DOCUMENT,
      document: { is: { archivedAt: null } },
    },
    orderBy: { sharedAt: "desc" },
    select: {
      document: {
        select: {
          id: true,
          name: true,
          kind: true,
          description: true,
          updatedAt: true,
          currentVersion: { select: { version: true } },
        },
      },
    },
  });

  return shares
    .map((share) => share.document)
    .filter((doc): doc is NonNullable<typeof doc> => doc !== null)
    .map((doc) => ({
      id: doc.id,
      name: doc.name,
      kind: doc.kind,
      description: doc.description,
      version: doc.currentVersion?.version ?? 1,
      updatedAt: doc.updatedAt,
    }));
}

export async function listSharedCases(
  client: PortalClient,
): Promise<SharedCase[]> {
  const shares = await getPrisma().portalShare.findMany({
    where: {
      portalAccessId: client.portalAccessId,
      organizationId: client.organizationId,
      revokedAt: null,
      shareType: PortalShareType.CASE,
      case: { is: { archivedAt: null } },
    },
    orderBy: { sharedAt: "desc" },
    select: {
      case: {
        select: {
          id: true,
          name: true,
          fileNumber: true,
          status: true,
          updatedAt: true,
        },
      },
    },
  });

  return shares
    .map((share) => share.case)
    .filter((c): c is NonNullable<typeof c> => c !== null);
}

// Detail is fetched THROUGH the share (findFirst on portalAccessId + the id from
// the URL), never document.findUnique(id) — so a client can never reach a record
// that wasn't explicitly shared with them (IDOR is structurally impossible).
export async function getSharedDocument(
  client: PortalClient,
  documentId: string,
): Promise<SharedDocument | null> {
  const share = await getPrisma().portalShare.findFirst({
    where: {
      portalAccessId: client.portalAccessId,
      organizationId: client.organizationId,
      revokedAt: null,
      shareType: PortalShareType.DOCUMENT,
      documentId,
      document: { is: { archivedAt: null } },
    },
    select: {
      document: {
        select: {
          id: true,
          name: true,
          kind: true,
          description: true,
          updatedAt: true,
          currentVersion: { select: { version: true } },
        },
      },
    },
  });

  const doc = share?.document;
  if (!doc) {
    return null;
  }
  return {
    id: doc.id,
    name: doc.name,
    kind: doc.kind,
    description: doc.description,
    version: doc.currentVersion?.version ?? 1,
    updatedAt: doc.updatedAt,
  };
}

export async function getSharedCase(
  client: PortalClient,
  caseId: string,
): Promise<SharedCase | null> {
  const share = await getPrisma().portalShare.findFirst({
    where: {
      portalAccessId: client.portalAccessId,
      organizationId: client.organizationId,
      revokedAt: null,
      shareType: PortalShareType.CASE,
      caseId,
      case: { is: { archivedAt: null } },
    },
    select: {
      case: {
        select: {
          id: true,
          name: true,
          fileNumber: true,
          status: true,
          updatedAt: true,
        },
      },
    },
  });

  return share?.case ?? null;
}
