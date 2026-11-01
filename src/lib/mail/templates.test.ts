import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMemberJoinedEmail, buildUserInvitationEmail } from "./templates";

const invitation = {
  userName: "Jana Nováková",
  email: "jana@example.local",
  organizationName: "AK Novák & partneři",
  createdByName: "Petr Admin",
  loginUrl: "https://app.example.cz/login",
  setPasswordUrl: "https://app.example.cz/set-password?token=abc_DEF-123",
  ttlHours: 72,
};

test("uvítací e-mail obsahuje kancelář, zakladatele, přihlášení a odkaz na heslo", () => {
  const mail = buildUserInvitationEmail(invitation);
  assert.equal(mail.subject, "Přístup do IURIVERSE – AK Novák & partneři");
  for (const part of [
    "Dobrý den, Jana Nováková,",
    "v kanceláři AK Novák & partneři",
    "Účet založil(a): Petr Admin",
    "Přihlašovací e-mail: jana@example.local",
    "https://app.example.cz/login",
    "https://app.example.cz/set-password?token=abc_DEF-123",
    "72 hodin",
  ]) {
    assert.ok(mail.text.includes(part), part);
  }
  assert.ok(!/heslo:\s*\S/i.test(mail.text), "e-mail nesmí obsahovat heslo");
});

test("uvítací e-mail escapuje HTML", () => {
  const mail = buildUserInvitationEmail({
    ...invitation,
    userName: '<script>alert("x")</script>',
  });
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(mail.html.includes("AK Novák &amp; partneři"));
  assert.ok(mail.html.includes('href="https://app.example.cz/set-password?token=abc_DEF-123"'));
});

test("upozornění na nového člena", () => {
  const mail = buildMemberJoinedEmail({
    memberName: "Karel",
    memberEmail: "karel@example.local",
    organizationName: "AK Test",
    joinCodeLabel: "Onboarding",
    roleLabel: "Advokát",
    settingsUrl: "https://app.example.cz/settings/organization",
  });
  assert.equal(mail.subject, "Nový člen kanceláře AK Test");
  assert.ok(mail.text.includes("Karel (karel@example.local)"));
  assert.ok(mail.text.includes("registračního kódu „Onboarding“"));
  assert.ok(mail.text.includes("Výchozí role: Advokát"));
  assert.ok(mail.text.includes("https://app.example.cz/settings/organization"));

  const noLabel = buildMemberJoinedEmail({
    memberName: "Karel",
    memberEmail: "karel@example.local",
    organizationName: "AK Test",
    joinCodeLabel: null,
    roleLabel: "Advokát",
    settingsUrl: "x",
  });
  assert.ok(noLabel.text.includes("registračního kódu. "));
});
