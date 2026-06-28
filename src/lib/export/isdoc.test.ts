import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ISDOC_NAMESPACE,
  ISDOC_VERSION,
  buildIsdocXml,
  deterministicUuid,
  xmlEscape,
  type IsdocInvoiceInput,
} from "./isdoc";

// --- xmlEscape ---------------------------------------------------------------

test("xmlEscape: & becomes &amp; and is not double-escaped", () => {
  assert.equal(xmlEscape("a & b"), "a &amp; b");
  // The entities introduced for <, >, " and ' must not get their & re-escaped.
  assert.equal(xmlEscape("<"), "&lt;");
  assert.equal(xmlEscape('"'), "&quot;");
  // A pre-existing "&amp;" in the input is treated as literal text → its & escaped.
  assert.equal(xmlEscape("&amp;"), "&amp;amp;");
});

test("xmlEscape: escapes each special character", () => {
  assert.equal(xmlEscape("<"), "&lt;");
  assert.equal(xmlEscape(">"), "&gt;");
  assert.equal(xmlEscape('"'), "&quot;");
  assert.equal(xmlEscape("'"), "&apos;");
});

test("xmlEscape: escapes a combination of characters", () => {
  assert.equal(
    xmlEscape(`<a href="x">Tom & Jerry's</a>`),
    "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;",
  );
});

test("xmlEscape: strips XML-forbidden control characters", () => {
  // NUL and a vertical-tab / form-feed style control char must be removed.
  assert.equal(xmlEscape("a\x00b"), "ab");
  assert.equal(xmlEscape("a\x0Bb\x0Cc"), "abc");
  assert.equal(xmlEscape("\x01\x08\x1F"), "");
});

test("xmlEscape: keeps the legal whitespace TAB and LF", () => {
  assert.equal(xmlEscape("a\tb"), "a\tb");
  assert.equal(xmlEscape("a\nb"), "a\nb");
});

// --- deterministicUuid -------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("deterministicUuid: same seed yields identical output", () => {
  assert.equal(deterministicUuid("invoice-1"), deterministicUuid("invoice-1"));
});

test("deterministicUuid: different seeds yield different output", () => {
  assert.notEqual(
    deterministicUuid("invoice-1"),
    deterministicUuid("invoice-2"),
  );
});

test("deterministicUuid: matches 8-4-4-4-12 UUID format", () => {
  assert.match(deterministicUuid("invoice-1"), UUID_RE);
  assert.match(deterministicUuid(""), UUID_RE);
  assert.match(deterministicUuid("any-other-seed"), UUID_RE);
});

// --- buildIsdocXml -----------------------------------------------------------

function baseInput(
  overrides: Partial<IsdocInvoiceInput> = {},
): IsdocInvoiceInput {
  return {
    uuid: "11111111-1111-1111-1111-111111111111",
    number: "2026001",
    variableSymbol: "2026001",
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
      address: "Hlavní 1, Praha",
      bankAccount: "123456789/0100",
      iban: "CZ6508000000192000145399",
    },
    customer: {
      name: "Klient a.s.",
      ico: "87654321",
      dic: "CZ87654321",
      address: "Vedlejší 2, Brno",
    },
    lines: [
      {
        id: "1",
        description: "Právní služby",
        quantity: "1.00",
        unit: "ks",
        unitPrice: "10000.00",
        vatRate: "21.00",
        lineBase: "10000.00",
        lineVat: "2100.00",
        lineTotal: "12100.00",
      },
    ],
    vatRecap: [
      {
        vatRate: "21.00",
        taxableAmount: "10000.00",
        taxAmount: "2100.00",
        taxInclusiveAmount: "12100.00",
      },
    ],
    taxExclusiveTotal: "10000.00",
    taxTotal: "2100.00",
    taxInclusiveTotal: "12100.00",
    payableAmount: "12100.00",
    ...overrides,
  };
}

test("buildIsdocXml: starts with the XML declaration", () => {
  const xml = buildIsdocXml(baseInput());
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
});

test("buildIsdocXml: Invoice root carries namespace and version 6.0.1", () => {
  const xml = buildIsdocXml(baseInput());
  assert.ok(xml.includes(`<Invoice xmlns="${ISDOC_NAMESPACE}"`));
  assert.ok(xml.includes(`version="${ISDOC_VERSION}"`));
  assert.ok(xml.includes('version="6.0.1"'));
});

