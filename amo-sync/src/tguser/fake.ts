// Test doubles for the Telegram worker: a recording sql tag and a scriptable TgPort.
import type { Sql } from "postgres"
import type { TgIncoming, TgPeer, TgPort } from "./port"

export type SqlCall = { text: string; values: unknown[] }

/** sql`…` that records every query; `answer(text)` decides the rows */
export function fakeSql(answer: (text: string, values: unknown[]) => unknown[] = () => []): { sql: Sql; calls: SqlCall[] } {
  const calls: SqlCall[] = []
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?")
    calls.push({ text, values })
    return Promise.resolve(answer(text, values))
  }
  // sql.json(v) passes the value itself, so tests see the array that goes to the database
  return { sql: Object.assign(tag, { json: (v: unknown) => v }) as unknown as Sql, calls }
}

export const peer = (over: Partial<TgPeer> = {}): TgPeer => ({ userId: 5001, accessHash: "h1", username: "ali", title: "Ali", phone: "998901000001", ...over })

export const incoming = (over: Partial<TgIncoming> = {}): TgIncoming => ({
  peer: peer(), msgId: 10, out: false, isBot: false, isPrivate: true, isService: false, text: "Salom", media: null, date: new Date("2026-11-17T10:00:00Z"), ...over,
})

export function fakePort(over: Partial<TgPort> = {}): TgPort & { sent: { kind: string; args: unknown[] }[]; fireLoggedOut(): void } {
  const sent: { kind: string; args: unknown[] }[] = []
  const lost: (() => void)[] = []
  return {
    sent,
    fireLoggedOut: () => lost.forEach((cb) => cb()),
    start: async () => ({ id: 1, name: "FY", phone: "998900000000" }),
    resume: async () => true,
    ping: async () => {},
    onMessage: () => {},
    onReadOutbox: () => {},
    onLoggedOut: (cb) => { lost.push(cb) },
    resolvePhone: async () => peer({ userId: 7001, accessHash: "h7", username: null, title: "Bek" }),
    sendText: async (...args) => { sent.push({ kind: "text", args }); return 100 },
    sendFiles: async (...args) => { sent.push({ kind: "files", args }); return [101, 102].slice(0, args[1].length) },
    download: async () => new Uint8Array([1, 2, 3]),
    readHistory: async (...args) => { sent.push({ kind: "read", args }) },
    logout: async () => {},
    close: async () => {},
    ...over,
  }
}
