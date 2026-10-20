"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Dialog } from "@/components/ui/dialog";

/**
 * "Nový výkaz práce" modal. Its open state lives in the URL (?new=1), so every
 * close path (×, Escape, click outside) replaces the URL with `closeHref`
 * exactly once; the dialog hides immediately without waiting for that
 * navigation.
 */
export function WorkLogCreateDialog({
  open,
  closeHref,
  children,
}: {
  open: boolean;
  closeHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  // Re-arm when the URL opens the dialog again (adjust state during render).
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    setDismissed(false);
  }

  function onOpenChange(next: boolean) {
    if (next || dismissed) {
      return;
    }
    setDismissed(true);
    router.replace(closeHref, { scroll: false });
  }

  return (
    <Dialog
      open={open && !dismissed}
      onOpenChange={onOpenChange}
      title="Nový výkaz práce"
      size="xl"
    >
      <div className="p-5">{children}</div>
    </Dialog>
  );
}