test("buildIsdocXml: contains all mandatory elements", () => {
  const xml = buildIsdocXml(baseInput());
  assert.ok(xml.includes("<DocumentType>1</DocumentType>"));
  assert.ok(xml.includes("<ID>2026001</ID>"));
  assert.ok(xml.includes("<IssueDate>2026-01-15</IssueDate>"));
  assert.ok(xml.includes("<AccountingSupplierParty>"));
  assert.ok(xml.includes("<AccountingCustomerParty>"));
  assert.ok(xml.includes("<InvoiceLine>"));
  assert.ok(xml.includes("<LegalMonetaryTotal>"));
  assert.ok(xml.includes("<PayableAmount>12100.00</PayableAmount>"));
  // Supplier + customer name elements are present.
  assert.ok(xml.includes("<Name>Advokátní kancelář s.r.o.</Name>"));
  assert.ok(xml.includes("<Name>Klient a.s.</Name>"));
});

test("buildIsdocXml: VATApplicable true for a VAT payer", () => {
  const xml = buildIsdocXml(baseInput({ vatApplicable: true }));
  assert.ok(xml.includes("<VATApplicable>true</VATApplicable>"));
});

test("buildIsdocXml: VATApplicable false for a non-payer", () => {
  const xml = buildIsdocXml(baseInput({ vatApplicable: false }));
  assert.ok(xml.includes("<VATApplicable>false</VATApplicable>"));
  // A non-payer must not emit a *supplier* VAT scheme block (the customer
  // scheme is independent of the issuer's payer status).
  const supplierBlock = xml.slice(
    xml.indexOf("<AccountingSupplierParty>"),
    xml.indexOf("</AccountingSupplierParty>"),
  );
  assert.ok(!supplierBlock.includes("<PartyTaxScheme>"));
});

test("buildIsdocXml: multiple vatRecap entries → multiple TaxSubTotal", () => {
  const xml = buildIsdocXml(
    baseInput({
      vatRecap: [
        {
          vatRate: "21.00",
          taxableAmount: "10000.00",
          taxAmount: "2100.00",
          taxInclusiveAmount: "12100.00",
        },
        {
          vatRate: "12.00",
          taxableAmount: "1000.00",
          taxAmount: "120.00",
          taxInclusiveAmount: "1120.00",
        },
      ],
    }),
  );
  const occurrences = xml.split("<TaxSubTotal>").length - 1;
  assert.equal(occurrences, 2);
});

test("buildIsdocXml: customer without ico/dic omits those elements (not empty)", () => {
  const xml = buildIsdocXml(
    baseInput({
      customer: {
        name: "Soukromá osoba",
        ico: null,
        dic: null,
        address: "Adresa 3",
      },
    }),
  );
  // The customer party must not contain identification or tax-scheme blocks.
  const customerBlock = xml.slice(
    xml.indexOf("<AccountingCustomerParty>"),
    xml.indexOf("</AccountingCustomerParty>"),
  );
  assert.ok(!customerBlock.includes("<PartyIdentification>"));
  assert.ok(!customerBlock.includes("<PartyTaxScheme>"));
  // And certainly no empty placeholders for them.
  assert.ok(!customerBlock.includes("<ID></ID>"));
  assert.ok(!customerBlock.includes("<CompanyID></CompanyID>"));
});

test("buildIsdocXml: escapes user-controlled text in description and name", () => {
  const xml = buildIsdocXml(
    baseInput({
      customer: {
        name: "Tom & Jerry <s.r.o.>",
        ico: null,
        dic: null,
        address: null,
      },
      lines: [
        {
          id: "1",
          description: 'Konzultace "AT&T" <urgent>',
          quantity: "1.00",
          unit: "ks",
          unitPrice: "1000.00",
          vatRate: "21.00",
          lineBase: "1000.00",
          lineVat: "210.00",
          lineTotal: "1210.00",
        },
      ],
    }),
  );
  assert.ok(xml.includes("<Name>Tom &amp; Jerry &lt;s.r.o.&gt;</Name>"));
  assert.ok(
    xml.includes(
      "<Description>Konzultace &quot;AT&amp;T&quot; &lt;urgent&gt;</Description>",
    ),
  );
  // No raw, unescaped ampersand from user text leaks into the document.
  assert.ok(!xml.includes("AT&T"));
});

test("buildIsdocXml: no PaymentMeans when dueDate and bank details are absent", () => {
  const xml = buildIsdocXml(
    baseInput({
      dueDate: null,
      variableSymbol: null,
      supplier: {
        name: "Advokát",
        ico: "12345678",
        dic: "CZ12345678",
        address: null,
        bankAccount: null,
        iban: null,
      },
    }),
  );
  assert.ok(!xml.includes("<PaymentMeans>"));
});

test("buildIsdocXml: emits PaymentMeans when at least a dueDate exists", () => {
  const xml = buildIsdocXml(
    baseInput({
      variableSymbol: null,
      supplier: {
        name: "Advokát",
        ico: "12345678",
        dic: "CZ12345678",
        address: null,
        bankAccount: null,
        iban: null,
      },
    }),
  );
  assert.ok(xml.includes("<PaymentMeans>"));
  assert.ok(xml.includes("<PaymentDueDate>2026-01-29</PaymentDueDate>"));
});
