import { expect, test } from "bun:test"
import { buildDigest } from "./tasks"

test("digest groups by owner, marks overdue/today/tomorrow, escapes HTML", () => {
  const [msg, ...rest] = buildDigest([
    { title: "Resort <bron>", due: "2026-09-28", owner: "Nuriddin Mo'sajonov", telegram: "@nuriddin", event: "Tog' safari 7.0" },
    { title: "Menyu", due: "2026-09-30", owner: "Nuriddin Mo'sajonov", telegram: "@nuriddin", event: null },
    { title: "Spikerlar", due: "2026-10-01", owner: "Hikmat aka", telegram: null, event: "Tog' safari 7.0" },
  ], "2026-09-30")
  expect(rest).toHaveLength(0)
  expect(msg).toContain("🔴 Muddati o'tgan: 1 · 🟡 Bugun: 1 · 🔵 Ertaga: 1")
  expect(msg).toContain("@nuriddin (Nuriddin Mo'sajonov)\n🔴 Resort &lt;bron&gt; — <i>Tog' safari 7.0</i> (28-sentyabr)\n🟡 Menyu")
  expect(msg).toContain("<b>Hikmat aka</b>\n🔵 Spikerlar")
})

test("long digests split between owner blocks, under Telegram's limit", () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({
    title: "x".repeat(60), due: "2026-09-30", owner: `Hodim ${i % 20}`, telegram: null, event: null,
  }))
  const parts = buildDigest(rows, "2026-09-30")
  expect(parts.length).toBeGreaterThan(1)
  for (const p of parts) expect(p.length).toBeLessThanOrEqual(4096)
})
