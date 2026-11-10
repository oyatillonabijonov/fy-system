import { expect, test } from "bun:test"
import { checkPassword, clearAttempts, releaseAttempt, reserveAttempt, throttleSize } from "./gotrue"

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

const W = 15 * 60_000

test("throttle: the 6th reservation in the window is refused, allowed again after 15 min + 1 s", () => {
  const e = "throttle-test@fy.uz", t0 = 1_000_000
  for (let i = 0; i < 5; i++) expect(reserveAttempt(e, t0 + i)).toBe(true)
  expect(reserveAttempt(e, t0 + 10)).toBe(false)
  expect(reserveAttempt(e, t0 + 4 + W + 1000)).toBe(true)
})

test("throttle: the e-mail is normalised, a cleared e-mail starts fresh", () => {
  const t0 = 2_000_000
  for (let i = 0; i < 5; i++) reserveAttempt(" Clear@FY.uz ", t0 + i)
  expect(reserveAttempt("clear@fy.uz", t0 + 10)).toBe(false)
  clearAttempts("clear@fy.uz")
  expect(reserveAttempt("clear@fy.uz", t0 + 11)).toBe(true)
})

test("throttle: a released attempt does not consume the budget", () => {
  const e = "release@fy.uz", t0 = 3_000_000
  for (let i = 0; i < 5; i++) reserveAttempt(e, t0 + i)
  releaseAttempt(e, t0 + 4)
  expect(reserveAttempt(e, t0 + 10)).toBe(true)
  expect(reserveAttempt(e, t0 + 11)).toBe(false)
})

test("throttle: stale entries are swept so the map cannot grow without bound", () => {
  const t0 = 4_000_000
  for (let i = 0; i < 10_100; i++) reserveAttempt(`sweep${i}@fy.uz`, t0)
  expect(throttleSize()).toBeGreaterThan(10_000)
  reserveAttempt("fresh@fy.uz", t0 + W + 1000)
  expect(throttleSize()).toBeLessThan(10)
})
