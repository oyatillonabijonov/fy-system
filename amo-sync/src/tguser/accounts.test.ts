import { describe, expect, test } from "bun:test"
import { beginLogin, configureTg, loginState, portFor, startTgAccounts, submitPassword } from "./accounts"
import { fakePort, fakeSql } from "./fake"

const tick = () => new Promise((r) => setTimeout(r, 5))

describe("QR login", () => {
  test("qr → password → done, account becomes active", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    let typed = ""
    const port = fakePort({
      start: async (h) => {
        await tick()
        h.qr("tg://login?token=abc", new Date())
        await gate
        typed = await h.password()
        return { id: 777, name: "FY Sotuv", phone: "998900000001" }
      },
    })
    const { sql, calls } = fakeSql((t) => (t.includes("insert into telegram_accounts") ? [{ id: "acc-1" }] : []))
    configureTg({ make: () => port, alert: async () => {} })
    const id = await beginLogin(sql, null, "Umumiy")
    expect(id).toBe("acc-1")
    expect(loginState(id)).toEqual({ state: "wait" })   // before Telegram hands a QR: still waiting, not an error
    await tick()
    expect(loginState(id)).toEqual({ state: "qr", url: "tg://login?token=abc" })
    release()
    await tick()
    expect(loginState(id)).toEqual({ state: "password" })
    submitPassword(id, "sir")
    await tick()
    expect(typed).toBe("sir")
    expect(loginState(id)).toEqual({ state: "done", title: "FY Sotuv" })
    const upd = calls.find((c) => c.text.includes("status = 'active'"))
    expect(upd?.values).toContain(777)
    expect(portFor(id)).toBe(port)
  })

  test("a failed login says why and drops the pending row", async () => {
    const port = fakePort({ start: async () => { throw new Error("PASSWORD_HASH_INVALID") } })
    const { sql, calls } = fakeSql((t) => (t.includes("insert into telegram_accounts") ? [{ id: "acc-2" }] : []))
    configureTg({ make: () => port, alert: async () => {} })
    const id = await beginLogin(sql, null, "X")
    await tick()
    expect(loginState(id)).toEqual({ state: "error", message: "Parol noto'g'ri — qaytadan ulang" })
    expect(calls.some((c) => c.text.includes("delete from telegram_accounts"))).toBe(true)
  })
})

describe("session lost", () => {
  test("marks the account logged out and alerts once", async () => {
    const port = fakePort()
    let n = 0
    const alerts: string[] = []
    const { sql, calls } = fakeSql((t) => {
      if (t.includes("where status = 'active'") && t.includes("select id")) return [{ id: "acc-3" }]
      if (t.includes("status = 'logged_out'")) return n++ === 0 ? [{ title: "Umumiy" }] : []
      return []
    })
    configureTg({ make: () => port, alert: async (msg) => { alerts.push(msg) } })
    await startTgAccounts(sql)
    expect(portFor("acc-3")).toBe(port)
    port.fireLoggedOut()
    port.fireLoggedOut()
    await tick()
    expect(alerts).toEqual(["Telegram akkaunt uzildi: Umumiy — Integratsiyalar'da qayta ulang"])
    expect(portFor("acc-3")).toBeUndefined()
    expect(calls.filter((c) => c.text.includes("status = 'logged_out'")).length).toBeGreaterThanOrEqual(1)
  })

  test("a saved session that no longer works is marked lost on start", async () => {
    const alerts: string[] = []
    const { sql } = fakeSql((t) => {
      if (t.includes("where status = 'active'") && t.includes("select id")) return [{ id: "acc-4" }]
      if (t.includes("status = 'logged_out'")) return [{ title: "Eski" }]
      return []
    })
    configureTg({ make: () => fakePort({ resume: async () => false }), alert: async (msg) => { alerts.push(msg) } })
    await startTgAccounts(sql)
    expect(portFor("acc-4")).toBeUndefined()
    expect(alerts).toHaveLength(1)
  })

  test("a session ended while running is noticed by the periodic check", async () => {
    const alerts: string[] = []
    const port = fakePort()
    port.ping = async () => { port.fireLoggedOut() }
    const { sql } = fakeSql((t) => {
      if (t.includes("where status = 'active'") && t.includes("select id")) return [{ id: "acc-5" }]
      if (t.includes("status = 'logged_out'")) return [{ title: "Umumiy" }]
      return []
    })
    configureTg({ make: () => port, alert: async (msg) => { alerts.push(msg) }, pingMs: 10 })
    await startTgAccounts(sql)
    await new Promise((r) => setTimeout(r, 40))
    expect(alerts).toHaveLength(1)
    expect(portFor("acc-5")).toBeUndefined()
  })
})
