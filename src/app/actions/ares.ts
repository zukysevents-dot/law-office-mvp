"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fetchAresSubject } from "@/lib/ares/client";
import { isAresLookupEnabled } from "@/lib/ares/config";
import { isValidIco, normalizeIco } from "@/lib/ares/ico";
import {
  mapAresToSubjectFields,
  type AresSubjectFields,
} from "@/lib/ares/mapper";
import { auditJson, writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import { assertCanEditRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export type AresLookupResult =
  | { status: "ok"; fields: AresSubjectFields; message: string }
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
  await getCurrentUser();

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
  return {
    status: "ok",
    fields,
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

  const updated = await prisma.subject.update({
    where: { id },
    data: {
      name: fields.name || subject.name,
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
