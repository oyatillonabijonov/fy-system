import { afterEach, beforeEach, expect, test } from "bun:test"
import { confirmOk, confirmToken } from "./confirm"

const saved = process.env.JWT_SECRET
beforeEach(() => { process.env.JWT_SECRET = "confirm-test-secret" })
afterEach(() => { if (saved === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = saved })

const NOW = 1_800_000_000_000

test("a token verifies for the same kind, user and subject", async () => {
  const t = await confirmToken("delete_event", "u1", "e1", NOW)
  expect(t).toMatch(/^\d+\.[A-Za-z0-9_-]+$/)
  expect(await confirmOk(t, "delete_event", "u1", "e1", NOW + 1000)).toBe(true)
  expect(await confirmOk(t, "delete_event", "u1", "e1", NOW + 600_000 - 1000)).toBe(true)
})

test("another user, subject or kind fails", async () => {
  const t = await confirmToken("delete_event", "u1", "e1", NOW)
  expect(await confirmOk(t, "delete_event", "u2", "e1", NOW)).toBe(false)
  expect(await confirmOk(t, "delete_event", "u1", "e2", NOW)).toBe(false)
  expect(await confirmOk(t, "other", "u1", "e1", NOW)).toBe(false)
})

test("expired at +601 s, an altered signature or expiry, and malformed tokens fail without throwing", async () => {
  const t = await confirmToken("delete_event", "u1", "e1", NOW)
  expect(await confirmOk(t, "delete_event", "u1", "e1", NOW + 601_000)).toBe(false)
  const last = t.slice(-1)
  expect(await confirmOk(t.slice(0, -1) + (last === "A" ? "B" : "A"), "delete_event", "u1", "e1", NOW)).toBe(false)
  const [e, s] = t.split(".")
  expect(await confirmOk(`${Number(e) + 100}.${s}`, "delete_event", "u1", "e1", NOW)).toBe(false)
  for (const bad of ["", "x.y", ".", "123.", ".abc", "1.2.3", "abc"]) expect(await confirmOk(bad, "delete_event", "u1", "e1", NOW)).toBe(false)
})

test("with JWT_SECRET unset a token cannot be made and none verifies", async () => {
  const t = await confirmToken("delete_event", "u1", "e1", NOW)
  delete process.env.JWT_SECRET
  await expect(confirmToken("delete_event", "u1", "e1", NOW)).rejects.toThrow()
  expect(await confirmOk(t, "delete_event", "u1", "e1", NOW)).toBe(false)
})

test("a token signed with another secret fails", async () => {
  const t = await confirmToken("delete_event", "u1", "e1", NOW)
  process.env.JWT_SECRET = "another-secret"
  expect(await confirmOk(t, "delete_event", "u1", "e1", NOW)).toBe(false)
})
