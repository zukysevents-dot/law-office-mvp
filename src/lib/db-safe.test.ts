import assert from "node:assert/strict";
import { test } from "node:test";

import { safeQuery } from "./db-safe";

test("safeQuery returns a fallback for a database connectivity error", async () => {
  const result = await safeQuery({ rows: 0 }, async () => {
    throw new Error("Can't reach database server at localhost:5432");
  });

  assert.deepEqual(result.data, { rows: 0 });
  assert.equal(result.databaseReady, false);
  assert.match(result.error ?? "", /PostgreSQL server/);
});

test("safeQuery rethrows unexpected application errors", async () => {
  const failure = new Error("Unexpected authorization bug");

  await assert.rejects(
    safeQuery(null, async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
});
