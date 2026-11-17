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
