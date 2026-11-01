import assert from "node:assert/strict";
import { test } from "node:test";

import { invitationResultMessage } from "./user-invitation-messages";

const user = { name: "Jana", email: "jana@example.local" };

test("založení uživatele: odesláno", () => {
  const result = invitationResultMessage(
    { status: "SENT", expiresAt: new Date() },
    user,
    "create",
  );
  assert.equal(result.tone, "success");
  assert.match(result.message, /Uživatel Jana byl vytvořen\. Na jana@example\.local jsme poslali uvítací e-mail/);
});

test("založení uživatele: SMTP nenastavené – důvod a předání osobně", () => {
  const result = invitationResultMessage(
    { status: "DISABLED", reason: "SMTP_HOST_NOT_CONFIGURED" },
    user,
    "create",
  );
  assert.equal(result.tone, "warning");
  assert.match(result.message, /uvítací e-mail se neodeslal: chybí adresa SMTP serveru \(SMTP_HOST\)/);
  assert.match(result.message, /osobně/);
});

test("založení uživatele: chyba SMTP a neaktivní uživatel", () => {
  assert.match(
    invitationResultMessage({ status: "FAILED", error: "x" }, user, "create").message,
    /nepodařilo odeslat \(chyba SMTP serveru\).*Znovu poslat pozvánku/,
  );
  assert.match(
    invitationResultMessage({ status: "INACTIVE" }, user, "create").message,
    /vytvořen jako neaktivní – pozvánka se neposílá/,
  );
});

test("opětovné odeslání: všechny stavy", () => {
  assert.equal(
    invitationResultMessage({ status: "SENT", expiresAt: new Date() }, user, "resend").tone,
    "success",
  );
  assert.match(
    invitationResultMessage(
      { status: "DISABLED", reason: "EMAIL_NOTIFICATIONS_DISABLED" },
      user,
      "resend",
    ).message,
    /Pozvánka se neodeslala: odesílání e-mailů je na serveru vypnuté/,
  );
  assert.equal(
    invitationResultMessage({ status: "DEDUPED" }, user, "resend").message,
    "Pozvánka byla právě odeslána. Zkuste to znovu za minutu.",
  );
  assert.equal(
    invitationResultMessage({ status: "NOT_FOUND" }, user, "resend").tone,
    "error",
  );
  assert.match(
    invitationResultMessage({ status: "FAILED", error: "x" }, user, "resend").message,
    /chyba SMTP serveru/,
  );
  assert.match(
    invitationResultMessage({ status: "INACTIVE" }, user, "resend").message,
    /neaktivní/,
  );
});
