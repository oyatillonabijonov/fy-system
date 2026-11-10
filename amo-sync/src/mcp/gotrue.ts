// Password check against GoTrue (the platform's own login) + the in-memory login throttle. Passwords are never stored or logged.

const WINDOW = 15 * 60_000
const MAX_FAILURES = 5
const SWEEP_AT = 10_000
const attempts = new Map<string, number[]>()
const key = (email: string) => email.trim().toLowerCase()
const fresh = (list: number[], now: number) => list.filter((t) => now - t < WINDOW)

/** The user's id, null for wrong credentials (GoTrue 400), a throw for anything else (outage ≠ wrong password). */
export async function checkPassword(email: string, password: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const base = (process.env.GOTRUE_URL || "http://auth:9999").replace(/\/+$/, "")
  const res = await fetchFn(`${base}/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) })
  if (res.status === 400) return null
  if (!res.ok) throw new Error(`GoTrue ${res.status}`)
  const j = (await res.json()) as { user?: { id?: unknown } }
  if (typeof j.user?.id !== "string" || !j.user.id) throw new Error("GoTrue: no user id")
  return j.user.id
}

/** Counts an attempt BEFORE the password goes to GoTrue: false once 5 are already counted in 15 minutes, so parallel guesses can't burst past it. */
export function reserveAttempt(email: string, now = Date.now()): boolean {
  if (attempts.size > SWEEP_AT) for (const [k, list] of attempts) if (!fresh(list, now).length) attempts.delete(k)
  const k = key(email), list = fresh(attempts.get(k) ?? [], now)
  if (list.length >= MAX_FAILURES) { attempts.set(k, list); return false }
  attempts.set(k, [...list, now])
  return true
}

/** Un-counts one attempt (a GoTrue outage is not the user's failure). */
export function releaseAttempt(email: string, at: number): void {
  const k = key(email), list = attempts.get(k) ?? []
  const i = list.indexOf(at)
  if (i < 0) return
  const rest = list.filter((_, j) => j !== i)
  if (rest.length) attempts.set(k, rest); else attempts.delete(k)
}

/** A successful sign-in wipes the e-mail's count. */
export function clearAttempts(email: string): void {
  attempts.delete(key(email))
}

export const throttleSize = () => attempts.size
