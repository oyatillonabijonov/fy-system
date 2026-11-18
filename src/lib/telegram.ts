// Telegram widget (migration 100): the worker's refusal codes in Uzbek, and the template blanks.
const TG_ERRORS: Record<string, string> = {
  tg_no_account: "Telegram akkaunt ulanmagan",
  tg_cap: "Bugungi yangi suhbatlar chegarasi (30) tugadi — ertaga yoki mavjud suhbatga yozing",
  tg_not_found: "Bu raqam Telegramda topilmadi",
  tg_logged_out: "Telegram akkaunt uzilgan — Integratsiyalar'da qayta ulang",
  tg_off: "Telegram ulanmagan",
  tg_empty: "Matn yoki fayl yo'q",
  tg_bad_file: "Fayl topilmadi",
  tg_peer_flood: "Telegram bu akkauntga notanishlarga yozishni vaqtincha cheklagan",
  tg_privacy: "Bu odam sozlamalarida unga yozishni yopgan",
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

// the storage gateway caps request bodies at 11 MB (CLAUDE.md, task-files)
export const TG_MAX_FILE = 10 * 1024 * 1024

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]
const tashkentDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(iso))

/** The day separator in a chat: "Bugun", "Kecha", else "12-noyabr" (Tashkent days) */
export function dayLabel(iso: string, today: string): string {
  const d = tashkentDay(iso)
  if (d === today) return "Bugun"
  const y = new Date(`${today}T12:00:00Z`); y.setUTCDate(y.getUTCDate() - 1)
  if (d === y.toISOString().slice(0, 10)) return "Kecha"
  return `${Number(d.slice(8))}-${MONTHS[Number(d.slice(5, 7)) - 1]}`
}

/** Messages with a { day } marker before the first one of each day */
export function withDays<T extends { created_at: string }>(msgs: T[], today: string): ({ day: string } | T)[] {
  const out: ({ day: string } | T)[] = []
  let last = ""
  for (const m of msgs) {
    const d = tashkentDay(m.created_at)
    if (d !== last) { out.push({ day: dayLabel(m.created_at, today) }); last = d }
    out.push(m)
  }
  return out
}

export type TgInboxRow = {
  id: string; title: string; phone: string | null; unread: number; last_message_at: string | null
  lead_id: string | null; client_id: string | null; owner_id: string | null; image: string | null
  last: { text: string; files: unknown[]; direction: "in" | "out" } | null
}

export type InboxMode = "all" | "unread" | "mine"

/** Inbox search (name or phone digits) and the tabs: Hammasi / O'qilmagan / Mening (my bitimlar + unowned) */
export function filterInbox(rows: TgInboxRow[], q: string, mode: InboxMode, uid: string | null): TgInboxRow[] {
  const text = q.trim().toLowerCase()
  const digits = q.replace(/\D/g, "")
  return rows.filter((r) =>
    (mode !== "mine" || !r.owner_id || r.owner_id === uid) && (mode !== "unread" || r.unread > 0) &&
    (!text || r.title.toLowerCase().includes(text) || (digits.length >= 3 && (r.phone ?? "").replace(/\D/g, "").includes(digits))))
}
