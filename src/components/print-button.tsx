"use client";

import { Button } from "@/components/ui/button";

// Triggers the browser print dialog (→ "Save as PDF"). Used on the invoice
// print view until a real server-side PDF generator lands (roadmap S7).
export function PrintButton({ label = "Tisk / uložit PDF" }: { label?: string }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
