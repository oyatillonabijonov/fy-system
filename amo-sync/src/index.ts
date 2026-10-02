// amo-sync — the system's only scheduled worker (CLAUDE.md). The AmoCRM sync stopped on 2026-10-03
// (the Dashboard reads our own Sotuv bo'limi, 080); its amo_* tables stay as an archive.
//
// Every SYNC_INTERVAL_MIN: settle_event_cashback() and expire_cashback().
// Alongside: Telegram payment receipts (src/telegram.ts); the Vazifalar morning report and
// deadline reminders (src/tasks.ts); tasks from the team chat (src/taskbot.ts, Gemini); form
// webhooks that open bitimlar (src/intake.ts, :8787 behind /hooks/); OnlinePBX call history and
// the browser phone's endpoints (src/pbx.ts, /hooks/pbx/).
//
// Env: DATABASE_URL, SYNC_INTERVAL_MIN (10). `bun run src/index.ts --once` runs one pass and exits.

import postgres from "postgres"
import { startTelegram } from "./telegram"
import { startTaskDigest } from "./tasks"
import { startTaskBot } from "./taskbot"
import { startIntake } from "./intake"
import { startPbxSync } from "./pbx"
import { seedGroups } from "./groups"

const env = (k: string, d?: string): string => {
  const v = process.env[k] ?? d
  if (v === undefined || v === "") throw new Error(`env ${k} kerak`)
  return v
}

const sql = postgres(env("DATABASE_URL"), { max: 2, onnotice: () => {} })
const INTERVAL_MIN = Number(env("SYNC_INTERVAL_MIN", "10"))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Run loop ────────────────────────────────────────────────────────────────

async function runOnce(): Promise<void> {
  await expireCashback()
}

// Cashback is credited the day after an event (061) and expires after 12 months (059).
async function expireCashback(): Promise<void> {
  try {
    const [award] = await sql<{ n: number }[]>`select public.settle_event_cashback() as n`
    if (award && award.n > 0) console.log(`[amo-sync] keshbek: ${award.n} ta ishtirokchida tadbirdan keyingi keshbek yangilandi`)
    const [row] = await sql<{ n: number }[]>`select public.expire_cashback() as n`
    if (row && row.n > 0) console.log(`[amo-sync] keshbek: ${row.n} ta mijozda muddati tugagan qism yechildi`)
  } catch (err) {
    console.error(`[amo-sync] keshbek muddati: ${err instanceof Error ? err.message : String(err)}`)
  }
}

if (process.argv.includes("--once")) {
  await runOnce()
  await sql.end()
} else {
  await seedGroups(sql).catch((e) => console.error(`[groups] ${e instanceof Error ? e.message : e}`))
  await startTelegram(sql)
  startTaskDigest(sql)
  await startTaskBot(sql).catch((e) => console.error(`[taskbot] ${e instanceof Error ? e.message : e}`))
  startIntake(sql)
  startPbxSync(sql)
  for (;;) {
    await runOnce()
    await sleep(INTERVAL_MIN * 60 * 1000)
  }
}
