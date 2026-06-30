import { SalaryTaxMode } from "@/generated/prisma/enums";

// Čistá validace mzdových polí (revize ř.114) — citlivé, jen ADMIN/PARTNER.
// Vyčleněno z "use server" akce (hr.ts), aby šlo unit-testovat (node --test).

// Maximální povolená hrubá měsíční mzda/odměna (Kč). Nad limit = pravděpodobně
// chyba zadání (např. zadané v haléřích) → odmítnout.
export const MAX_GROSS_SALARY_CZK = 99_999_999;

// Validace již rozparsovaného čísla z optionalNumber(formData, "grossSalaryCzk").
//   null  → pole prázdné, mzda nezadána (vrací null)
//   <0    → throw (záporná mzda nedává smysl)
//   >MAX  → throw (mimo rozsah)
// Pozn.: čárka jako desetinný oddělovač řeší už optionalNumber (replace ",")→"."),
// tady jen validujeme rozsah.
export function validateGrossSalary(value: number | null): number | null {
  if (value == null) {
    return null;
  }
  if (value < 0 || value > MAX_GROSS_SALARY_CZK) {
    throw new Error("Neplatná výše mzdy.");
  }
  return value;
}

// Daňový/mzdový režim z formuláře.
//   prázdný řetězec / null → null (režim NENÍ nastaven; NE default EMPLOYMENT)
//   platná hodnota enumu   → ta hodnota
//   neplatná hodnota enumu → EMPLOYMENT (fallback, drží chování enumValue)
// Tj. null se vrací JEN pro prázdný vstup; jakmile uživatel něco vyplní,
// neznámá hodnota se bezpečně mapuje na EMPLOYMENT (nikdy se neuloží smetí).
export function parseSalaryTaxMode(
  raw: string | null | undefined,
): SalaryTaxMode | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return null;
  }
  const values = Object.values(SalaryTaxMode) as string[];
  return values.includes(trimmed)
    ? (trimmed as SalaryTaxMode)
    : SalaryTaxMode.EMPLOYMENT;
}
