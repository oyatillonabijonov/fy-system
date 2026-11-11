import { expect, test } from "bun:test"
import { eskizState, importText, mapStatus, sameText, sendingHours, toPattern } from "./sms"

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

test("our template → Eskiz pattern: {ism} one word, other blanks up to 10 words", () => {
  expect(toPattern("Salom, {ism}! {sana} kuni")).toBe("Salom, %w! %w{1,10} kuni")
  expect(toPattern("Tayyor matn")).toBe("Tayyor matn")
})

test("Eskiz states: service = reminder, reklama = promo, the rest by name", () => {
  expect(eskizState("service")).toEqual({ status: "approved", kind: "reminder" })
  expect(eskizState("reklama")).toEqual({ status: "approved", kind: "promo" })
  expect(eskizState("moderation")).toEqual({ status: "moderation", kind: null })
  expect(eskizState("rejected")).toEqual({ status: "rejected", kind: null })
})

test("an Eskiz template made on my.eskiz.uz becomes our text with named blanks", () => {
  expect(importText("Salom %w! %d{1,3} ga qo'ng'iroq: %w{1,15}")).toBe("Salom {matn1}! {matn2} ga qo'ng'iroq: {matn3}")
})

test("texts compare without caring about spacing and line breaks", () => {
  expect(sameText("Joylar tez to'lib boryapti!\n\nJoy band  qiling", "Joylar tez to'lib boryapti! Joy band qiling")).toBe(true)
  expect(sameText("A b", "A c")).toBe(false)
})
