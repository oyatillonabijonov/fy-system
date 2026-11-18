import { describe, expect, test } from "bun:test"
import { tgErrorText, TG_BLANKS, TG_MAX_FILE } from "./telegram"

describe("tgErrorText", () => {
  test("worker codes → the Uzbek copy", () => {
    expect(tgErrorText("tg_flood", 30)).toBe("Telegram biroz kutishni so'radi, 30 soniyadan keyin")
    expect(tgErrorText("tg_cap")).toBe("Bugungi yangi suhbatlar chegarasi (30) tugadi — ertaga yoki mavjud suhbatga yozing")
    expect(tgErrorText("tg_not_found")).toBe("Bu raqam Telegramda topilmadi")
    expect(tgErrorText("tg_no_account")).toBe("Telegram akkaunt ulanmagan")
    expect(tgErrorText("tg_logged_out")).toBe("Telegram akkaunt uzilgan — Integratsiyalar'da qayta ulang")
    expect(tgErrorText("something_else")).toBe("Yuborilmadi")
  })
  test("blanks offered in the template editor", () => {
    expect(TG_BLANKS.map((b) => b.key)).toEqual(["{ism}", "{tadbir}", "{sana}"])
  })
  test("upload limit fits under the storage gateway's 11 MB body cap", () => {
    expect(TG_MAX_FILE).toBe(10 * 1024 * 1024)
    expect(tgErrorText("tg_peer_flood")).toBe("Telegram bu akkauntga notanishlarga yozishni vaqtincha cheklagan")
    expect(tgErrorText("tg_privacy")).toBe("Bu odam sozlamalarida unga yozishni yopgan")
  })
})

import { dayLabel, withDays, filterInbox } from "./telegram"

describe("chat helpers", () => {
  test("dayLabel: Bugun / Kecha / d-oy (Tashkent)", () => {
    expect(dayLabel("2026-11-18T03:00:00Z", "2026-11-18")).toBe("Bugun")
    expect(dayLabel("2026-11-17T20:30:00Z", "2026-11-18")).toBe("Bugun")   // 01:30 Tashkent on the 18th
    expect(dayLabel("2026-11-17T09:00:00Z", "2026-11-18")).toBe("Kecha")
    expect(dayLabel("2026-11-12T09:00:00Z", "2026-11-18")).toBe("12-noyabr")
  })
  test("withDays puts one marker before each day", () => {
    const m = (id: string, at: string) => ({ id, created_at: at })
    const out = withDays([m("a", "2026-11-17T09:00:00Z"), m("b", "2026-11-17T10:00:00Z"), m("c", "2026-11-18T09:00:00Z")], "2026-11-18")
    expect(out).toEqual([{ day: "Kecha" }, m("a", "2026-11-17T09:00:00Z"), m("b", "2026-11-17T10:00:00Z"), { day: "Bugun" }, m("c", "2026-11-18T09:00:00Z")])
  })
  test("filterInbox: name, phone digits, mine = mine or unowned", () => {
    const r = (id: string, title: string, phone: string | null, owner_id: string | null) =>
      ({ id, title, phone, owner_id, unread: 0, last_message_at: null, lead_id: null, client_id: null, last: null })
    const rows = [r("1", "Farah", "+998978859666", "u1"), r("2", "Nuriddin", "+998901112120", null), r("3", "Akmal", null, "u2")]
    expect(filterInbox(rows, "far", false, "u1").map((x) => x.id)).toEqual(["1"])
    expect(filterInbox(rows, "97 885", false, "u1").map((x) => x.id)).toEqual(["1"])
    expect(filterInbox(rows, "", true, "u1").map((x) => x.id)).toEqual(["1", "2"])
  })
})
