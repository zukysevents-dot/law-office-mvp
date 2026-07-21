import assert from "node:assert/strict";
import { test } from "node:test";

import { czAccountToIban, spdPaymentString } from "./payment-qr";

test("czAccountToIban builds a valid IBAN with prefix", () => {
  // Canonical example: 19-2000145399/0800 → CZ6508000000192000145399.
  assert.equal(czAccountToIban("19-2000145399/0800"), "CZ6508000000192000145399");
});

test("czAccountToIban handles a plain number without prefix", () => {
  const iban = czAccountToIban("2000145399/0800");
  assert.ok(iban && iban.startsWith("CZ") && iban.length === 24);
});

test("czAccountToIban rejects malformed input", () => {
  assert.equal(czAccountToIban(""), null);
  assert.equal(czAccountToIban(null), null);
  assert.equal(czAccountToIban("not-an-account"), null);
  assert.equal(czAccountToIban("123456"), null); // no bank code
});

test("spdPaymentString formats amount and fields", () => {
  const s = spdPaymentString({
    iban: "CZ6508000000192000145399",
    amount: 1210,
    variableSymbol: "20260001",
    message: "Faktura 2026-0001",
  });
  assert.equal(
    s,
    "SPD*1.0*ACC:CZ6508000000192000145399*AM:1210.00*CC:CZK*X-VS:20260001*MSG:Faktura 2026-0001",
  );
});

test("spdPaymentString strips the * delimiter from message", () => {
  const s = spdPaymentString({
    iban: "CZ6508000000192000145399",
    amount: 5,
    message: "a*b",
  });
  assert.ok(s.includes("MSG:a b"));
});
