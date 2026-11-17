import { describe, expect, test } from "bun:test"
import { fillBlanks, uzDate, sendToLead } from "./send"
import { configureTg, startTgAccounts } from "./accounts"
import { fakePort, fakeSql, type SqlCall } from "./fake"
import { TgError, type TgPort } from "./port"

describe("fillBlanks", () => {
  test("fills the three blanks, keeps unknown ones", () => {
    expect(fillBlanks("Salom {ism}, {tadbir} {sana} da", { ism: "Anvar", tadbir: "Nonushta", sana: "20-noyabr" })).toBe("Salom Anvar, Nonushta 20-noyabr da")
    expect(fillBlanks("{x} {ism}", { ism: "A", tadbir: "", sana: "" })).toBe("{x} A")
  })
  test("uzDate", () => { expect(uzDate("2026-11-20")).toBe("20-noyabr"); expect(uzDate(null)).toBe("") })
})

type Target = { account_id: string; chat_id: string | null; tg_user_id: number | null; access_hash: string | null; phone: string | null }

/** A db that answers the send queries; `target` can be a row or a raised code */
function db(target: Target | string, template: { body: string; files: unknown[] } | null = null) {
  return fakeSql((t: string) => {
    if (t.includes("select id from telegram_accounts where status = 'active'") || (t.includes("select id from telegram_accounts") && t.includes("active"))) return [{ id: "acc-1" }]
    if (t.includes("tg_send_target")) { if (typeof target === "string") return Promise.reject(Object.assign(new Error(target), { code: "P0001" })) as unknown as unknown[]; return [target] }
    if (t.includes("tg_create_chat")) return [{ id: "chat-new" }]
    if (t.includes("from crm_leads")) return [{ client_name: "Bek Aliyev", event_name: "Nonushta", event_date: "2026-11-20" }]
    if (t.includes("from tg_templates")) return template ? [template] : []
    return []
  })
}

async function withPort(port: TgPort, sql: ReturnType<typeof fakeSql>["sql"]) {
  configureTg({ make: () => port, alert: async () => {} })
  await startTgAccounts(sql)
}
const logs = (calls: SqlCall[]) => calls.filter((c) => c.text.includes("tg_log_message"))
const store = (files: Record<string, number[]> = {}) => ({ get: async (p: string) => new Uint8Array(files[p] ?? [9]) })

