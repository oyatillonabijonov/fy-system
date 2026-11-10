import { expect, test } from "bun:test"
import { checkPassword, noteFailure, throttled } from "./gotrue"

const fake = (status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    seen.url = String(url); seen.init = init
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch

test("200 returns the user id and posts JSON to GoTrue's password grant", async () => {
  const seen: { url?: string; init?: RequestInit } = {}
  const id = await checkPassword("a@fy.uz", "pw", fake(200, { user: { id: "u1" } }, seen))
  expect(id).toBe("u1")
  expect(seen.url).toBe("http://auth:9999/token?grant_type=password")
  expect(seen.init?.method).toBe("POST")
  expect(new Headers(seen.init?.headers).get("content-type")).toBe("application/json")
  expect(JSON.parse(String(seen.init?.body))).toEqual({ email: "a@fy.uz", password: "pw" })
})

test("400 is wrong credentials (null)", async () => {
  expect(await checkPassword("a@fy.uz", "bad", fake(400, { error: "invalid_grant" }))).toBeNull()
})

test("500 throws", async () => {
  await expect(checkPassword("a@fy.uz", "pw", fake(500, {}))).rejects.toThrow()
})

test("throttle: false after 4 failures, true after the 5th, false after 15 min + 1 s", () => {
  const e = "throttle-test@fy.uz", t0 = 1_000_000
  for (let i = 0; i < 4; i++) noteFailure(e, t0 + i)
  expect(throttled(e, t0 + 10)).toBe(false)
  noteFailure(e, t0 + 4)
  expect(throttled(e, t0 + 10)).toBe(true)
  expect(throttled(e, t0 + 4 + 15 * 60_000 + 1000)).toBe(false)
})
