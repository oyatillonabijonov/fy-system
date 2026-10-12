import { expect, test } from "bun:test"
import { mapStatus, sendingHours } from "./sms"

test("Eskiz statuses map to ours", () => {
  expect(mapStatus("DELIVRD")).toBe("delivered")
  expect(mapStatus("undeliv")).toBe("failed")
  expect(mapStatus("REJECTD")).toBe("failed")
  expect(mapStatus("TRANSMTD")).toBeNull()
  expect(mapStatus("")).toBeNull()
})

test("sends only 9:00–21:00 Tashkent (UTC+5)", () => {
  expect(sendingHours(new Date("2026-10-12T03:59:00Z"))).toBe(false) // 8:59
  expect(sendingHours(new Date("2026-10-12T04:00:00Z"))).toBe(true)  // 9:00
  expect(sendingHours(new Date("2026-10-12T15:59:00Z"))).toBe(true)  // 20:59
  expect(sendingHours(new Date("2026-10-12T16:00:00Z"))).toBe(false) // 21:00
})
