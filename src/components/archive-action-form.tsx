"use client";

import { ArchiveRestore, ArchiveX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ArchiveActionFormProps = {
  action: (formData: FormData) => Promise<void>;
  id: string;
  mode: "archive" | "restore";
  className?: string;
  buttonClassName?: string;
  // Name of the hidden id field. Defaults to "id"; pass e.g. "documentId" when
  // the target action reads a differently-named id.
  idFieldName?: string;
};

// Bez potvrzovacího dialogu (revize): archivace je vratná (tlačítko „Obnovit
// z archivu"), takže extra „opravdu chcete?" okno jen zdržuje. Samotné kliknutí
// na tlačítko je vědomá akce.
export function ArchiveActionForm({
  action,
  id,
  mode,
  className,
  buttonClassName,
  idFieldName = "id",
}: ArchiveActionFormProps) {
  return (
    <form action={action} className={cn("inline-flex", className)}>
      <input type="hidden" name={idFieldName} value={id} />
      <Button
        type="submit"
        variant={mode === "archive" ? "danger" : "secondary"}
        className={buttonClassName}
      >
        {mode === "archive" ? (
          <ArchiveX className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
        )}
        {mode === "archive" ? "Archivovat záznam" : "Obnovit z archivu"}
      </Button>
    </form>
  );
}
