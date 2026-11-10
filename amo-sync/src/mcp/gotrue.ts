// Password check against GoTrue (the platform's own login) + the in-memory login throttle. Passwords are never stored or logged.

const WINDOW = 15 * 60_000
const MAX_FAILURES = 5
const failures = new Map<string, number[]>()
const key = (email: string) => email.trim().toLowerCase()
const recent = (email: string, now: number) => (failures.get(key(email)) ?? []).filter((t) => now - t < WINDOW)

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

/** True after 5 failures in 15 minutes for this e-mail. */
export function throttled(email: string, now = Date.now()): boolean {
  return recent(email, now).length >= MAX_FAILURES
}

export function noteFailure(email: string, now = Date.now()): void {
  failures.set(key(email), [...recent(email, now), now])
}
