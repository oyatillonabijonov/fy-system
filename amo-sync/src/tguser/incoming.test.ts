import { describe, expect, test } from "bun:test"
import { handleIncoming, shouldStore } from "./incoming"
import { fakePort, fakeSql, incoming } from "./fake"

const noStore = { put: async () => { throw new Error("no upload expected") } }

describe("shouldStore", () => {
  test("private chats with people only", () => {
    expect(shouldStore(incoming())).toBe(true)
    expect(shouldStore(incoming({ out: true }))).toBe(true)
    expect(shouldStore(incoming({ isBot: true }))).toBe(false)
    expect(shouldStore(incoming({ isPrivate: false }))).toBe(false)
    expect(shouldStore(incoming({ isService: true }))).toBe(false)
  })
})

describe("handleIncoming", () => {
  test("links the chat, then logs an incoming message", async () => {
    const { sql, calls } = fakeSql((t) => (t.includes("tg_link_chat") ? [{ id: "chat-1" }] : [{ id: "m" }]))
    await handleIncoming(sql, "acc-1", fakePort(), incoming(), noStore)
    expect(calls[0].text).toContain("tg_link_chat")
    expect(calls[0].values.slice(0, 6)).toEqual(["acc-1", 5001, "h1", "ali", "Ali", "998901000001"])
    expect(calls[1].text).toContain("tg_log_message")
    expect(calls[1].values).toEqual(["chat-1", 10, "in", "Salom", "[]", null, null, new Date("2026-11-17T10:00:00Z")])
  })

  test("a message typed in the phone app is stored as out with no sender", async () => {
    const { sql, calls } = fakeSql((t) => (t.includes("tg_link_chat") ? [{ id: "chat-1" }] : []))
    await handleIncoming(sql, "acc-1", fakePort(), incoming({ out: true, text: "Javob" }), noStore)
    expect(calls[1].values.slice(2, 6)).toEqual(["out", "Javob", "[]", null])
  })

  test("an ignored chat stores nothing and downloads nothing", async () => {
    const { sql, calls } = fakeSql(() => [{ id: null }])
    let downloaded = false
    await handleIncoming(sql, "acc-1", fakePort({ download: async () => { downloaded = true; return null } }),
      incoming({ media: { name: "a.pdf", mime: "application/pdf", size: 10 } }), noStore)
    expect(calls).toHaveLength(1)
    expect(downloaded).toBe(false)
  })

  test("a file up to 20 MB goes to the bucket; a bigger one becomes a line", async () => {
    const puts: string[] = []
    const store = { put: async (path: string) => { puts.push(path) } }
    const { sql, calls } = fakeSql((t) => (t.includes("tg_link_chat") ? [{ id: "chat-1" }] : []))
    await handleIncoming(sql, "acc-1", fakePort(), incoming({ text: "", media: { name: "narx.pdf", mime: "application/pdf", size: 3 } }), store)
    expect(puts).toEqual(["in/chat-1/10-narx.pdf"])
    expect(JSON.parse(calls[1].values[4] as string)).toEqual([{ path: "in/chat-1/10-narx.pdf", name: "narx.pdf", mime: "application/pdf", size: 3 }])

    await handleIncoming(sql, "acc-1", fakePort(), incoming({ msgId: 11, text: "", media: { name: "kino.mp4", mime: "video/mp4", size: 52_428_800 } }), store)
    expect(puts).toHaveLength(1)
    expect(calls[3].values[3]).toBe("📎 Fayl Telegramda (50 MB)")
  })
})
