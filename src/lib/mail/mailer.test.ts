import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appUrl,
  emailHtml,
  mailConfigStatus,
  mailDisabledReasonLabel,
  sendMail,
  SMTP_TIMEOUTS,
} from "./mailer";

const configured = {
  EMAIL_NOTIFICATIONS_ENABLED: "true",
  SMTP_HOST: "smtp.example.local",
  SMTP_FROM: "IURIVERSE <no-reply@example.local>",
};

test("mailConfigStatus: vypnuté odesílání, chybějící host i odesílatel", () => {
  assert.deepEqual(mailConfigStatus({}), {
    enabled: false,
    reason: "EMAIL_NOTIFICATIONS_DISABLED",
  });
  assert.deepEqual(
    mailConfigStatus({ ...configured, EMAIL_NOTIFICATIONS_ENABLED: "false" }),
    { enabled: false, reason: "EMAIL_NOTIFICATIONS_DISABLED" },
  );
  assert.deepEqual(mailConfigStatus({ ...configured, SMTP_HOST: "  " }), {
    enabled: false,
    reason: "SMTP_HOST_NOT_CONFIGURED",
  });
  assert.deepEqual(mailConfigStatus({ ...configured, SMTP_FROM: "" }), {
    enabled: false,
    reason: "SMTP_FROM_NOT_CONFIGURED",
  });
  assert.deepEqual(mailConfigStatus({ ...configured, EMAIL_NOTIFICATIONS_ENABLED: " TRUE " }), {
    enabled: true,
  });
});

test("mailDisabledReasonLabel: česky a s názvem proměnné", () => {
  assert.match(
    mailDisabledReasonLabel("EMAIL_NOTIFICATIONS_DISABLED"),
    /vypnuté.*EMAIL_NOTIFICATIONS_ENABLED/,
  );
  assert.match(mailDisabledReasonLabel("SMTP_HOST_NOT_CONFIGURED"), /SMTP_HOST/);
  assert.match(mailDisabledReasonLabel("SMTP_FROM_NOT_CONFIGURED"), /SMTP_FROM/);
});

test("sendMail: bez konfigurace vrátí DISABLED a nic neodešle", async () => {
  let calls = 0;
  const result = await sendMail(
    { to: "a@example.local", subject: "S", text: "T" },
    {
      env: {},
      transport: {
        sendMail: async () => {
          calls += 1;
          return {} as never;
        },
      },
    },
  );
  assert.deepEqual(result, {
    status: "DISABLED",
    reason: "EMAIL_NOTIFICATIONS_DISABLED",
  });
  assert.equal(calls, 0);
});

test("sendMail: odešle přes transport a doplní odesílatele i HTML", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const result = await sendMail(
    { to: "a@example.local", subject: "Předmět", text: "Řádek 1\n<b>2</b>" },
    {
      env: configured,
      transport: {
        sendMail: async (message: Record<string, unknown>) => {
          sent.push(message);
          return {} as never;
        },
      },
    },
  );
  assert.deepEqual(result, { status: "SENT" });
  assert.equal(sent[0].from, configured.SMTP_FROM);
  assert.equal(sent[0].to, "a@example.local");
  assert.equal(sent[0].html, "Řádek 1<br />&lt;b&gt;2&lt;/b&gt;");
});

test("sendMail: chyba SMTP nevyhodí výjimku, vrátí FAILED se zkrácenou chybou", async () => {
  const result = await sendMail(
    { to: "a@example.local", subject: "S", text: "T" },
    {
      env: configured,
      transport: {
        sendMail: async () => {
          throw new Error("x".repeat(500));
        },
      },
    },
  );
  assert.equal(result.status, "FAILED");
  assert.ok(result.status === "FAILED" && result.error.length <= 201);
});

test("SMTP má nastavené timeouty, aby mrtvý server nezamrazil akci", () => {
  assert.ok(SMTP_TIMEOUTS.connectionTimeout <= 10_000);
  assert.ok(SMTP_TIMEOUTS.greetingTimeout <= 10_000);
  assert.ok(SMTP_TIMEOUTS.socketTimeout <= 20_000);
});

test("appUrl a emailHtml", () => {
  assert.equal(
    appUrl("/login", { APP_BASE_URL: "https://app.example.cz/" }),
    "https://app.example.cz/login",
  );
  assert.equal(appUrl("login", {}), "http://127.0.0.1:3001/login");
  assert.equal(emailHtml('a & "b"\nc'), "a &amp; &quot;b&quot;<br />c");
});
