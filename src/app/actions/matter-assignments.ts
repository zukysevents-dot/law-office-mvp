"use server";

import { revalidatePath } from "next/cache";

import { parseAssigneeToken, parseMatterTargets } from "@/lib/assignments";
import { getCurrentUser } from "@/lib/auth";
import {
  assignToMatters,
  loadEditableMatters,
  resolveAssignee,
  unassignFromMatters,
} from "@/lib/matter-assignments.server";
import { assertCanBulkAssign } from "@/lib/permissions";
import { czechPlural } from "@/lib/plural";
import { getPrisma } from "@/lib/prisma";

export type BulkAssignState = {
  ok: boolean;
  message?: string;
  error?: string;
  // Mění se při každém odeslání — klient podle ní vyprázdní výběr.
  version: number;
};

function done(message: string): BulkAssignState {
  return { ok: true, message, version: Date.now() };
}

function failed(error: string): BulkAssignState {
  return { ok: false, error, version: Date.now() };
}

function skippedNote(skipped: number) {
  if (skipped <= 0) {
    return "";
  }
  return skipped === 1
    ? " U 1 záznamu nemáte oprávnění – byl přeskočen."
    : ` U ${skipped} záznamů nemáte oprávnění – byly přeskočeny.`;
}

// Hromadné přiřazení / odebrání řešitele (osoby nebo týmu) vybraným projektům
// a případům na stránce Týmy a řešitelé. Gate: „Upravuje všechny projekty,
// případy a úkoly“; každý záznam se navíc ověří přes viditelnost a
// canEditRecord (co aktér upravit nesmí, se přeskočí).
export async function bulkUpdateAssignments(
  _previous: BulkAssignState,
  formData: FormData,
): Promise<BulkAssignState> {
  try {
    const prisma = getPrisma();
    const currentUser = await getCurrentUser();
    assertCanBulkAssign(currentUser);

    const targets = parseMatterTargets(formData.getAll("target"));
    if (targets.projectIds.length + targets.caseIds.length === 0) {
      return failed("Vyberte alespoň jeden projekt nebo případ.");
    }
    const token = parseAssigneeToken(formData.get("assignee"));
    if (!token) {
      return failed("Vyberte tým nebo osobu.");
    }
    const mode = formData.get("mode") === "unassign" ? "unassign" : "assign";

    const { matters, skipped } = await loadEditableMatters(
      prisma,
      currentUser,
      targets,
    );
    if (matters.length === 0) {
      return failed("Vybrané záznamy nemůžete upravit.");
    }
    const assignee = await resolveAssignee(prisma, currentUser, token);
    const label =
      assignee.kind === "team"
        ? `Tým „${assignee.name}“`
        : `Řešitel „${assignee.name}“`;

    let message: string;
    if (mode === "assign") {
      const { created } = await assignToMatters(
        prisma,
        currentUser,
        matters,
        assignee,
        { bulk: true },
      );
      const count = created.length;
      message =
        count === 0
          ? "Nic se nezměnilo – vybrané záznamy už tohoto řešitele mají."
          : `${label} přiřazen k ${count} ${czechPlural(count, ["záznamu", "záznamům", "záznamům"])}.`;
    } else {
      const count = await unassignFromMatters(
        prisma,
        currentUser,
        matters,
        assignee,
        { bulk: true },
      );
      message =
        count === 0
          ? "Nic se nezměnilo – vybrané záznamy tohoto řešitele nemají."
          : `${label} odebrán z ${count} ${czechPlural(count, ["záznamu", "záznamů", "záznamů"])}.`;
    }

    // Řešitelé mění viditelnost a sloupce seznamů napříč aplikací.
    revalidatePath("/", "layout");
    return done(`${message}${skippedNote(skipped)}`);
  } catch (error) {
    return failed(
      error instanceof Error ? error.message : "Uložení se nezdařilo.",
    );
  }
}
