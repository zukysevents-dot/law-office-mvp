"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

// Triggers the browser print dialog — the invoice page is styled for print
// (@media print in globals.css), so "Save as PDF" yields the PDF with no lib.
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden="true" />
      Tisk / uložit PDF
    </Button>
  );
}
