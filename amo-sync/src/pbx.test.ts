import { expect, test } from "bun:test"
import { verifyJwt } from "./pbx"

const SECRET = "test-secret-at-least-32-characters-long"
const b64 = (v: string | Uint8Array) => Buffer.from(v).toString("base64url")

async function sign(claims: object, secret = SECRET, alg = "HS256") {
  const head = `${b64(JSON.stringify({ alg, typ: "JWT" }))}.${b64(JSON.stringify(claims))}`
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return `${head}.${b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(head))))}`
}
const exp = () => Math.floor(Date.now() / 1000) + 600

test("a valid session token gives its user id", async () => {
  expect(await verifyJwt(await sign({ sub: "u1", role: "authenticated", exp: exp() }), SECRET)).toBe("u1")
})

test("wrong secret, expired, anon role, tampered or alg=none are refused", async () => {
  expect(await verifyJwt(await sign({ sub: "u1", role: "authenticated", exp: exp() }, "another-secret-another-secret-xx"), SECRET)).toBeNull()
  expect(await verifyJwt(await sign({ sub: "u1", role: "authenticated", exp: 1000 }), SECRET)).toBeNull()
  expect(await verifyJwt(await sign({ role: "anon", exp: exp() }), SECRET)).toBeNull()
  const t = await sign({ sub: "u1", role: "authenticated", exp: exp() })
  const [h, , s] = t.split(".")
  expect(await verifyJwt(`${h}.${b64(JSON.stringify({ sub: "admin", role: "authenticated", exp: exp() }))}.${s}`, SECRET)).toBeNull()
  expect(await verifyJwt(await sign({ sub: "u1", role: "authenticated", exp: exp() }, SECRET, "none"), SECRET)).toBeNull()
  expect(await verifyJwt("garbage", SECRET)).toBeNull()
})
