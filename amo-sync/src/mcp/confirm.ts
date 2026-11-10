// A short-lived proof that the same user asked twice about the same thing: an HMAC with JWT_SECRET over kind, user, subject and expiry.
import { timingSafeEqual } from "node:crypto"

const TTL = 600

async function sign(kind: string, uid: string, subject: string, exp: number): Promise<Uint8Array> {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error("JWT_SECRET is not set")
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${kind}.${uid}.${subject}.${exp}`)))
}

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url")

/** "<exp>.<sig>", valid for 600 s; throws when JWT_SECRET is unset */
export async function confirmToken(kind: string, uid: string, subject: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + TTL
  return `${exp}.${b64u(await sign(kind, uid, subject, exp))}`
}

export async function confirmOk(token: string, kind: string, uid: string, subject: string, now = Date.now()): Promise<boolean> {
  try {
    if (!process.env.JWT_SECRET) return false
    const [e, s, ...rest] = token.split(".")
    if (!e || !s || rest.length || !/^\d{1,12}$/.test(e)) return false
    const exp = Number(e)
    const want = Buffer.from(b64u(await sign(kind, uid, subject, exp)))
    const got = Buffer.from(s)
    return want.length === got.length && timingSafeEqual(want, got) && exp * 1000 > now
  } catch {
    return false
  }
}
