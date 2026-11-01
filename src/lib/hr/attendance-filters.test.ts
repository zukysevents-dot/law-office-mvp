import assert from "node:assert/strict";
import { test } from "node:test";

import {
  attendanceFilterQuery,
  attendanceFilterWhere,
  hasAttendanceFilters,
  monthPeriod,
  readAttendanceFilters,
  weekPeriod,
} from "./attendance-filters";

const from = (params: Record<string, string>) =>
  readAttendanceFilters((key) => params[key] ?? "");

test("readAttendanceFilters: platné období a zaměstnanec", () => {
  const filters = from({ from: "2026-10-01", to: "2026-10-31", employeeId: "cm1abc_9" });
  assert.deepEqual(filters, { from: "2026-10-01", to: "2026-10-31", employeeId: "cm1abc_9" });
  assert.equal(hasAttendanceFilters(filters), true);
});

test("readAttendanceFilters: neplatné hodnoty z URL se zahodí", () => {
  const filters = from({ from: "2026-02-31", to: "zitra", employeeId: "x'; DROP" });
  assert.deepEqual(filters, { from: "", to: "", employeeId: "" });
  assert.equal(hasAttendanceFilters(filters), false);
});

test("readAttendanceFilters: prohozené období se srovná", () => {
  const filters = from({ from: "2026-10-31", to: "2026-10-01" });
  assert.equal(filters.from, "2026-10-01");
  assert.equal(filters.to, "2026-10-31");
});

test("attendanceFilterWhere: UTC hranice dne a zaměstnanec", () => {
  const where = attendanceFilterWhere({ from: "2026-10-01", to: "2026-10-31", employeeId: "e1" });
  assert.deepEqual(where, {
    workDate: {
      gte: new Date("2026-10-01T00:00:00.000Z"),
      lte: new Date("2026-10-31T23:59:59.999Z"),
    },
    employeeId: "e1",
  });
  assert.deepEqual(attendanceFilterWhere({ from: "", to: "2026-10-31", employeeId: "" }), {
    workDate: { lte: new Date("2026-10-31T23:59:59.999Z") },
  });
  assert.deepEqual(attendanceFilterWhere({ from: "", to: "", employeeId: "" }), {});
});

test("attendanceFilterQuery: vynechá prázdné hodnoty", () => {
  assert.equal(
    attendanceFilterQuery({ from: "2026-10-01", to: "", employeeId: "e1" }),
    "from=2026-10-01&employeeId=e1",
  );
});

test("monthPeriod: tento a minulý měsíc, přes konec roku", () => {
  const today = new Date("2026-10-20T00:00:00.000Z");
  assert.deepEqual(monthPeriod(today), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(monthPeriod(today, -1), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(monthPeriod(new Date("2026-01-15T00:00:00.000Z"), -1), {
    from: "2025-12-01",
    to: "2025-12-31",
  });
  assert.deepEqual(monthPeriod(new Date("2028-02-10T00:00:00.000Z")), {
    from: "2028-02-01",
    to: "2028-02-29",
  });
});

test("weekPeriod: pondělí až neděle", () => {
  // 25. 10. 2026 je neděle.
  assert.deepEqual(weekPeriod(new Date("2026-10-25T00:00:00.000Z")), {
    from: "2026-10-19",
    to: "2026-10-25",
  });
  assert.deepEqual(weekPeriod(new Date("2026-10-26T00:00:00.000Z")), {
    from: "2026-10-26",
    to: "2026-11-01",
  });
});
