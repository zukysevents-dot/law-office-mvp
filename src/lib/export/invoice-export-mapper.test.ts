import assert from "node:assert/strict";
import { test } from "node:test";

import {
  IsdocExportError,
  mapInvoiceToIsdocInput,
  type InvoiceExportLine,
  type InvoiceExportRecord,
} from "./invoice-export-mapper";

// Builders -------------------------------------------------------------------

function line(
  overrides: Partial<InvoiceExportLine> = {},
): InvoiceExportLine {
  return {
    description: "Právní služby",
    quantity: 1,
    unit: "ks",
    unitPriceCzk: 10000,
    vatRate: 21,
    lineBaseCzk: 10000,
    lineVatCzk: 2100,
    amountCzk: 12100,
    position: 1,
    ...overrides,
  };
}

function record(
  overrides: Partial<InvoiceExportRecord> = {},
): InvoiceExportRecord {
  return {
    id: "inv-1",
    number: "2026001",
    variableSymbol: "2026001",
    status: "ISSUED",
    vatMode: "PAYER",
    currency: "CZK",
    note: null,
    issueDate: new Date("2026-01-15T00:00:00.000Z"),
    taxDate: new Date("2026-01-15T00:00:00.000Z"),
    dueDate: new Date("2026-01-29T00:00:00.000Z"),
    subtotalCzk: 10000,
    vatCzk: 2100,
    totalCzk: 12100,
    supplierSnapshot: {
      legalName: "Advokátní kancelář s.r.o.",
      ico: "12345678",
      dic: "CZ12345678",
      address: "Hlavní 1, Praha",
      bankAccount: "123456789/0100",
      iban: "CZ6508000000192000145399",
    },
    customerSnapshot: {
      name: "Klient a.s.",
      ico: "87654321",
      dic: "CZ87654321",
      address: "Vedlejší 2, Brno",
    },
    lines: [line()],
    ...overrides,
  };
}

// --- happy path --------------------------------------------------------------

test("mapInvoiceToIsdocInput: valid issued PAYER invoice maps to DTO", () => {
  const dto = mapInvoiceToIsdocInput(record());
  assert.equal(dto.number, "2026001");
  assert.equal(dto.vatApplicable, true);
  assert.equal(dto.supplier.name, "Advokátní kancelář s.r.o.");
  assert.equal(dto.supplier.dic, "CZ12345678");
  assert.equal(dto.customer.name, "Klient a.s.");
  assert.equal(dto.lines.length, 1);
});

test("mapInvoiceToIsdocInput: amounts formatted as 0.00 with a dot", () => {
  const dto = mapInvoiceToIsdocInput(
    record({
      subtotalCzk: "10000",
      vatCzk: 2100,
      totalCzk: 12100.5,
      lines: [line({ unitPriceCzk: "10000", amountCzk: 12100 })],
    }),
  );
  assert.equal(dto.taxExclusiveTotal, "10000.00");
  assert.equal(dto.taxTotal, "2100.00");
  assert.equal(dto.taxInclusiveTotal, "12100.50");
  assert.equal(dto.payableAmount, "12100.50");
  assert.equal(dto.lines[0].unitPrice, "10000.00");
  // No comma decimal separator anywhere in money fields.
  assert.ok(!dto.taxExclusiveTotal.includes(","));
});

test("mapInvoiceToIsdocInput: dates formatted as YYYY-MM-DD", () => {
  const dto = mapInvoiceToIsdocInput(record());
  assert.equal(dto.issueDate, "2026-01-15");
  assert.equal(dto.taxDate, "2026-01-15");
  assert.equal(dto.dueDate, "2026-01-29");
});

// --- domain errors -----------------------------------------------------------

test("mapInvoiceToIsdocInput: DRAFT status throws IsdocExportError", () => {
  assert.throws(
    () => mapInvoiceToIsdocInput(record({ status: "DRAFT" })),
    (err: unknown) => err instanceof IsdocExportError,
  );
});

test("mapInvoiceToIsdocInput: CANCELLED status throws IsdocExportError", () => {
  assert.throws(
    () => mapInvoiceToIsdocInput(record({ status: "CANCELLED" })),
    (err: unknown) => err instanceof IsdocExportError,
  );
});

test("mapInvoiceToIsdocInput: missing number throws IsdocExportError", () => {
  assert.throws(
    () => mapInvoiceToIsdocInput(record({ number: null })),
    (err: unknown) => err instanceof IsdocExportError,
  );
});

test("mapInvoiceToIsdocInput: missing supplierSnapshot throws IsdocExportError", () => {
  assert.throws(
    () => mapInvoiceToIsdocInput(record({ supplierSnapshot: null })),
    (err: unknown) => err instanceof IsdocExportError,
  );
});

