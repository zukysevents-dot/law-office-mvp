// Document templates (F5 / DOC-4). Pure, DB-free, clock-free helpers so they are
// unit-testable. The server action loads case/client/org data, calls
// buildTemplateContext(...) (passing `today` in — no clock here), then
// renderTemplate(...) to substitute {{tokens}}. Generation returns TEXT only; we
// never render a binary file (SharePoint-reference model).

// The tokens a template may reference, with a Czech label for the UI hint.
export const SUPPORTED_PLACEHOLDERS: ReadonlyArray<{
  key: string;
  label: string;
}> = [
  { key: "case.name", label: "Název spisu" },
  { key: "case.fileNumber", label: "Spisová značka" },
  { key: "project.name", label: "Projekt" },
  { key: "client.name", label: "Klient — název" },
  { key: "client.ico", label: "Klient — IČO" },
  { key: "client.dic", label: "Klient — DIČ" },
  { key: "client.address", label: "Klient — adresa" },
  { key: "counterparty.name", label: "Protistrana — název" },
  { key: "counterparty.ico", label: "Protistrana — IČO" },
  { key: "lawyer.name", label: "Odpovědný advokát" },
  { key: "org.name", label: "Kancelář" },
  { key: "today", label: "Dnešní datum" },
];

export type TemplateContextInput = {
  caseName: string;
  fileNumber: string | null;
  projectName: string | null;
  client: {
    name: string;
    ico: string | null;
    dic: string | null;
    address: string | null;
  } | null;
  counterparty: { name: string; ico: string | null } | null;
  lawyerName: string | null;
  orgName: string;
  today: Date;
};

const czDate = new Intl.DateTimeFormat("cs-CZ", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

// Flatten the loaded data into a flat token→value map. Values that are absent in
// the data become "" (empty), which renderTemplate distinguishes from a token
// the template author misspelled (not in the map at all).
export function buildTemplateContext(
  input: TemplateContextInput,
): Record<string, string> {
  return {
    "case.name": input.caseName,
    "case.fileNumber": input.fileNumber ?? "",
    "project.name": input.projectName ?? "",
    "client.name": input.client?.name ?? "",
    "client.ico": input.client?.ico ?? "",
    "client.dic": input.client?.dic ?? "",
    "client.address": input.client?.address ?? "",
    "counterparty.name": input.counterparty?.name ?? "",
    "counterparty.ico": input.counterparty?.ico ?? "",
    "lawyer.name": input.lawyerName ?? "",
    "org.name": input.orgName,
    today: czDate.format(input.today),
  };
}

// Substitute {{token}} (whitespace tolerant) from context. A token PRESENT in the
// context renders its value (possibly ""); a token MISSING from the context is
// kept visible as "[doplňte: token]" so the lawyer notices an unknown/misspelled
// placeholder rather than silently dropping it.
export function renderTemplate(
  bodyTemplate: string,
  context: Record<string, string>,
): string {
  return bodyTemplate.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, rawKey) => {
    const key = String(rawKey);
    return Object.prototype.hasOwnProperty.call(context, key)
      ? context[key]
      : `[doplňte: ${key}]`;
  });
}
