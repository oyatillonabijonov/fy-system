// Runnable check: `bun scripts/checks/period.check.ts` — exits non-zero on failure.
import assert from "node:assert/strict"
import { dayEnd, dayStart, periodRange, tashkentToday } from "../../src/lib/period"

assert.deepEqual(periodRange("all", null, null, "2026-09-27"), { from: null, to: null })
assert.deepEqual(periodRange("today", null, null, "2026-09-27"), { from: "2026-09-27", to: "2026-09-27" })
assert.deepEqual(periodRange("month", null, null, "2026-09-27"), { from: "2026-09-01", to: "2026-09-27" })
assert.deepEqual(periodRange("last", null, null, "2026-01-15"), { from: "2025-12-01", to: "2025-12-31" })
assert.deepEqual(periodRange("last", null, null, "2028-03-10"), { from: "2028-02-01", to: "2028-02-29" })
assert.deepEqual(periodRange("custom", "2026-05-01", "2026-05-20", "2026-09-27"), { from: "2026-05-01", to: "2026-05-20" })
// 20:00 UTC on 30 Sep is already 1 Oct in Tashkent (UTC+5).
assert.equal(tashkentToday(new Date("2026-09-30T20:00:00Z")), "2026-10-01")
assert.equal(dayStart("2026-09-01"), "2026-09-01T00:00:00+05:00")
assert.equal(dayEnd("2026-09-30"), "2026-09-30T23:59:59.999+05:00")
console.log("period.check: ok")
