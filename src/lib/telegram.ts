// Telegram widget (migration 100): the worker's refusal codes in Uzbek, and the template blanks.
const TG_ERRORS: Record<string, string> = {
  tg_no_account: "Telegram akkaunt ulanmagan",
  tg_cap: "Bugungi yangi suhbatlar chegarasi (30) tugadi — ertaga yoki mavjud suhbatga yozing",
  tg_not_found: "Bu raqam Telegramda topilmadi",
  tg_logged_out: "Telegram akkaunt uzilgan — Integratsiyalar'da qayta ulang",
  tg_off: "Telegram ulanmagan",
  tg_empty: "Matn yoki fayl yo'q",
  tg_bad_file: "Fayl topilmadi",
}

export function tgErrorText(code: string, seconds = 0): string {
  if (code === "tg_flood") return `Telegram biroz kutishni so'radi, ${seconds} soniyadan keyin`
  return TG_ERRORS[code] ?? "Yuborilmadi"
}

export const TG_BLANKS = [
  { key: "{ism}", label: "Ism" },
  { key: "{tadbir}", label: "Tadbir" },
  { key: "{sana}", label: "Sana" },
] as const

export const TG_MAX_FILE = 20 * 1024 * 1024
