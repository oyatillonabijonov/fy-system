import { describe, expect, test } from "bun:test"
import { alertText, shouldSend } from "./intakeAlert"

describe("intake alert", () => {
  test("says how many, since when, which source and the first reason — no personal data", () => {
    const t = alertText({ n: 3, first: new Date("2026-11-11T12:05:00Z"), sources: ["sayt"], reason: "unknown source or token" })
    expect(t).toContain("3 ta")
    expect(t).toContain("17:05")
    expect(t).toContain("sayt")
    expect(t).toContain("unknown source or token")
    expect(t).toContain("webhook_logs")
  })
  test("a long reason is cut and HTML is escaped", () => {
    const t = alertText({ n: 1, first: new Date(), sources: ["sayt"], reason: "<b>" + "x".repeat(500) })
    expect(t).toContain("&lt;b&gt;")
    expect(t.length).toBeLessThan(700)
  })
  test("at most one message per 30 minutes", () => {
    const now = new Date("2026-11-11T12:00:00Z")
    expect(shouldSend(null, now)).toBe(true)
    expect(shouldSend(new Date("2026-11-11T11:45:00Z"), now)).toBe(false)
    expect(shouldSend(new Date("2026-11-11T11:29:00Z"), now)).toBe(true)
  })
})
