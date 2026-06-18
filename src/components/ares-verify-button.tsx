"use client";

import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";

import { verifySubjectFromAres } from "@/app/actions/ares";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      <RefreshCw
        className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {pending ? "Ověřuji v ARES…" : "Ověřit přes ARES"}
    </Button>
  );
}

/** Detail-page button that re-verifies a subject against ARES. */
export function AresVerifyButton({ subjectId }: { subjectId: string }) {
  return (
    <form action={verifySubjectFromAres}>
      <input type="hidden" name="id" value={subjectId} />
      <SubmitButton />
    </form>
  );
}