describe("sendToLead", () => {
  test("a number not on Telegram: tg_not_found, no chat made, nothing logged", async () => {
    const port = fakePort({ resolvePhone: async () => null })
    const { sql, calls } = db({ account_id: "acc-1", chat_id: null, tg_user_id: null, access_hash: null, phone: "+998901000002" })
    await withPort(port, sql)
    await expect(sendToLead(sql, "u1", { lead_id: "L1", text: "Salom" }, store())).rejects.toEqual(new TgError("tg_not_found"))
    expect(calls.some((c) => c.text.includes("tg_create_chat"))).toBe(false)
    expect(logs(calls)).toHaveLength(0)
  })

  test("an existing chat: no phone lookup, text sent and logged with the sender and template", async () => {
    let resolved = false
    const port = fakePort({ resolvePhone: async () => { resolved = true; return null } })
    const { sql, calls } = db({ account_id: "acc-1", chat_id: "chat-1", tg_user_id: 5001, access_hash: "h1", phone: "+998901000001" }, { body: "Salom {ism}!", files: [] })
    await withPort(port, sql)
    await sendToLead(sql, "u1", { lead_id: "L1", text: "Salom {ism}!", template_id: "T1" }, store())
    expect(resolved).toBe(false)
    expect(port.sent[0]).toEqual({ kind: "text", args: [expect.objectContaining({ userId: 5001 }), "Salom Bek!"] })
    expect(logs(calls)[0].values).toEqual(["chat-1", 100, "out", "Salom Bek!", "[]", "u1", "T1", expect.any(Date)])
  })

  test("a new chat goes through tg_create_chat with the resolved user", async () => {
    const port = fakePort()
    const { sql, calls } = db({ account_id: "acc-1", chat_id: null, tg_user_id: null, access_hash: null, phone: "+998901000002" })
    await withPort(port, sql)
    await sendToLead(sql, "u1", { lead_id: "L1", text: "Salom" }, store())
    const create = calls.find((c) => c.text.includes("tg_create_chat"))
    expect(create?.values).toEqual(["acc-1", "L1", 7001, "h7", null, "Bek"])
    expect(logs(calls)[0].values[0]).toBe("chat-new")
  })

  test("files with a short text go as one send with the caption; a long text goes first, files after", async () => {
    const port = fakePort()
    const { sql, calls } = db({ account_id: "acc-1", chat_id: "chat-1", tg_user_id: 5001, access_hash: "h1", phone: null })
    await withPort(port, sql)
    const files = [{ path: "out/L1/a-narx.pdf", name: "narx.pdf", mime: "application/pdf" }]
    await sendToLead(sql, "u1", { lead_id: "L1", text: "Narxlar", files }, store({ "out/L1/a-narx.pdf": [1, 2] }))
    expect(port.sent).toHaveLength(1)
    expect(port.sent[0].kind).toBe("files")
    expect(port.sent[0].args[2]).toBe("Narxlar")
    expect(JSON.parse(logs(calls)[0].values[4] as string)).toEqual([{ path: "out/L1/a-narx.pdf", name: "narx.pdf", mime: "application/pdf", size: 2 }])

    port.sent.length = 0
    await sendToLead(sql, "u1", { lead_id: "L1", text: "x".repeat(1100), files }, store())
    expect(port.sent.map((s) => s.kind)).toEqual(["text", "files"])
    expect(port.sent[1].args[2]).toBe("")
  })

  test("db refusals become TgError; a missing live session is tg_logged_out; nothing to send is refused", async () => {
    const { sql } = db("tg_cap")
    await withPort(fakePort(), sql)
    await expect(sendToLead(sql, "u1", { lead_id: "L1", text: "a" }, store())).rejects.toEqual(new TgError("tg_cap"))

    const other = db({ account_id: "acc-9", chat_id: "c", tg_user_id: 1, access_hash: "h", phone: null })
    await expect(sendToLead(other.sql, "u1", { lead_id: "L1", text: "a" }, store())).rejects.toEqual(new TgError("tg_logged_out"))
    await expect(sendToLead(other.sql, "u1", { lead_id: "L1", text: "  " }, store())).rejects.toEqual(new TgError("tg_empty"))
    await expect(sendToLead(other.sql, "u1", { lead_id: "L1", text: "a", files: [{ path: "../x", name: "x", mime: "a/b" }] }, store())).rejects.toEqual(new TgError("tg_bad_file"))
  })

  test("a first send Telegram refuses drops the new chat (no empty chat, cap slot back); an old chat is kept", async () => {
    const port = fakePort({ sendText: async () => { throw new TgError("tg_privacy") } })
    const fresh = db({ account_id: "acc-1", chat_id: null, tg_user_id: null, access_hash: null, phone: "+998901000002" })
    await withPort(port, fresh.sql)
    await expect(sendToLead(fresh.sql, "u1", { lead_id: "L1", text: "Salom" }, store())).rejects.toEqual(new TgError("tg_privacy"))
    const drop = fresh.calls.find((c) => c.text.includes("delete from tg_chats"))
    expect(drop?.values).toEqual(["chat-new"])

    const old = db({ account_id: "acc-1", chat_id: "chat-1", tg_user_id: 5001, access_hash: "h1", phone: null })
    await expect(sendToLead(old.sql, "u1", { lead_id: "L1", text: "Salom" }, store())).rejects.toEqual(new TgError("tg_privacy"))
    expect(old.calls.some((c) => c.text.includes("delete from tg_chats"))).toBe(false)
  })
})
