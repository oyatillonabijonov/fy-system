import { describe, expect, test } from "bun:test"
import { eventBody, retryAfterMin, verdict, type EventRow } from "./fyApp"

const base: EventRow = {
  id: "e1", name: "Biznes nonushta 12", description: "Tavsif", location: "Hilton", cover_image: "https://api.x/storage/v1/object/public/event-covers/a.jpg",
  day: "2026-12-01", start_time: "09:00", end_day: null, show_in_app: true, is_active: true,
  app_category: "Nonushta", app_capacity: 60, app_pipeline_id: "p1", host: "Zuhra", min_price: 1500000.4,
}

describe("eventBody", () => {
  test("the contract's fields, Tashkent offset, cheapest tariff as a whole so'm", () => {
    expect(eventBody(base)).toEqual({
      title: "Biznes nonushta 12", startsAt: "2026-12-01T09:00:00+05:00", endsAt: null, price: 1500000,
      about: "Tavsif", place: "Hilton", imageUrl: base.cover_image, pipelineId: "p1", isActive: true,
      category: "Nonushta", capacity: 60, host: "Zuhra",
    })
  })
  test("a later end day becomes its last minute; the same day is no end", () => {
    expect((eventBody({ ...base, end_day: "2026-12-03" }) as { endsAt: string }).endsAt).toBe("2026-12-03T23:59:00+05:00")
    expect((eventBody({ ...base, end_day: "2026-12-01" }) as { endsAt: null }).endsAt).toBeNull()
  })
  test("a free event is price 0; empty texts go as empty strings, no image as null", () => {
    const b = eventBody({ ...base, min_price: 0, description: null, location: null, cover_image: null, host: null }) as Record<string, unknown>
    expect([b.price, b.about, b.place, b.imageUrl, b.host]).toEqual([0, "", "", null, ""])
  })
  test("no start time or no tariff: not sendable, with the reason", () => {
    expect(eventBody({ ...base, start_time: null })).toBe("boshlanish sanasi yoki vaqti yo'q")
    expect(eventBody({ ...base, min_price: null })).toBe("tarif yo'q")
  })
})

describe("verdict / retry", () => {
  test("2xx sent, 4xx failed (but 429), 5xx / network retried", () => {
    expect([200, 204].map(verdict)).toEqual(["sent", "sent"])
    expect([400, 401, 404, 422].map(verdict)).toEqual(["failed", "failed", "failed", "failed"])
    expect([429, 500, 503, 0].map(verdict)).toEqual(["retry", "retry", "retry", "retry"])
  })
  test("1, 5, 15, 60 minutes, then give up", () => {
    expect([1, 2, 3, 4, 5].map(retryAfterMin)).toEqual([1, 5, 15, 60, null])
  })
})
