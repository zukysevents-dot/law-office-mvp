// Czech QR payment (formát "QR Platba", SPD 1.0) helpers. Pure + dependency-free
// so the money-path math (account→IBAN mod-97) is unit-testable. The QR image
// itself is rendered from spdPaymentString() by the caller (qrcode → SVG).

// Convert a Czech account number "[prefix-]number/bankcode" to an IBAN.
// Returns null when the input isn't a well-formed Czech account.
export function czAccountToIban(account: string | null | undefined): string | null {
  if (!account) return null;
  const m = account.trim().match(/^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/);
  if (!m) return null;
  const prefix = (m[1] ?? "").padStart(6, "0");
  const number = m[2].padStart(10, "0");
  const bank = m[3];
  const bban = `${bank}${prefix}${number}`; // 20 digits
  // Check digits: append country ("CZ"→1235) + "00", mod 97, subtract from 98.
  const check = 98 - mod97(`${bban}1235` + "00");
  return `CZ${String(check).padStart(2, "0")}${bban}`;
}

// mod 97 over an arbitrarily long numeric string (avoids BigInt for clarity).
function mod97(numeric: string): number {
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + (ch.charCodeAt(0) - 48)) % 97;
  }
  return remainder;
}

// SPD 1.0 payment string. amount is in CZK; vs/msg are optional.
export function spdPaymentString(input: {
  iban: string;
  amount: number;
  variableSymbol?: string;
  message?: string;
}): string {
  const fields = [
    "SPD*1.0",
    `ACC:${input.iban}`,
    `AM:${input.amount.toFixed(2)}`,
    "CC:CZK",
  ];
  if (input.variableSymbol) fields.push(`X-VS:${sanitize(input.variableSymbol)}`);
  if (input.message) fields.push(`MSG:${sanitize(input.message).slice(0, 60)}`);
  return fields.join("*");
}

// "*" is the SPD delimiter and can't appear inside a value.
function sanitize(value: string): string {
  return value.replace(/\*/g, " ").trim();
}
