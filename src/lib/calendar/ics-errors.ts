// Error codes of the Outlook (ICS) import and their Czech messages. The code is
// what gets stored (CalendarFeed.lastErrorCode); the message is derived when
// rendering, so the secret feed URL never ends up in an error text.

export const ICS_ERROR_CODES = [
  "INVALID_URL",
  "NOT_HTTPS",
  "CREDENTIALS_IN_URL",
  "BLOCKED_ADDRESS",
  "DNS_FAILED",
  "HTTP_STATUS",
  "TIMEOUT",
  "TOO_LARGE",
  "TOO_MANY_REDIRECTS",
  "NOT_ICS",
  "NETWORK",
  "SECRET_UNREADABLE",
] as const;

export type IcsErrorCode = (typeof ICS_ERROR_CODES)[number];

export class IcsFetchError extends Error {
  readonly code: IcsErrorCode;
  readonly status?: number;

  constructor(code: IcsErrorCode, status?: number) {
    super(`ICS ${code}${status ? ` ${status}` : ""}`);
    this.name = "IcsFetchError";
    this.code = code;
    this.status = status;
  }
}

export function isIcsErrorCode(value: unknown): value is IcsErrorCode {
  return (
    typeof value === "string" &&
    (ICS_ERROR_CODES as readonly string[]).includes(value)
  );
}

const BLOCKED_MESSAGE =
  "Odkaz míří na neveřejnou adresu (vnitřní síť) – z bezpečnostních důvodů ho nelze použít.";

/** Czech, user-facing message for an import error (never contains the URL). */
export function icsErrorMessage(code: IcsErrorCode, status?: number | null): string {
  switch (code) {
    case "INVALID_URL":
      return "Vložte platný odkaz na kalendář (začíná https://).";
    case "NOT_HTTPS":
      return "Odkaz musí začínat https:// (odkaz webcal:// převedeme automaticky).";
    case "CREDENTIALS_IN_URL":
      return "Odkaz nesmí obsahovat jméno a heslo.";
    case "BLOCKED_ADDRESS":
      return BLOCKED_MESSAGE;
    case "DNS_FAILED":
      return "Server z odkazu se nepodařilo najít. Zkontrolujte, že jste zkopírovali celý odkaz.";
    case "HTTP_STATUS":
      return `Kalendář se nepodařilo stáhnout (server odpověděl kódem ${status ?? "?"}). Zkontrolujte, že je kalendář v Outlooku stále publikovaný.`;
    case "TIMEOUT":
      return "Kalendář se nepodařilo stáhnout do 10 sekund. Zkuste to prosím znovu.";
    case "TOO_LARGE":
      return "Soubor kalendáře je větší než 5 MB – takový kalendář neumíme načíst.";
    case "TOO_MANY_REDIRECTS":
      return "Odkaz přesměrovává příliš mnohokrát nebo na nepovolenou adresu.";
    case "NOT_ICS":
      return "Odkaz nevede na kalendář ve formátu ICS. Zkopírujte v Outlooku odkaz ICS, ne HTML.";
    case "NETWORK":
      return "Kalendář se nepodařilo stáhnout. Zkuste to prosím později.";
    case "SECRET_UNREADABLE":
      return "Uložený odkaz nelze přečíst – vložte ho prosím znovu.";
  }
}
