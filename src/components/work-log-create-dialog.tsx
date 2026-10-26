"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Dialog } from "@/components/ui/dialog";

/**
 * "Nový výkaz práce" / "Duplikovat výkaz práce" modal. Its open state lives in
 * the URL (?new=1, ?hours=… from the timer, ?duplicate=<id>), so every
 * close path (×, Escape, click outside) replaces the URL with `closeHref`
 * exactly once; the dialog hides immediately without waiting for that
 * navigation.
 */
export function WorkLogCreateDialog({
  open,
  closeHref,
  title = "Nový výkaz práce",
  description,
  children,
}: {
  open: boolean;
  closeHref: string;
  title?: string;
  description?: ReactNode;
  children: ReactNode;
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
      title={title}
      description={description}
      size="xl"
    >
      <div className="p-5">{children}</div>
    </Dialog>
  );
}
