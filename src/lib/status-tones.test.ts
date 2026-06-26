import assert from "node:assert/strict";
import { test } from "node:test";

import { DeadlineStatus, DeadlineType } from "@/generated/prisma/enums";

import { deadlineStatusTone, deadlineTypeTone } from "./status-tones";

// --- deadlineTypeTone: F4 deadline category → badge colour ------------------
// PROCEDURAL deadlines (lhůty procesní) are the highest-liability kind, hence
// red; COURT (soudní jednání) purple; INTERNAL (interní) the calm mint.
test("deadlineTypeTone: PROCEDURAL → red, COURT → purple, INTERNAL → mint", () => {
  assert.equal(deadlineTypeTone(DeadlineType.PROCEDURAL), "red");
  assert.equal(deadlineTypeTone(DeadlineType.COURT), "purple");
  assert.equal(deadlineTypeTone(DeadlineType.INTERNAL), "mint");
});

test("deadlineTypeTone: every DeadlineType value maps to a tone (exhaustive)", () => {
  // Guards against a new enum member being added without a tone mapping,
  // which would surface as `undefined` on a badge in the UI.
  for (const type of Object.values(DeadlineType)) {
    assert.notEqual(deadlineTypeTone(type), undefined, `missing tone for ${type}`);
  }
});

// --- deadlineStatusTone: F4 deadline lifecycle → badge colour ---------------
test("deadlineStatusTone: OPEN → blue, COMPLETED → green, CANCELLED → neutral", () => {
  assert.equal(deadlineStatusTone(DeadlineStatus.OPEN), "blue");
  assert.equal(deadlineStatusTone(DeadlineStatus.COMPLETED), "green");
  assert.equal(deadlineStatusTone(DeadlineStatus.CANCELLED), "neutral");
});

test("deadlineStatusTone: every DeadlineStatus value maps to a tone (exhaustive)", () => {
  for (const status of Object.values(DeadlineStatus)) {
    assert.notEqual(
      deadlineStatusTone(status),
      undefined,
      `missing tone for ${status}`,
    );
  }
});
