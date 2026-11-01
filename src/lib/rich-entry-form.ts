// Výsledek server action pro formuláře s formátovaným textem (komentáře
// u projektů/případů, zpětná vazba) volané přes useActionState.
export type RichEntryFormState = {
  ok: boolean;
  message?: string;
  error?: string;
  // Mění se při každém odeslání — klient podle ní zavře dialog / vyprázdní pole.
  version: number;
};

export const initialRichEntryFormState: RichEntryFormState = {
  ok: false,
  version: 0,
};

export function richEntryDone(message: string): RichEntryFormState {
  return { ok: true, message, version: Date.now() };
}

export function richEntryFailed(error: string): RichEntryFormState {
  return { ok: false, error, version: Date.now() };
}

export function richEntryErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Uložení se nezdařilo.";
}
