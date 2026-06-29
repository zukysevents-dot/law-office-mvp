import assert from "node:assert/strict";
import { test } from "node:test";

import { type IsdocInvoiceInput } from "./isdoc";
import { buildPohodaXml } from "./pohoda";

function input(overrides: Partial<IsdocInvoiceInput> = {}): IsdocInvoiceInput {
  return {
    uuid: "00000000-0000-0000-0000-000000000000",
    number: "20260001",
    variableSymbol: "20260001",
    issueDate: "2026-01-15",
    taxDate: "2026-01-15",
    dueDate: "2026-01-29",
    currency: "CZK",
    vatApplicable: true,
    note: null,
    supplier: {
      name: "Advokátní kancelář s.r.o.",
      ico: "12345678",
      dic: "CZ12345678",
      address: "Praha 1",
      bankAccount: "123456789/0100",
      iban: "CZ6508000000192000145399",
    },
    customer: {
      name: "Klient a.s.",
      ico: "87654321",
      dic: "CZ87654321",
      address: "Brno",
    },
    lines: [
      {
        id: "1",
        description: "Právní služby",
        quantity: "2.00",
        unit: "h",
        unitPrice: "1000.00",
        vatRate: "21.00",
        lineBase: "2000.00",
        lineVat: "420.00",
        lineTotal: "2420.00",
      },
    ],
    vatRecap: [
      {
        vatRate: "21.00",
        taxableAmount: "2000.00",
        taxAmount: "420.00",
        taxInclusiveAmount: "2420.00",
      },
    ],
    taxExclusiveTotal: "2000.00",
    taxTotal: "420.00",
    taxInclusiveTotal: "2420.00",
    payableAmount: "2420.00",
    ...overrides,
  };
}

test("buildPohodaXml: XML declaration + dataPack with Stormware namespaces", () => {
  const xml = buildPohodaXml(input());
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<dat:dataPack[^>]*xmlns:dat="http:\/\/www\.stormware\.cz/);
  assert.match(xml, /xmlns:inv="http:\/\/www\.stormware\.cz/);
  assert.match(xml, /xmlns:typ="http:\/\/www\.stormware\.cz/);
  assert.match(xml, /version="2\.0"/);
});

test("buildPohodaXml: header carries type, number, variable symbol, dates", () => {
  const xml = buildPohodaXml(input());
  assert.match(xml, /<inv:invoiceType>issuedInvoice<\/inv:invoiceType>/);
  assert.match(xml, /<typ:numberRequested>20260001<\/typ:numberRequested>/);
  assert.match(xml, /<inv:symVar>20260001<\/inv:symVar>/);
  assert.match(xml, /<inv:date>2026-01-15<\/inv:date>/);
  assert.match(xml, /<inv:dateDue>2026-01-29<\/inv:dateDue>/);
});

test("buildPohodaXml: partner identity carries customer name, ico, dic", () => {
  const xml = buildPohodaXml(input());
  assert.match(xml, /<typ:company>Klient a\.s\.<\/typ:company>/);
  assert.match(xml, /<typ:ico>87654321<\/typ:ico>/);
  assert.match(xml, /<typ:dic>CZ87654321<\/typ:dic>/);
});

test("buildPohodaXml: line maps to invoiceItem with rateVAT high for 21%", () => {
  const xml = buildPohodaXml(input());
  assert.match(xml, /<inv:text>Právní služby<\/inv:text>/);
  assert.match(xml, /<inv:rateVAT>high<\/inv:rateVAT>/);
  assert.match(xml, /<typ:unitPrice>1000\.00<\/typ:unitPrice>/);
});

test("buildPohodaXml: VAT categories — 21% high, 12% low, 0% none", () => {
  const xml = buildPohodaXml(
    input({
      vatApplicable: true,
      lines: [
        {
          id: "1",
          description: "Vysoká",
          quantity: "1",
          unit: "ks",
          unitPrice: "100.00",
          vatRate: "21.00",
          lineBase: "100.00",
          lineVat: "21.00",
          lineTotal: "121.00",
        },
        {
          id: "2",
          description: "Snížená",
          quantity: "1",
          unit: "ks",
          unitPrice: "100.00",
          vatRate: "12.00",
          lineBase: "100.00",
          lineVat: "12.00",
          lineTotal: "112.00",
        },
        {
          id: "3",
          description: "Nulová",
          quantity: "1",
          unit: "ks",
          unitPrice: "100.00",
          vatRate: "0.00",
          lineBase: "100.00",
          lineVat: "0.00",
          lineTotal: "100.00",
        },
      ],
      vatRecap: [
        { vatRate: "21.00", taxableAmount: "100.00", taxAmount: "21.00", taxInclusiveAmount: "121.00" },
        { vatRate: "12.00", taxableAmount: "100.00", taxAmount: "12.00", taxInclusiveAmount: "112.00" },
        { vatRate: "0.00", taxableAmount: "100.00", taxAmount: "0.00", taxInclusiveAmount: "100.00" },
      ],
    }),
  );
  assert.match(xml, /<inv:rateVAT>high<\/inv:rateVAT>/);
  assert.match(xml, /<inv:rateVAT>low<\/inv:rateVAT>/);
  assert.match(xml, /<inv:rateVAT>none<\/inv:rateVAT>/);
  // Summary aggregates per category.
  assert.match(xml, /<typ:priceHigh>100\.00<\/typ:priceHigh>/);
  assert.match(xml, /<typ:priceHighVAT>21\.00<\/typ:priceHighVAT>/);
  assert.match(xml, /<typ:priceLow>100\.00<\/typ:priceLow>/);
  assert.match(xml, /<typ:priceLowVAT>12\.00<\/typ:priceLowVAT>/);
  assert.match(xml, /<typ:priceNone>100\.00<\/typ:priceNone>/);
});

test("buildPohodaXml: summary sums multiple lines of the same rate", () => {
  const xml = buildPohodaXml(
    input({
      vatRecap: [
        { vatRate: "21.00", taxableAmount: "2000.00", taxAmount: "420.00", taxInclusiveAmount: "2420.00" },
        { vatRate: "21.00", taxableAmount: "1000.00", taxAmount: "210.00", taxInclusiveAmount: "1210.00" },
      ],
    }),
  );
  assert.match(xml, /<typ:priceHigh>3000\.00<\/typ:priceHigh>/);
  assert.match(xml, /<typ:priceHighVAT>630\.00<\/typ:priceHighVAT>/);
});

test("buildPohodaXml: escapes special characters in text", () => {
  const xml = buildPohodaXml(
    input({
      lines: [
        {
          id: "1",
          description: 'Služby <A & B> "x"',
          quantity: "1",
          unit: "ks",
          unitPrice: "100.00",
          vatRate: "21.00",
          lineBase: "100.00",
          lineVat: "21.00",
          lineTotal: "121.00",
        },
      ],
    }),
  );
  assert.match(xml, /Služby &lt;A &amp; B&gt; &quot;x&quot;/);
  assert.doesNotMatch(xml, /<A & B>/);
});
