import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { buildPayload, isStale, retryAfterMin, type QueuedEvent } from "./capi"

const sha = (s: string) => createHash("sha256").update(s).digest("hex")
const base: QueuedEvent = {
  id: 1, lead_id: "11111111-2222-3333-4444-555555555555", event_name: "Lead", event_id: "3f1c", event_time: new Date("2026-11-11T10:00:00Z"),
  value: null, attempts: 0, phone: "+998 90 123 45 67", name: "  Anvar Karimov ",
  capi: { event_source_url: "https://nonushta.fikryetakchilari.uz/?utm_source=fb", content_name: "Biznes nonushta #11", fbc: "fb.1.1.IwAR", fbp: "fb.1.2.3", client_ip: "5.6.7.8", user_agent: "UA" },
  content_fallback: "Voronka",
}

describe("buildPayload", () => {
  test("Lead: hashed phone/name/id, raw click ids and browser, the form's event_id", () => {
    const p = buildPayload(base) as { event_name: string; event_time: number; event_id: string; action_source: string; event_source_url: string; user_data: Record<string, unknown>; custom_data: Record<string, unknown> }
    expect(p.event_name).toBe("Lead")
    expect(p.event_time).toBe(Math.floor(base.event_time.getTime() / 1000))
    expect(p.event_id).toBe("3f1c")
    expect(p.action_source).toBe("website")
    expect(p.event_source_url).toBe(base.capi.event_source_url!)
    expect(p.user_data).toEqual({ ph: [sha("998901234567")], fn: [sha("anvar karimov")], external_id: [sha(base.lead_id)], fbc: "fb.1.1.IwAR", fbp: "fb.1.2.3", client_ip_address: "5.6.7.8", client_user_agent: "UA" })
    expect(p.custom_data).toEqual({ content_name: "Biznes nonushta #11" })
  })
  test("missing click ids, address and browser are left out, not sent empty", () => {
    const p = buildPayload({ ...base, phone: null, name: null, capi: { event_source_url: "https://x.uz" } }) as { user_data: Record<string, unknown>; custom_data: Record<string, unknown> }
    expect(p.user_data).toEqual({ external_id: [sha(base.lead_id)] })
    expect(p.custom_data).toEqual({ content_name: "Voronka" })
  })
  test("a 9-digit local phone gets 998 in front", () => {
    const p = buildPayload({ ...base, phone: "90 123 45 67" }) as { user_data: { ph: string[] } }
    expect(p.user_data.ph).toEqual([sha("998901234567")])
  })
  test("only Purchase carries a value in UZS", () => {
    const p = buildPayload({ ...base, event_name: "Purchase", event_id: "x_Purchase", value: 1800000 }) as { custom_data: Record<string, unknown> }
    expect(p.custom_data).toEqual({ content_name: "Biznes nonushta #11", value: 1800000, currency: "UZS" })
    expect((buildPayload({ ...base, value: 5 }) as { custom_data: Record<string, unknown> }).custom_data.value).toBeUndefined()
  })
})

describe("retries and the 7-day limit", () => {
  test("1, 10, 60 minutes, then give up", () => {
    expect([1, 2, 3, 4].map(retryAfterMin)).toEqual([1, 10, 60, null])
  })
  test("an event older than 7 days is not sent", () => {
    expect(isStale(base, new Date("2026-11-18T09:59:00Z"))).toBe(false)
    expect(isStale(base, new Date("2026-11-18T10:01:00Z"))).toBe(true)
  })
})
