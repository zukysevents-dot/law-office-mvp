import assert from "node:assert/strict";
import { test } from "node:test";

import { UserRole } from "@/generated/prisma/enums";

import {
  assertCanEditAuthoredEntry,
  canEditAuthoredEntry,
  canViewAllWorkFeedback,
  caseVisibilityWhere,
  matterCommentVisibilityWhere,
  projectVisibilityWhere,
  workFeedbackVisibilityWhere,
} from "./permissions";

// Komentáře u projektů/případů a zpětná vazba (Práce → Zpětná vazba).
const org = "org-1";
const admin = { id: "u-admin", role: UserRole.ADMIN, organizationId: org };
const partner = { id: "u-partner", role: UserRole.PARTNER, organizationId: org };
const lawyer = { id: "u-lawyer", role: UserRole.LAWYER, organizationId: org };
const trainee = { id: "u-trainee", role: UserRole.TRAINEE, organizationId: org };
const intern = { id: "u-intern", role: UserRole.INTERN, organizationId: org };

const DENY = { id: "__role_denied__" };

test("workFeedbackVisibilityWhere: ADMIN a PARTNER vidí celou kancelář", () => {
  assert.deepEqual(workFeedbackVisibilityWhere(admin), { organizationId: org });
  assert.deepEqual(workFeedbackVisibilityWhere(partner), { organizationId: org });
  assert.equal(canViewAllWorkFeedback(admin), true);
  assert.equal(canViewAllWorkFeedback(partner), true);
});

test("workFeedbackVisibilityWhere: ostatní jen jako autor nebo příjemce", () => {
  for (const user of [lawyer, trainee, intern]) {
    assert.deepEqual(workFeedbackVisibilityWhere(user), {
      AND: [
        { organizationId: org },
        { OR: [{ authorId: user.id }, { recipientId: user.id }] },
      ],
    });
    assert.equal(canViewAllWorkFeedback(user), false);
  }
});

test("workFeedbackVisibilityWhere: bez kanceláře, role nebo uživatele → nic", () => {
  assert.deepEqual(workFeedbackVisibilityWhere(null), DENY);
  assert.deepEqual(workFeedbackVisibilityWhere(UserRole.ADMIN), DENY);
  assert.deepEqual(
    workFeedbackVisibilityWhere({ id: "u", role: UserRole.PARTNER, organizationId: null }),
    DENY,
  );
  assert.deepEqual(
    workFeedbackVisibilityWhere({
      id: "u",
      role: "HACKER" as UserRole,
      organizationId: org,
    }),
    DENY,
  );
  assert.equal(
    canViewAllWorkFeedback({ id: "u", role: UserRole.ADMIN, organizationId: null }),
    false,
  );
});

test("matterCommentVisibilityWhere: dědí viditelnost projektu a případu", () => {
  for (const user of [admin, lawyer, intern]) {
    assert.deepEqual(matterCommentVisibilityWhere(user), {
      AND: [
        { organizationId: org },
        {
          OR: [
            { project: { is: projectVisibilityWhere(user) } },
            { case: { is: caseVisibilityWhere(user) } },
          ],
        },
      ],
    });
  }
  assert.deepEqual(matterCommentVisibilityWhere(null), DENY);
  assert.deepEqual(
    matterCommentVisibilityWhere({ id: "u", role: UserRole.ADMIN, organizationId: null }),
    DENY,
  );
});

test("canEditAuthoredEntry: upravit/smazat smí jen autor ve své kanceláři", () => {
  const own = { authorId: "u-trainee", organizationId: org };
  assert.equal(canEditAuthoredEntry(trainee, own), true);
  // Ani ADMIN/PARTNER nepřepisují cizí text.
  assert.equal(canEditAuthoredEntry(admin, own), false);
  assert.equal(canEditAuthoredEntry(partner, own), false);
  // Jiná kancelář, chybějící kancelář záznamu, smazaný autor, žádný uživatel.
  assert.equal(
    canEditAuthoredEntry(trainee, { authorId: "u-trainee", organizationId: "org-2" }),
    false,
  );
  assert.equal(canEditAuthoredEntry(trainee, { authorId: "u-trainee" }), false);
  assert.equal(canEditAuthoredEntry(trainee, { authorId: null, organizationId: org }), false);
  assert.equal(canEditAuthoredEntry(null, own), false);
  assert.equal(canEditAuthoredEntry(UserRole.TRAINEE, own), false);
  assert.equal(canEditAuthoredEntry(trainee, null), false);

  assert.doesNotThrow(() => assertCanEditAuthoredEntry(trainee, own));
  assert.throws(
    () => assertCanEditAuthoredEntry(lawyer, own),
    /jen jeho autor/,
  );
});
