"use server";

import { revalidatePath } from "next/cache";

import { ModuleKey } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import { requiredString, optionalString } from "@/lib/form";
import { assertCanManageAml } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  MATCH_THRESHOLD,
  MAX_CANDIDATES,
  SANCTIONS_SOURCE,
} from "@/lib/sanctions/config";
import { selectCandidates } from "@/lib/sanctions/matching";
import { normalizeName } from "@/lib/sanctions/normalize";

// AML-5+: run a sanctions screening for a subject. The screening only SUGGESTS
// candidates for the lawyer to review — it never sets AmlAssessment.hasSanctions
// or Subject.riskFlag. Those stay a deliberate human decision via assessRisk.
export async function runSanctionsScreening(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.AML);
  assertCanManageAml(currentUser);

  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Chybí organizace.");
  }
  const subjectId = requiredString(formData, "subjectId");

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, organizationId },
    select: { id: true, name: true },
  });
  if (!subject) {
    throw new Error("Klient nenalezen.");
  }
  const queryNormalized = normalizeName(subject.name);
  if (!queryNormalized) {
    throw new Error("Subjekt nemá jméno, screening nelze spustit.");
  }

  // Global reference mirror — score every entry of the source in memory. The
  // list is in the low thousands; a pre-filter index can be added later if needed.
  const entries = await prisma.sanctionsListEntry.findMany({
    where: { source: SANCTIONS_SOURCE },
    select: {
      id: true,
      primaryName: true,
      normalizedName: true,
      aliasesNormalized: true,
    },
  });

  const candidates = selectCandidates(queryNormalized, entries, {
    threshold: MATCH_THRESHOLD,
    limit: MAX_CANDIDATES,
  });

  // No candidates ⇒ a factual "nothing on the list", recorded as evidence the
  // check ran. With candidates, the lawyer must review each one.
  const hasCandidates = candidates.length > 0;

  await prisma.$transaction(async (tx) => {
    const screening = await tx.sanctionsScreening.create({
      data: {
        organizationId,
        subjectId,
        queryName: subject.name,
        queryNormalized,
        source: SANCTIONS_SOURCE,
        candidateCount: candidates.length,
        status: hasCandidates ? "PENDING_REVIEW" : "REVIEWED",
        reviewOutcome: hasCandidates ? null : "NO_CANDIDATES",
        runById: currentUser.id,
      },
    });

    if (hasCandidates) {
      await tx.sanctionsScreeningMatch.createMany({
        data: candidates.map((candidate) => ({
          organizationId,
          screeningId: screening.id,
          listEntryId: candidate.entry.id,
          matchedName: candidate.entry.primaryName,
          score: candidate.score,
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        entityType: "Subject",
        entityId: subjectId,
        action: "AML_SCREEN",
        changedById: currentUser.id,
        newValue: auditJson({
          screeningId: screening.id,
          candidateCount: candidates.length,
          source: SANCTIONS_SOURCE,
        }),
      },
    });
  });

  revalidatePath(`/subjects/${subjectId}`);
  revalidatePath("/aml");
}

// Lawyer confirms or dismisses one candidate. Confirming does NOT auto-flag the
// subject — the UI then prompts the lawyer to set "Sankce" in the AML assessment.
export async function decideSanctionsMatch(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.AML);
  assertCanManageAml(currentUser);

  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Chybí organizace.");
  }
  const matchId = requiredString(formData, "matchId");
  const decision = requiredString(formData, "decision");
  if (decision !== "CONFIRMED" && decision !== "DISMISSED") {
    throw new Error("Neplatné rozhodnutí.");
  }
  const decisionNote = optionalString(formData, "decisionNote");

  const match = await prisma.sanctionsScreeningMatch.findFirst({
    where: { id: matchId, organizationId },
    include: { screening: { select: { id: true, subjectId: true } } },
  });
  if (!match) {
    throw new Error("Kandidát nenalezen.");
  }
  // Each candidate is decided once — re-running the screening creates a fresh
  // record. Blocking re-decision keeps the AML audit trail unambiguous and stops
  // a stray re-POST from silently flipping a confirmed hit.
  if (match.decision !== "PENDING") {
    throw new Error("Kandidát už byl posouzen.");
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.sanctionsScreeningMatch.update({
      where: { id: matchId },
      data: {
        decision,
        decisionNote,
        decidedById: currentUser.id,
        decidedAt: now,
      },
    });

    // Recompute the parent screening's review state from its matches.
    const siblings = await tx.sanctionsScreeningMatch.findMany({
      where: { screeningId: match.screeningId },
      select: { decision: true },
    });
    const anyPending = siblings.some((sibling) => sibling.decision === "PENDING");
    const anyConfirmed = siblings.some(
      (sibling) => sibling.decision === "CONFIRMED",
    );

    await tx.sanctionsScreening.update({
      where: { id: match.screeningId },
      data: {
        status: anyPending ? "PENDING_REVIEW" : "REVIEWED",
        reviewOutcome: anyPending
          ? null
          : anyConfirmed
            ? "MATCH_CONFIRMED"
            : "NO_MATCH_CONFIRMED",
        reviewedById: anyPending ? null : currentUser.id,
        reviewedAt: anyPending ? null : now,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "Subject",
        entityId: match.screening.subjectId,
        action: "AML_SCREEN_DECIDE",
        changedById: currentUser.id,
        oldValue: auditJson({ matchId, decision: match.decision }),
        newValue: auditJson({ matchId, decision }),
      },
    });
  });

  revalidatePath(`/subjects/${match.screening.subjectId}`);
  revalidatePath("/aml");
}
