import { expect, test } from "bun:test"
import { buildDigest, buildReminders, reminderFor } from "./tasks"

const ev = { name: "Tog' safari 7.0 | Amirsoy", start: "2026-10-23", done: 23, in_progress: 13, todo: 17, failed: 2 }

test("report: event progress, yesterday, attention per owner with @mention", () => {
  const [msg, ...rest] = buildDigest("2026-09-30", [ev],
    [{ title: "Resort <shortlist>", owner: "Jahongir Qahramonov", telegram: "jahongir" }],
    [
      { title: "Mehmonxonani bron qilish", due: "2026-09-28", owner: "Nuriddin Mo'sajonov", telegram: "@nuriddin" },
      { title: "Target reklama", due: "2026-09-30", time: "14:00:00", owner: "Nuriddin Mo'sajonov", telegram: "@nuriddin" },
      { title: "Spikerlar", due: "2026-10-01", owner: "Hikmat aka", telegram: null },
    ])
  expect(rest).toHaveLength(0)
  expect(msg).toContain("🌅 <b>Xayrli tong! Vazifalar — 30-sentyabr</b>")
  expect(msg).toContain("📌 <b>Tog' safari 7.0 | Amirsoy</b> · 23 kun qoldi\n<code>▰▰▰▰▱▱▱▱▱▱</code> 42%")
  expect(msg).toContain("✅ 23 bajarildi · 🔄 13 jarayonda\n⏳ 17 boshlanmagan · ❌ 2 bajarilmadi")
  expect(msg).toContain("<b>Kecha bajarildi (1)</b>\n✅ Resort &lt;shortlist&gt; — @jahongir")
  expect(msg).toContain("<blockquote>@nuriddin\n🔴 Mehmonxonani bron qilish · 2 kun kechikdi\n🟡 Target reklama · bugun 14:00</blockquote>")
  expect(msg).toContain("<blockquote><b>Hikmat aka</b>\n🔵 Spikerlar · ertaga</blockquote>")
})

test("no due tasks → an all-clear line; general tasks named", () => {
  const [msg] = buildDigest("2026-09-30", [{ ...ev, name: null, start: null }], [], [])
  expect(msg).toContain("📌 <b>Umumiy vazifalar</b>\n")
  expect(msg).toContain("👌 Bugun va ertaga muddati tugaydigan vazifa yo'q")
})

test("long reports split between blocks, under Telegram's limit", () => {
  const due = Array.from({ length: 200 }, (_, i) => ({ title: "x".repeat(60), due: "2026-09-30", owner: `Hodim ${i % 20}`, telegram: null }))
  const parts = buildDigest("2026-09-30", [ev], [], due)
  expect(parts.length).toBeGreaterThan(1)
  for (const p of parts) expect(p.length).toBeLessThanOrEqual(4096)
})

test("reminders: 1 h before, at the time, then daily at that time; none without the window", () => {
  const at = 14 * 60
  expect(reminderFor("2026-09-30", at - 61, "2026-09-30", "14:00:00")).toBeNull()
  expect(reminderFor("2026-09-30", at - 60, "2026-09-30", "14:00:00")).toEqual({ kind: "soon", key: "2026-09-30 14:00" })
  expect(reminderFor("2026-09-30", at, "2026-09-30", "14:00:00")).toEqual({ kind: "due", key: "2026-09-30 14:00" })
  expect(reminderFor("2026-09-30", 23 * 60, "2026-09-30", "14:00:00")).toEqual({ kind: "due", key: "2026-09-30 14:00" })
  expect(reminderFor("2026-10-01", at - 1, "2026-09-30", "14:00:00")).toBeNull()
  expect(reminderFor("2026-10-01", at, "2026-09-30", "14:00:00")).toEqual({ kind: "late", key: "2026-10-01" })
  expect(reminderFor("2026-10-03", at + 5, "2026-09-30", "14:00:00")).toEqual({ kind: "late", key: "2026-10-03" })
  expect(reminderFor("2026-09-29", at, "2026-09-30", "14:00:00")).toBeNull()
  // just after midnight: "soon" starts the evening before
  expect(reminderFor("2026-09-29", 23 * 60 + 45, "2026-09-30", "00:30:00")).toEqual({ kind: "soon", key: "2026-09-30 00:30" })
})

test("reminder message: heading per kind, owner mentioned, event › section", () => {
  const row = { id: "1", title: "Resort <to'lov>", due: "2026-09-28", time: "14:00:00", owner: "Jahongir", telegram: "jahongir", event: "Tog' safari 7.0", section: "Resort" }
  const msg = buildReminders("2026-09-30", [
    { row, kind: "late" },
    { row: { ...row, id: "2", title: "Video meet", due: "2026-09-30", time: "15:00:00", telegram: null, owner: "Hikmat aka", event: null, section: null }, kind: "soon" },
  ])
  expect(msg).toBe(
    "🔴 <b>Muddati o'tgan</b>\n<blockquote>@jahongir\nResort &lt;to'lov&gt; · 28-sentyabr 14:00 · 2 kun kechikdi\nTog' safari 7.0 › Resort</blockquote>" +
    "\n⏰ <b>Muddatga oz qoldi</b>\n<blockquote><b>Hikmat aka</b>\nVideo meet · bugun 15:00</blockquote>")
})
