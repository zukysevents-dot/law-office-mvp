// Pure ISDOC 6.0.1 invoice generator. No DB / clock / Prisma imports — it takes
// a fully pre-formatted DTO (money as "0.00" strings, dates as "YYYY-MM-DD") and
// returns the XML string. Mirrors the pure-lib + node:test style of csv.ts.
//
// Scope is MVP-minimum: a plain (non-signed) .isdoc XML good enough to import a
// client invoice into Czech accounting software. ISDOCX (zipped PDF), e-signature
// and foreign currency are intentionally out of scope. Exact XSD conformance must
// still be confirmed against the target accounting system.

export const ISDOC_VERSION = "6.0.1";
export const ISDOC_NAMESPACE = "http://isdoc.cz/namespace/2013";
const ISSUING_SYSTEM = "law-office-mvp";

// XML 1.0 forbids most control characters; only TAB/LF/CR are legal. Strip the
// rest so user text can never produce an unparseable document.
const XML_INVALID_CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

export type IsdocParty = {
  name: string;
  ico: string | null;
  dic: string | null;
  address: string | null;
};

export type IsdocSupplier = IsdocParty & {
  bankAccount: string | null;
  iban: string | null;
};

export type IsdocLine = {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatRate: string;
  lineBase: string;
  lineVat: string;
  lineTotal: string;
};

export type IsdocVatRecapEntry = {
  vatRate: string;
  taxableAmount: string;
  taxAmount: string;
  taxInclusiveAmount: string;
};

export type IsdocInvoiceInput = {
  uuid: string;
  number: string;
  variableSymbol: string | null;
  issueDate: string;
  taxDate: string | null;
  dueDate: string | null;
  currency: string;
  vatApplicable: boolean;
  note: string | null;
  supplier: IsdocSupplier;
  customer: IsdocParty;
  lines: IsdocLine[];
  vatRecap: IsdocVatRecapEntry[];
  taxExclusiveTotal: string;
  taxTotal: string;
  taxInclusiveTotal: string;
  payableAmount: string;
};

