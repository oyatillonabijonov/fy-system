// The Telegram worker's writes against the throwaway stand (TEST_DATABASE_URL, with migration 100); skipped without it.
// Message files must land as a jsonb ARRAY — a jsonb string broke the bitim page (files.map) on 2026-11-17.
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { testSql as sql } from "../mcp/testdb"
import { handleIncoming } from "./incoming"
import { fakePort, incoming } from "./fake"

const run = sql ? test : test.skip
const ACC = crypto.randomUUID()
const PHONE = "+998901008801"

beforeAll(async () => {
  if (!sql) return
  await sql`insert into telegram_accounts (id, title, status) values (${ACC}, 'DB test', 'active')`
  await sql`insert into clients (full_name, phone, source) values ('Db Mijoz', ${PHONE}, 'sayt')`
})
afterAll(async () => {
  if (!sql) return
  await sql`delete from telegram_accounts where id = ${ACC}`
  await sql`delete from clients where phone = ${PHONE}`
})

describe("files stored as a jsonb array", () => {
  run("incoming message with and without a file", async () => {
    const store = { put: async () => {} }
    const peer = { userId: 880001, accessHash: "1", username: null, title: "Db Mijoz", phone: PHONE.slice(1) }
    await handleIncoming(sql!, ACC, fakePort(), incoming({ peer, msgId: 1, text: "Salom" }), store)
    await handleIncoming(sql!, ACC, fakePort(), incoming({ peer, msgId: 2, text: "", media: { name: "a.pdf", mime: "application/pdf", size: 3 } }), store)
    const rows = await sql!<{ t: string; n: number }[]>`
      select jsonb_typeof(m.files) as t, jsonb_array_length(case when jsonb_typeof(m.files) = 'array' then m.files else '[]' end) as n
      from tg_messages m join tg_chats c on c.id = m.chat_id where c.account_id = ${ACC} order by m.tg_msg_id`
    expect([...rows]).toEqual([{ t: "array", n: 0 }, { t: "array", n: 1 }])
  })
})
