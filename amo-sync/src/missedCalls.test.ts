import { describe, expect, test } from "bun:test"
import { dmTargets, isSendingHour, missedCallText, missedDmText, type MissedRow } from "./missedCalls"

const row: MissedRow = { phone: "+998901234567", client_name: "Ali <Valiyev>", lead_id: "abc", owner: "Nuriddin", telegram: "nuriddin", calls: 1, last_missed: new Date("2026-11-08T09:05:00Z") }

describe("missedCallText", () => {
  test("name, phone, Tashkent time, @owner, bitim link; HTML escaped", () => {
    const t = missedCallText(row)
    expect(t).toContain("Ali &lt;Valiyev&gt;")
    expect(t).toContain("📞 +998901234567")
    expect(t).toContain("🕐 14:05")
    expect(t).toContain("Mas'ul: @nuriddin")
    expect(t).toContain('href="https://app.fikryetakchilari.uz/sotuv/bitim/abc"')
    expect(t).not.toContain("marta")
  })
  test("a client named by the phone isn't shown twice; no owner, no bitim; repeat count", () => {
    const t = missedCallText({ ...row, client_name: "998901234567", lead_id: null, owner: null, telegram: null, calls: 3 })
    expect(t).not.toContain("👤")
    expect(t).toContain("Mas'ul: belgilanmagan")
    expect(t).not.toContain("Bitimni ochish")
    expect(t).toContain("· 3 marta")
  })
  test("owner without Telegram is named; @ isn't doubled", () => {
    expect(missedCallText({ ...row, telegram: null })).toContain("Mas'ul: Nuriddin")
    expect(missedCallText({ ...row, telegram: "@nuriddin" })).toContain("Mas'ul: @nuriddin")
  })
})

test("messages go out 9:00–21:00 Tashkent (UTC+5)", () => {
  expect(isSendingHour(new Date("2026-11-08T03:59:00Z"))).toBe(false)  // 08:59
  expect(isSendingHour(new Date("2026-11-08T04:00:00Z"))).toBe(true)   // 09:00
  expect(isSendingHour(new Date("2026-11-08T15:59:00Z"))).toBe(true)   // 20:59
  expect(isSendingHour(new Date("2026-11-08T16:00:00Z"))).toBe(false)  // 21:00
  expect(isSendingHour(new Date("2026-11-08T19:00:00Z"))).toBe(false)  // 00:00
})

describe("private message at once (089)", () => {
  const subs = [{ id: "zuhra", chat: "1" }, { id: "ali", chat: "2" }]
  test("the bitim owner alone when they switched it on, else everyone who did", () => {
    expect(dmTargets(subs, "zuhra")).toEqual([{ id: "zuhra", chat: "1" }])
    expect(dmTargets(subs, "xayriniso")).toEqual(subs)
    expect(dmTargets(subs, null)).toEqual(subs)
    expect(dmTargets([], "zuhra")).toEqual([])
  })
  test("text: name, phone, Tashkent time, link; no 2-hour line, no owner line", () => {
    const t = missedDmText({ phone: "+998901234567", client_name: "Ali", lead_id: "abc", owner_id: null, calls: 2, last_missed: new Date("2026-11-08T21:30:00Z") })
    expect(t).toContain("👤 Ali")
    expect(t).toContain("🕐 02:30 · 2 marta")
    expect(t).toContain("bitim/abc")
    expect(t).not.toContain("2 soat")
    expect(t).not.toContain("Mas'ul")
  })
})