// Escape every piece of user-controlled text exactly once. `&` MUST be replaced
// first so the entities introduced below aren't double-escaped.
export function xmlEscape(value: string): string {
  return value
    .replace(XML_INVALID_CONTROL, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Stable UUID-shaped document id derived from a seed (the invoice id). Not a
// cryptographic UUID v5 — just a deterministic, UUID-formatted GUID that ISDOC
// importers accept, so re-exporting the same invoice yields the same UUID.
export function deterministicUuid(seed: string): string {
  const block = (salt: string) => {
    let hash = 0x811c9dc5;
    const input = salt + seed;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  };
  const a = block("a");
  const b = block("b");
  const c = block("c");
  const d = block("d");
  return `${a}-${b.slice(0, 4)}-${b.slice(4, 8)}-${c.slice(0, 4)}-${c.slice(4, 8)}${d}`;
}

function el(name: string, value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

function postalAddress(address: string | null): string {
  // We only have a single free-text address line in the snapshot; emit it as
  // StreetName and leave the structured fields out (best-effort for MVP).
  const street = el("StreetName", address);
  return `<PostalAddress>${street ?? "<StreetName/>"}</PostalAddress>`;
}

function supplierParty(supplier: IsdocSupplier, vatApplicable: boolean): string {
  return [
    "<AccountingSupplierParty>",
    "<Party>",
    supplier.ico
      ? `<PartyIdentification>${el("ID", supplier.ico)}</PartyIdentification>`
      : null,
    `<PartyName>${el("Name", supplier.name) ?? "<Name/>"}</PartyName>`,
    postalAddress(supplier.address),
    vatApplicable && supplier.dic
      ? `<PartyTaxScheme>${el("CompanyID", supplier.dic)}<TaxScheme>VAT</TaxScheme></PartyTaxScheme>`
      : null,
    "</Party>",
    "</AccountingSupplierParty>",
  ]
    .filter(Boolean)
    .join("");
}

function customerParty(customer: IsdocParty): string {
  return [
    "<AccountingCustomerParty>",
    "<Party>",
    customer.ico
      ? `<PartyIdentification>${el("ID", customer.ico)}</PartyIdentification>`
      : null,
    `<PartyName>${el("Name", customer.name) ?? "<Name/>"}</PartyName>`,
    postalAddress(customer.address),
    customer.dic
      ? `<PartyTaxScheme>${el("CompanyID", customer.dic)}<TaxScheme>VAT</TaxScheme></PartyTaxScheme>`
      : null,
    "</Party>",
    "</AccountingCustomerParty>",
  ]
    .filter(Boolean)
    .join("");
}

function invoiceLine(line: IsdocLine): string {
  return [
    "<InvoiceLine>",
    el("ID", line.id),
    `<InvoicedQuantity unitCode="${xmlEscape(line.unit)}">${xmlEscape(line.quantity)}</InvoicedQuantity>`,
    el("LineExtensionAmount", line.lineBase),
    el("LineExtensionAmountTaxInclusive", line.lineTotal),
    el("LineExtensionTaxAmount", line.lineVat),
    el("UnitPrice", line.unitPrice),
    `<ClassifiedTaxCategory>${el("Percent", line.vatRate)}<VATCalculationMethod>0</VATCalculationMethod></ClassifiedTaxCategory>`,
    `<Item>${el("Description", line.description) ?? "<Description/>"}</Item>`,
    "</InvoiceLine>",
  ]
    .filter(Boolean)
    .join("");
}

function taxSubTotal(entry: IsdocVatRecapEntry): string {
  return [
    "<TaxSubTotal>",
    el("TaxableAmount", entry.taxableAmount),
    el("TaxAmount", entry.taxAmount),
    el("TaxInclusiveAmount", entry.taxInclusiveAmount),
    "<AlreadyClaimedTaxableAmount>0</AlreadyClaimedTaxableAmount>",
    "<AlreadyClaimedTaxAmount>0</AlreadyClaimedTaxAmount>",
    "<AlreadyClaimedTaxInclusiveAmount>0</AlreadyClaimedTaxInclusiveAmount>",
    el("DifferenceTaxableAmount", entry.taxableAmount),
    el("DifferenceTaxAmount", entry.taxAmount),
    el("DifferenceTaxInclusiveAmount", entry.taxInclusiveAmount),
    `<ClassifiedTaxCategory>${el("Percent", entry.vatRate)}<VATCalculationMethod>0</VATCalculationMethod></ClassifiedTaxCategory>`,
    "</TaxSubTotal>",
  ]
    .filter(Boolean)
    .join("");
}

function paymentMeans(input: IsdocInvoiceInput): string | null {
  const details = [
    el("PaymentDueDate", input.dueDate),
    el("ID", input.supplier.bankAccount),
    el("IBAN", input.supplier.iban),
    el("VariableSymbol", input.variableSymbol),
  ].filter(Boolean);
  if (details.length === 0) {
    return null;
  }
  return [
    "<PaymentMeans>",
    "<Payment>",
    el("PaidAmount", input.payableAmount),
    "<PaymentMeansCode>42</PaymentMeansCode>",
    `<Details>${details.join("")}</Details>`,
    "</Payment>",
    "</PaymentMeans>",
  ]
    .filter(Boolean)
    .join("");
}

export function buildIsdocXml(input: IsdocInvoiceInput): string {
  const body = [
    `<Invoice xmlns="${ISDOC_NAMESPACE}" version="${ISDOC_VERSION}">`,
    "<DocumentType>1</DocumentType>",
    el("ID", input.number),
    el("UUID", input.uuid),
    el("IssuingSystem", ISSUING_SYSTEM),
    el("IssueDate", input.issueDate),
    el("TaxPointDate", input.taxDate),
    `<VATApplicable>${input.vatApplicable ? "true" : "false"}</VATApplicable>`,
    el("LocalCurrencyCode", input.currency),
    "<CurrRate>1</CurrRate>",
    "<RefCurrRate>1</RefCurrRate>",
    supplierParty(input.supplier, input.vatApplicable),
    customerParty(input.customer),
    `<InvoiceLines>${input.lines.map(invoiceLine).join("")}</InvoiceLines>`,
    `<TaxTotal>${input.vatRecap.map(taxSubTotal).join("")}${el("TaxAmount", input.taxTotal)}</TaxTotal>`,
    "<LegalMonetaryTotal>",
    el("TaxExclusiveAmount", input.taxExclusiveTotal),
    el("TaxInclusiveAmount", input.taxInclusiveTotal),
    "<AlreadyClaimedTaxExclusiveAmount>0</AlreadyClaimedTaxExclusiveAmount>",
    "<AlreadyClaimedTaxInclusiveAmount>0</AlreadyClaimedTaxInclusiveAmount>",
    el("DifferenceTaxExclusiveAmount", input.taxExclusiveTotal),
    el("DifferenceTaxInclusiveAmount", input.taxInclusiveTotal),
    "<PayableRoundingAmount>0</PayableRoundingAmount>",
    "<PaidDepositsAmount>0</PaidDepositsAmount>",
    el("PayableAmount", input.payableAmount),
    "</LegalMonetaryTotal>",
    paymentMeans(input),
    el("Note", input.note),
    "</Invoice>",
  ]
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;
}
