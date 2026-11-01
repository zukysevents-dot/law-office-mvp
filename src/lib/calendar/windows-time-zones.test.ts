import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveIanaZone,
  toDisplayWallIso,
  utcToWallTime,
  zonedWallTimeToUtc,
} from "@/lib/calendar/windows-time-zones";

test("resolveIanaZone maps Outlook's Windows zone names", () => {
  assert.equal(resolveIanaZone("Central Europe Standard Time"), "Europe/Prague");
  assert.equal(resolveIanaZone('"Central Europe Standard Time"'), "Europe/Prague");
  assert.equal(resolveIanaZone("central europe standard time"), "Europe/Prague");
  assert.equal(resolveIanaZone("W. Europe Standard Time"), "Europe/Berlin");
  assert.equal(resolveIanaZone("GMT Standard Time"), "Europe/London");
  assert.equal(resolveIanaZone("Pacific Standard Time"), "America/Los_Angeles");
  assert.equal(resolveIanaZone("UTC"), "UTC");
});

test("resolveIanaZone passes IANA names through (incl. prefixed forms)", () => {
  assert.equal(resolveIanaZone("Europe/Prague"), "Europe/Prague");
  assert.equal(
    resolveIanaZone("America/Argentina/Buenos_Aires"),
    "America/Argentina/Buenos_Aires",
  );
  assert.equal(resolveIanaZone("/mozilla.org/20050126_1/Europe/Prague"), "Europe/Prague");
});

test("resolveIanaZone returns null for unknown zones", () => {
  assert.equal(resolveIanaZone("Customized Time Zone"), null);
  assert.equal(resolveIanaZone("Not/AZone"), null);
  assert.equal(resolveIanaZone(""), null);
  assert.equal(resolveIanaZone(null), null);
});

const wall = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
) => ({ year, month, day, hour, minute, second });

test("zonedWallTimeToUtc handles the spring DST switch in Prague", () => {
  // Saturday before the switch: CET (+1).
  assert.equal(
    zonedWallTimeToUtc(wall(2026, 3, 28, 9), "Europe/Prague").toISOString(),
    "2026-03-28T08:00:00.000Z",
  );
  // DST day itself: CEST (+2).
  assert.equal(
    zonedWallTimeToUtc(wall(2026, 3, 29, 9), "Europe/Prague").toISOString(),
    "2026-03-29T07:00:00.000Z",
  );
});

test("zonedWallTimeToUtc handles the autumn switch in Prague", () => {
  assert.equal(
    zonedWallTimeToUtc(wall(2026, 10, 24, 10), "Europe/Prague").toISOString(),
    "2026-10-24T08:00:00.000Z",
  );
  assert.equal(
    zonedWallTimeToUtc(wall(2026, 10, 26, 10), "Europe/Prague").toISOString(),
    "2026-10-26T09:00:00.000Z",
  );
  // 02:30 happens twice on 25 Oct → deterministic (standard time).
  assert.equal(
    zonedWallTimeToUtc(wall(2026, 10, 25, 2, 30), "Europe/Prague").toISOString(),
    "2026-10-25T01:30:00.000Z",
  );
});

test("zonedWallTimeToUtc moves a time in the DST gap forward", () => {
  // 02:30 does not exist on 29 Mar 2026 → 03:30 CEST = 01:30Z.
  assert.equal(
    zonedWallTimeToUtc(wall(2026, 3, 29, 2, 30), "Europe/Prague").toISOString(),
    "2026-03-29T01:30:00.000Z",
  );
});

test("zonedWallTimeToUtc works for other zones", () => {
  assert.equal(
    zonedWallTimeToUtc(wall(2026, 7, 1, 9), "America/New_York").toISOString(),
    "2026-07-01T13:00:00.000Z",
  );
  assert.equal(
    zonedWallTimeToUtc(wall(2026, 7, 1, 9), "UTC").toISOString(),
    "2026-07-01T09:00:00.000Z",
  );
});

test("utcToWallTime / toDisplayWallIso round trip", () => {
  const instant = new Date("2026-03-29T07:00:00.000Z");
  assert.deepEqual(utcToWallTime(instant, "Europe/Prague"), wall(2026, 3, 29, 9));
  assert.equal(toDisplayWallIso(instant), "2026-03-29T09:00:00");
  assert.equal(
    zonedWallTimeToUtc(utcToWallTime(instant, "Europe/Prague"), "Europe/Prague").getTime(),
    instant.getTime(),
  );
  assert.equal(toDisplayWallIso(new Date("2026-12-31T23:30:00.000Z")), "2027-01-01T00:30:00");
});
