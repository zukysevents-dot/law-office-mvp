// Pure Pohoda (Stormware) XML invoice generator. Reuses the same pre-formatted
// invoice DTO as the ISDOC export (IsdocInvoiceInput is a neutral invoice-export
// shape) and serializes it into Pohoda's import XML. Pure — mirrors isdoc.ts.
//
// MVP scope: a single issued invoice (issuedInvoice). Pohoda's exact schema is
// version-specific; validate the output against a real Pohoda import before
// relying on it in production.

import { xmlEscape, type IsdocInvoiceInput } from "@/lib/export/isdoc";

const DATA_NS = "http://www.stormware.cz/schema/version_2/data.xsd";
const INV_NS = "http://www.stormware.cz/schema/version_2/invoice.xsd";
const TYP_NS = "http://www.stormware.cz/schema/version_2/type.xsd";

// Pohoda groups VAT into three rate categories rather than explicit percentages.
type VatCategory = "high" | "low" | "none";

function vatCategory(ratePercent: string): VatCategory {
  const rate = Number(ratePercent);
  if (rate >= 21) {
    return "high";
  }
  if (rate > 0) {
    return "low";
  }
  return "none";
}

function el(name: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

function add(a: string, b: string): string {
  return (Number(a) + Number(b)).toFixed(2);
}

function partnerIdentity(customer: IsdocInvoiceInput["customer"]): string {
  const address = [
    el("typ:company", customer.name),
    el("typ:city", customer.address),
    el("typ:ico", customer.ico),
    el("typ:dic", customer.dic),
  ].join("");
  return `<inv:partnerIdentity><typ:address>${address}</typ:address></inv:partnerIdentity>`;
}

function invoiceItem(line: IsdocInvoiceInput["lines"][number]): string {
  const rate: Record<VatCategory, string> = {
    high: "high",
    low: "low",
    none: "none",
  };
  return [
    "<inv:invoiceItem>",
    el("inv:text", line.description),
    el("inv:quantity", line.quantity),
    el("inv:unit", line.unit),
    `<inv:rateVAT>${rate[vatCategory(line.vatRate)]}</inv:rateVAT>`,
    `<inv:homeCurrency>${el("typ:unitPrice", line.unitPrice)}</inv:homeCurrency>`,
    "</inv:invoiceItem>",
  ].join("");
}

function summary(input: IsdocInvoiceInput): string {
  let none = "0.00";
  let lowBase = "0.00";
  let lowVat = "0.00";
  let highBase = "0.00";
  let highVat = "0.00";
  for (const entry of input.vatRecap) {
    const category = vatCategory(entry.vatRate);
    if (category === "none") {
      none = add(none, entry.taxableAmount);
    } else if (category === "low") {
      lowBase = add(lowBase, entry.taxableAmount);
      lowVat = add(lowVat, entry.taxAmount);
    } else {
      highBase = add(highBase, entry.taxableAmount);
      highVat = add(highVat, entry.taxAmount);
    }
  }
  const home = [
    el("typ:priceNone", none),
    el("typ:priceLow", lowBase),
    el("typ:priceLowVAT", lowVat),
    el("typ:priceHigh", highBase),
    el("typ:priceHighVAT", highVat),
  ].join("");
  return [
    "<inv:invoiceSummary>",
    "<inv:roundingDocument>none</inv:roundingDocument>",
    `<inv:homeCurrency>${home}</inv:homeCurrency>`,
    "</inv:invoiceSummary>",
  ].join("");
}

export function buildPohodaXml(input: IsdocInvoiceInput): string {
  const header = [
    "<inv:invoiceHeader>",
    "<inv:invoiceType>issuedInvoice</inv:invoiceType>",
    `<inv:number><typ:numberRequested>${xmlEscape(input.number)}</typ:numberRequested></inv:number>`,
    el("inv:symVar", input.variableSymbol),
    el("inv:date", input.issueDate),
    el("inv:dateTax", input.taxDate),
    el("inv:dateDue", input.dueDate),
    el("inv:text", input.note),
    partnerIdentity(input.customer),
    "<inv:paymentType><typ:paymentType>draft</typ:paymentType></inv:paymentType>",
    "</inv:invoiceHeader>",
  ].join("");

  const detail = `<inv:invoiceDetail>${input.lines.map(invoiceItem).join("")}</inv:invoiceDetail>`;

  const supplierIco = input.supplier.ico ?? "";
  const dataPack =
    `<dat:dataPack xmlns:dat="${DATA_NS}" xmlns:inv="${INV_NS}" xmlns:typ="${TYP_NS}" ` +
    `version="2.0" id="${xmlEscape(input.number)}" ico="${xmlEscape(supplierIco)}" ` +
    `application="law-office-mvp" note="Export faktury">`;

  const body = [
    dataPack,
    `<dat:dataPackItem version="2.0" id="${xmlEscape(input.number)}">`,
    '<inv:invoice version="2.0">',
    header,
    detail,
    summary(input),
    "</inv:invoice>",
    "</dat:dataPackItem>",
    "</dat:dataPack>",
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;
}
