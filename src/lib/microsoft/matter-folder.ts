/**
 * Překlad „spis → kořen složky v SharePointu", ověřený proti oprávněním.
 *
 * Tohle je hranice důvěry celého prohlížeče souborů: kořen se odvozuje ZE ZÁZNAMU
 * (přes `sharepointFolderSegments`), nikdy z `record.sharepointUrl` — to je volně
 * editovatelné textové pole na formulářích, takže by přes něj šlo ukázat na
 * libovolnou složku knihovny. Záznam se navíc načítá přes visibility helper,
 * takže neviditelný spis skončí 404 dřív, než se sáhne na Graph.
 */

import { getCurrentUser } from "@/lib/auth";
import {
  andWhere,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  sharepointFolderSegments,
  type SharepointEntityInput,
  type SharepointEntityType,
} from "@/lib/microsoft/sharepoint";

const ENTITY_TYPES: SharepointEntityType[] = ["Subject", "Project", "Case"];

/** Ověří `[type]` z URL proti povolené množině. */
export function parseEntityType(
  value: string | undefined,
): SharepointEntityType | null {
  return ENTITY_TYPES.find((type) => type === value) ?? null;
}

export type MatterFolder = {
  type: SharepointEntityType;
  id: string;
  title: string;
  /** Cesta k detailu záznamu (breadcrumb, odkaz zpět). */
  detailPath: string;
  /** Segmenty kořenové složky spisu, relativně ke kořeni knihovny. */
  rootSegments: string[];
  /** Uložený odkaz na složku — jen pro zobrazení, nikdy ne jako kořen procházení. */
  storedUrl: string | null;
  /**
   * Záznam ve tvaru, jaký očekává `canEditRecord` — tedy včetně odpovědné osoby
   * a řešitelů. Bez nich by advokát odpovědný za spis dostal „nemáte oprávnění".
   */
  editRecord: {
    id: string;
    organizationId: string;
    responsibleUserId?: string | null;
    assignees?: { userId: string }[];
  };
};

/**
 * Načte spis viditelný pro aktuálního uživatele a spočítá jeho kořenovou složku.
 * Vrací null, když záznam neexistuje NEBO na něj uživatel nevidí (schválně se ty
 * dva stavy nerozlišují).
 */
export async function resolveMatterFolder(
  type: SharepointEntityType,
  id: string,
): Promise<MatterFolder | null> {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();

  if (type === "Subject") {
    const record = await prisma.subject.findFirst({
      where: andWhere({ id }, subjectVisibilityWhere(currentUser)),
      select: {
        id: true,
        organizationId: true,
        name: true,
        ico: true,
        sharepointUrl: true,
      },
    });
    if (!record) {
      return null;
    }
    const input: SharepointEntityInput = { type: "Subject", record };
    return {
      type,
      id: record.id,
      title: record.name,
      detailPath: `/subjects/${record.id}`,
      rootSegments: sharepointFolderSegments(input),
      storedUrl: record.sharepointUrl,
      editRecord: { id: record.id, organizationId: record.organizationId },
    };
  }

  if (type === "Project") {
    const record = await prisma.project.findFirst({
      where: andWhere({ id }, projectVisibilityWhere(currentUser)),
      select: {
        id: true,
        organizationId: true,
        name: true,
        sharepointUrl: true,
        responsibleUserId: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!record) {
      return null;
    }
    const input: SharepointEntityInput = { type: "Project", record };
    return {
      type,
      id: record.id,
      title: record.name,
      detailPath: `/projects/${record.id}`,
      rootSegments: sharepointFolderSegments(input),
      storedUrl: record.sharepointUrl,
      editRecord: {
        id: record.id,
        organizationId: record.organizationId,
        responsibleUserId: record.responsibleUserId,
        assignees: record.assignees,
      },
    };
  }

  const record = await prisma.case.findFirst({
    where: andWhere({ id }, caseVisibilityWhere(currentUser)),
    select: {
      id: true,
      organizationId: true,
      name: true,
      fileNumber: true,
      sharepointUrl: true,
      responsibleUserId: true,
      assignees: { select: { userId: true } },
      project: { select: { id: true, name: true } },
    },
  });
  if (!record) {
    return null;
  }
  const input: SharepointEntityInput = { type: "Case", record };
  return {
    type,
    id: record.id,
    title: record.fileNumber ? `${record.name} (${record.fileNumber})` : record.name,
    detailPath: `/cases/${record.id}`,
    rootSegments: sharepointFolderSegments(input),
    storedUrl: record.sharepointUrl,
    editRecord: {
      id: record.id,
      organizationId: record.organizationId,
      responsibleUserId: record.responsibleUserId,
      assignees: record.assignees,
    },
  };
}

/** Cesta do prohlížeče souborů, případně do konkrétní podsložky. */
export function matterBrowsePath(
  type: SharepointEntityType,
  id: string,
  relativePath?: string,
): string {
  const base = `/documents/sharepoint/${type}/${id}`;
  return relativePath
    ? `${base}?path=${encodeURIComponent(relativePath)}`
    : base;
}
