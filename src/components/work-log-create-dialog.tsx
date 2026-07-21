"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function WorkLogCreateDialog({
  open,
  closeHref,
  children,
}: {
  open: boolean;
  closeHref: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="new-work-log-title"
      onClose={() => router.replace(closeHref)}
      className="m-auto max-h-[90vh] w-[min(960px,calc(100%-2rem))] overflow-y-auto rounded-xl border border-[#d4e2dc] bg-white p-0 shadow-2xl backdrop:bg-black/40"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#d4e2dc] bg-white px-5 py-4">
        <h2 id="new-work-log-title" className="text-lg font-semibold text-[#072924]">
          Nový výkaz práce
        </h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Zavřít nový výkaz"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-stone-600 transition hover:bg-stone-100 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#072924]"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}
