import assert from "node:assert/strict";
import { test } from "node:test";

import {
  feedbackLinksFor,
  splitOptionsForRecipient,
  truncateOptionText,
  workFeedbackViewValue,
  workFeedbackViewWhere,
  workLogOptionLabel,
} from "./work-feedback";

test("workFeedbackViewValue: neznámá hodnota → vše", () => {
  assert.equal(workFeedbackViewValue("received"), "received");
  assert.equal(workFeedbackViewValue("given"), "given");
  assert.equal(workFeedbackViewValue("all"), "all");
  assert.equal(workFeedbackViewValue("everything"), "all");
  assert.equal(workFeedbackViewValue(""), "all");
  assert.equal(workFeedbackViewValue(null), "all");
});

test("workFeedbackViewWhere: záložky jen zužují", () => {
  assert.deepEqual(workFeedbackViewWhere("all", "u1"), {});
  assert.deepEqual(workFeedbackViewWhere("received", "u1"), { recipientId: "u1" });
  assert.deepEqual(workFeedbackViewWhere("given", "u1"), { authorId: "u1" });
});

test("feedbackLinksFor: viditelné záznamy vedou do detailu", () => {
  const tasks = new Map([["t1", { id: "t1", label: "Odvolání" }]]);
  const workLogs = new Map([["w1", { id: "w1", label: "21. 10. 2026 · 1,5 h" }]]);
  assert.deepEqual(feedbackLinksFor({ taskId: "t1", workLogId: "w1" }, tasks, workLogs), [
    { kind: "task", href: "/tasks/t1", label: "Odvolání" },
    { kind: "workLog", href: "/work-logs/w1", label: "21. 10. 2026 · 1,5 h" },
  ]);
});

test("feedbackLinksFor: neviditelný záznam neprozradí název ani odkaz", () => {
  const links = feedbackLinksFor(
    { taskId: "secret-task", workLogId: "secret-log" },
    new Map(),
    new Map(),
  );
  assert.deepEqual(links, [
    { kind: "hidden", label: "Úkol (bez přístupu)" },
    { kind: "hidden", label: "Výkaz práce (bez přístupu)" },
  ]);
  assert.doesNotMatch(JSON.stringify(links), /secret/);
});

test("feedbackLinksFor: bez odkazů → prázdný seznam", () => {
  assert.deepEqual(feedbackLinksFor({ taskId: null, workLogId: null }, new Map(), new Map()), []);
});

test("truncateOptionText: sloučí mezery a zkrátí s výpustkou", () => {
  assert.equal(truncateOptionText("  a \n b  "), "a b");
  assert.equal(truncateOptionText(null), "");
  assert.equal(truncateOptionText("abcdefghij", 5), "abcd…");
  assert.equal(truncateOptionText("abcde", 5), "abcde");
});

test("workLogOptionLabel: datum · pracovník · hodiny · popis", () => {
  assert.equal(
    workLogOptionLabel({
      workDateLabel: "21. 10. 2026",
      hoursLabel: "1,5 h",
      userName: "Jan Novák",
      description: "Rešerše judikatury",
    }),
    "21. 10. 2026 · Jan Novák · 1,5 h · Rešerše judikatury",
  );
  assert.equal(
    workLogOptionLabel({
      workDateLabel: "1. 1. 2026",
      hoursLabel: "2 h",
      userName: null,
      description: null,
    }),
    "1. 1. 2026 · — · 2 h",
  );
});

test("splitOptionsForRecipient: záznamy příjemce napřed, pořadí zachováno", () => {
  const options = [
    { id: "a", label: "A", userIds: ["u2"] },
    { id: "b", label: "B", userIds: ["u1", "u3"] },
    { id: "c", label: "C", userIds: [] },
    { id: "d", label: "D", userIds: ["u1"] },
  ];
  const split = splitOptionsForRecipient(options, "u1");
  assert.deepEqual(split.recipient.map((o) => o.id), ["b", "d"]);
  assert.deepEqual(split.other.map((o) => o.id), ["a", "c"]);
  const none = splitOptionsForRecipient(options, "");
  assert.deepEqual(none.recipient, []);
  assert.equal(none.other.length, 4);
});
