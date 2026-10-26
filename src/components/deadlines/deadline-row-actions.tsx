"use client";

import { ArchiveRestore, ArchiveX, Undo2 } from "lucide-react";

import {
  archiveDeadline,
  reopenDeadline,
  restoreDeadline,
} from "@/app/actions/deadlines";
import { Button } from "@/components/ui/button";
import { ConfirmDialogButton } from "@/components/ui/confirm-dialog";

/** Actions of a fulfilled, not archived deadline: archive / back to active. */
export function FulfilledDeadlineActions({ deadlineId }: { deadlineId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <form action={archiveDeadline} className="inline-flex">
        <input type="hidden" name="deadlineId" value={deadlineId} />
        <Button
          type="submit"
          variant="secondary"
          className="h-9 whitespace-nowrap px-3"
          pendingLabel="Archivuji…"
        >
          <ArchiveX className="h-4 w-4" aria-hidden="true" />
          Archivovat
        </Button>
      </form>
      <form action={reopenDeadline} className="inline-flex">
        <input type="hidden" name="deadlineId" value={deadlineId} />
        <ConfirmDialogButton
          label={
            <>
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Vrátit mezi aktivní
            </>
          }
          confirmLabel="Vrátit mezi aktivní"
          title="Vrátit lhůtu mezi aktivní"
          message="Vrátit lhůtu mezi aktivní? Znovu se začne hlídat a posílat upozornění."
          pendingLabel="Vracím…"
          variant="ghost"
          className="h-9 whitespace-nowrap px-3"
        />
      </form>
    </div>
  );
}

/** Action of an archived fulfilled deadline: back to „Splněné". */
export function ArchivedDeadlineActions({ deadlineId }: { deadlineId: string }) {
  return (
    <form action={restoreDeadline} className="inline-flex">
      <input type="hidden" name="deadlineId" value={deadlineId} />
      <Button
        type="submit"
        variant="secondary"
        className="h-9 whitespace-nowrap px-3"
        pendingLabel="Obnovuji…"
      >
        <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
        Obnovit z archivu
      </Button>
    </form>
  );
}
