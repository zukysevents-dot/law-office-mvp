"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { SubjectType } from "@/generated/prisma/enums";
import { fetchAresSubject, fetchAresVr } from "@/lib/ares/client";
import { isAresLookupEnabled } from "@/lib/ares/config";
import { isValidIco, normalizeIco } from "@/lib/ares/ico";
import {
  mapAresToSubjectFields,
  type AresSubjectFields,
} from "@/lib/ares/mapper";
import { mapAresStatutoryBodies } from "@/lib/ares/statutory";
import { auditJson, writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import { assertCanEditRecord, canManageSubjects } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { composeSubjectName } from "@/lib/subjects/person-name";

/** A statutory body offered for pre-fill (the user picks which to take). */
export type AresStatutorySuggestion = {
  name: string;
  function: string | null;
  actingMethod: string | null;
  validFrom: string | null;
  /** Existing subject of the same office with the member's IČO, if any. */
  linkedSubjectId: string | null;
};

export type AresLookupResult =
  | {
      status: "ok";
      fields: AresSubjectFields;
      statutoryBodies: AresStatutorySuggestion[];
      message: string;
    }
  | { status: "invalid"; message: string }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };

/**
 * Read-only ARES lookup used by the subject form to pre-fill fields. Returns a
 * serializable union (never throws for expected outcomes) so the client island
 * can render a precise Czech notice. Does NOT write to the database.
 */
export async function lookupAres(rawIco: string): Promise<AresLookupResult> {
  // Auth gate — Server Functions are reachable via direct POST.
  const currentUser = await getCurrentUser();

  if (!isAresLookupEnabled()) {
    return { status: "error", message: "Vyhledávání v ARES je vypnuté." };
  }

  const ico = normalizeIco(rawIco);
  if (!ico || !isValidIco(ico)) {
    return {
      status: "invalid",
      message: "Zadejte platné české IČO (8 číslic).",
    };
  }

  const result = await fetchAresSubject(ico);
  if (result.status !== "ok") {
    return result;
  }

  const fields = mapAresToSubjectFields(result.data);

  // Statutory bodies live only in the public-register (VR) record. Fetched
  // only when ARES says the subject is registered there; a failure just
  // means no suggestions — the basic lookup never fails because of it.
  let statutoryBodies: AresStatutorySuggestion[] = [];
  if (result.data.seznamRegistraci?.stavZdrojeVr === "AKTIVNI") {
    const bodies = mapAresStatutoryBodies(await fetchAresVr(ico));
    const icos = bodies.map((body) => body.ico).filter((v): v is string => Boolean(v));
    // Link suggestions reveal subject ids → only for users who manage subjects,
    // and only within their own office.
    const linked =
      icos.length > 0 && canManageSubjects(currentUser)
        ? await getPrisma().subject.findMany({
            where: {
              organizationId: currentUser.organizationId,
              archivedAt: null,
              ico: { in: icos },
            },
            select: { id: true, ico: true },
          })
        : [];
    const byIco = new Map(linked.map((subject) => [subject.ico, subject.id]));
    statutoryBodies = bodies.map((body) => ({
      name: body.name,
      function: body.function,
      actingMethod: body.actingMethod,
      validFrom: body.validFrom,
      linkedSubjectId: body.ico ? (byIco.get(body.ico) ?? null) : null,
    }));
  }

  return {
    status: "ok",
    fields,
    statutoryBodies,
    message: fields.riskFlag
      ? "Údaje načteny z ARES. Pozor: subjekt je v rizikovém stavu."
      : "Údaje načteny z ARES.",
  };
}

/**
 * Re-verify a stored subject against ARES: refresh the registry fields, flag
 * risk (additively), stamp `aresVerifiedAt`, audit the diff, and redirect with
 * an `?ares=` notice. Mirrors `provisionSharepointFolder`.
 */
export async function verifySubjectFromAres(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const id = requiredString(formData, "id");
  const detailPath = `/subjects/${id}`;

  const subject = await prisma.subject.findUniqueOrThrow({ where: { id } });
  assertCanEditRecord(currentUser, "Subject", subject);

  if (!isAresLookupEnabled()) {
    redirect(`${detailPath}?ares=error`);
  }

  const ico = normalizeIco(subject.ico);
  if (!ico || !isValidIco(ico)) {
    redirect(`${detailPath}?ares=invalid`);
  }

  const result = await fetchAresSubject(ico);
  if (result.status === "not_found") {
    redirect(`${detailPath}?ares=notFound`);
  }
  if (result.status === "error") {
    redirect(`${detailPath}?ares=error`);
  }

  const fields = mapAresToSubjectFields(result.data);

  // A sole trader's ARES name is the trade name; the display name is then
  // re-composed from it. A non-entrepreneur person keeps their own name.
  const tradeName =
    subject.type === SubjectType.ENTREPRENEUR
      ? fields.tradeName || subject.tradeName
      : subject.tradeName;
  const name =
    subject.type === SubjectType.ENTREPRENEUR
      ? composeSubjectName(subject.type, { ...subject, tradeName }) || subject.name
      : subject.type === SubjectType.PERSON
        ? subject.name
        : fields.name || subject.name;

  const updated = await prisma.subject.update({
    where: { id },
    data: {
      name,
      tradeName,
      // ARES is authoritative when it returns a value; keep the stored value
      // (don't wipe) when ARES omits it — e.g. a non-VAT payer has no DIČ.
      dic: fields.dic ?? subject.dic,
      address: fields.address ?? subject.address,
      legalForm: fields.legalForm ?? subject.legalForm,
      // Non-destructive risk merge: verifying can raise a flag but never
      // silently clears a manually-set one.
      insolvencyStatus: fields.insolvencyStatus ?? subject.insolvencyStatus,
      riskFlag: fields.riskFlag || subject.riskFlag,
      aresVerifiedAt: new Date(),
    },
  });

  await writeAuditLog({
    organizationId: currentUser.organizationId,
    entityType: "Subject",
    entityId: id,
    action: "ARES_VERIFY",
    changedById: currentUser.id,
    oldValue: auditJson(subject),
    newValue: auditJson(updated),
  });

  revalidatePath("/subjects");
  revalidatePath(detailPath);
  redirect(`${detailPath}?ares=${fields.riskFlag ? "risk" : "ok"}`);
}
