import { isSafeHttpUrl } from "@/lib/utils";

// Čistá validace skenu dokladu (AML, ř.26). Vyčleněno z "use server" akce
// (aml.ts), aby šlo unit-testovat (node --test). Sken = odkaz (http/https) do
// externího úložiště, ne soubor v DB.

export const MAX_SCAN_URL_LENGTH = 2000;
export const MAX_SCAN_NOTE_LENGTH = 2000;

// Odmítne neplatný/nebezpečný odkaz na sken (javascript:/data:/relativní/…) i
// příliš dlouhý. Prázdná URL je validní (= mazání skenu, řeší normalizeScanFields).
export function validateScanUrl(url: string | null | undefined): void {
  if (!url) {
    return;
  }
  if (!isSafeHttpUrl(url)) {
    throw new Error("Odkaz na sken musí být platná http(s) adresa.");
  }
  if (url.length > MAX_SCAN_URL_LENGTH) {
    throw new Error("Odkaz na sken je příliš dlouhý.");
  }
}

export type NormalizedScanFields = {
  scanUrl: string | null;
  scanFileName: string | null;
  scanNote: string | null;
  scanUploadedAt: Date | null;
};

// Normalizuje validovaná skenová pole. Když je URL prázdná (mazání skenu), jsou
// fileName/note/uploadedAt vynulovány — poznámka ani název nedávají bez skenu
// smysl. uploadedAt nese aktuální čas; injektuje se přes `now`, aby fce zůstala
// čistá a deterministicky testovatelná.
export function normalizeScanFields(
  input: {
    scanUrl: string | null | undefined;
    scanFileName: string | null | undefined;
    scanNote: string | null | undefined;
  },
  now: Date,
): NormalizedScanFields {
  const scanUrl = input.scanUrl || null;
  validateScanUrl(scanUrl);

  const scanNote = scanUrl ? input.scanNote ?? null : null;
  if (scanNote && scanNote.length > MAX_SCAN_NOTE_LENGTH) {
    throw new Error("Poznámka ke skenu je příliš dlouhá.");
  }

  return {
    scanUrl,
    scanFileName: scanUrl ? input.scanFileName ?? null : null,
    scanNote,
    scanUploadedAt: scanUrl ? now : null,
  };
}