test("mapInvoiceToIsdocInput: missing customerSnapshot throws IsdocExportError", () => {
  assert.throws(
    () => mapInvoiceToIsdocInput(record({ customerSnapshot: null })),
    (err: unknown) => err instanceof IsdocExportError,
  );
});

test("mapInvoiceToIsdocInput: PAYER without supplier DIČ throws IsdocExportError", () => {
  assert.throws(
    () =>
      mapInvoiceToIsdocInput(
        record({
          vatMode: "PAYER",
          supplierSnapshot: {
            legalName: "Advokát",
            ico: "12345678",
            dic: null,
            address: "Adresa",
          },
        }),
      ),
    (err: unknown) => err instanceof IsdocExportError,
  );
});

test("mapInvoiceToIsdocInput: empty lines throws IsdocExportError", () => {
  assert.throws(
    () => mapInvoiceToIsdocInput(record({ lines: [] })),
    (err: unknown) => err instanceof IsdocExportError,
  );
});

// --- NON_PAYER ---------------------------------------------------------------

test("mapInvoiceToIsdocInput: NON_PAYER yields vatApplicable=false and needs no DIČ", () => {
  const dto = mapInvoiceToIsdocInput(
    record({
      vatMode: "NON_PAYER",
      vatCzk: 0,
      totalCzk: 10000,
      supplierSnapshot: {
        legalName: "Advokát bez DPH",
        ico: "12345678",
        dic: null,
        address: "Adresa",
      },
      lines: [
        line({ vatRate: 0, lineVatCzk: 0, amountCzk: 10000 }),
      ],
    }),
  );
  assert.equal(dto.vatApplicable, false);
  assert.equal(dto.supplier.dic, null);
});

// --- VAT recapitulation ------------------------------------------------------

test("mapInvoiceToIsdocInput: two rates produce two recap entries reconciling to totals", () => {
  const dto = mapInvoiceToIsdocInput(
    record({
      subtotalCzk: 11000,
      vatCzk: 2220,
      totalCzk: 13220,
      lines: [
        line({
          vatRate: 21,
          lineBaseCzk: 10000,
          lineVatCzk: 2100,
          amountCzk: 12100,
          position: 1,
        }),
        line({
          description: "Snížená sazba",
          vatRate: 12,
          unitPriceCzk: 1000,
          lineBaseCzk: 1000,
          lineVatCzk: 120,
          amountCzk: 1120,
          position: 2,
        }),
      ],
    }),
  );
  assert.equal(dto.vatRecap.length, 2);
  const sumTaxable = dto.vatRecap.reduce(
    (acc, e) => acc + Number(e.taxableAmount),
    0,
  );
  const sumTax = dto.vatRecap.reduce(
    (acc, e) => acc + Number(e.taxAmount),
    0,
  );
  // Mapper only sums frozen values → must reconcile exactly with header totals.
  assert.equal(sumTaxable, Number(dto.taxExclusiveTotal));
  assert.equal(sumTax, Number(dto.taxTotal));
  assert.equal(sumTaxable, 11000);
  assert.equal(sumTax, 2220);
});

test("mapInvoiceToIsdocInput: same rate on multiple lines collapses to one recap entry", () => {
  const dto = mapInvoiceToIsdocInput(
    record({
      subtotalCzk: 20000,
      vatCzk: 4200,
      totalCzk: 24200,
      lines: [
        line({ position: 1 }),
        line({ position: 2 }),
      ],
    }),
  );
  assert.equal(dto.vatRecap.length, 1);
  assert.equal(dto.vatRecap[0].taxableAmount, "20000.00");
  assert.equal(dto.vatRecap[0].taxAmount, "4200.00");
});

// --- timezone-safe date ------------------------------------------------------

test("mapInvoiceToIsdocInput: midnight-UTC date does not shift to previous day", () => {
  const dto = mapInvoiceToIsdocInput(
    record({
      issueDate: new Date("2026-01-31T00:00:00.000Z"),
      taxDate: null,
      dueDate: null,
    }),
  );
  assert.equal(dto.issueDate, "2026-01-31");
  assert.equal(dto.taxDate, null);
  assert.equal(dto.dueDate, null);
});

// --- customer without ico/dic ------------------------------------------------

test("mapInvoiceToIsdocInput: customer without ico/dic keeps them null in DTO", () => {
  const dto = mapInvoiceToIsdocInput(
    record({
      customerSnapshot: {
        name: "Soukromá osoba",
        ico: null,
        dic: null,
        address: "Adresa 3",
      },
    }),
  );
  assert.equal(dto.customer.ico, null);
  assert.equal(dto.customer.dic, null);
  assert.equal(dto.customer.name, "Soukromá osoba");
});
