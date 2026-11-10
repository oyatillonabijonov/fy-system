import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomToken, sha256hex } from "./crypto"
import { handleOAuth, publicBase, unauthorized } from "./oauth"
import { userByAccess } from "./store"
import { staff, testSql } from "./testdb"

const BASE = "https://x.test"
const CB = "https://claude.ai/api/mcp/auth_callback"
const created: string[] = []
const prevBase = process.env.MCP_PUBLIC_URL
beforeAll(() => { process.env.MCP_PUBLIC_URL = BASE })
afterAll(async () => {
  if (prevBase === undefined) delete process.env.MCP_PUBLIC_URL; else process.env.MCP_PUBLIC_URL = prevBase
  if (testSql && created.length) {
    await testSql`delete from public.profiles where id in ${testSql(created)}`
    await testSql`delete from auth.users where id in ${testSql(created)}`
  }
})

const mk = async (o: Parameters<typeof staff>[1] = {}) => {
  if (!testSql) throw new Error("no db")
  const id = await staff(testSql, o); created.push(id)
  return { id, email: `${id}@t.fy.uz` }
}
const challengeOf = async (v: string) => {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))
  return Buffer.from(d).toString("base64url")
}
const call = (r: Request, deps?: Parameters<typeof handleOAuth>[3]) => {
  if (!testSql) throw new Error("no db")
  return handleOAuth(r, testSql, new URL(r.url), deps)
}
const form = (body: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() })
const oauthParams = (challenge: string, extra: Record<string, string> = {}) =>
  ({ response_type: "code", client_id: "cid", redirect_uri: CB, code_challenge: challenge, code_challenge_method: "S256", ...extra })
const authPost = (email: string, password: string, challenge: string, extra: Record<string, string> = {}) =>
  new Request(`${BASE}/mcp/authorize`, form({ ...oauthParams(challenge, extra), email, password }))
const tokenReq = (body: Record<string, string>) => new Request(`${BASE}/mcp/token`, form(body))
const countCodes = async (uid: string) => (await testSql!`select count(*)::int n from public.mcp_auth_codes where user_id = ${uid}`)[0]!.n as number

/** sign in as the fixture and return the code from the redirect */
async function signIn(uid: string, email: string, challenge: string, state = "st1") {
  const res = await call(authPost(email, "pw", challenge, { state }), { checkPassword: async () => uid })
  const loc = new URL(res!.headers.get("location")!)
  return { res: res!, loc, code: loc.searchParams.get("code")! }
}

test.skipIf(!testSql)("metadata documents are exact and no-store", async () => {
  const a = await call(new Request(`${BASE}/.well-known/oauth-protected-resource/mcp`))
  const b = await call(new Request(`${BASE}/.well-known/oauth-protected-resource`))
  const want = { resource: `${BASE}/mcp`, authorization_servers: [BASE], scopes_supported: ["crm", "offline_access"], bearer_methods_supported: ["header"] }
  expect(await a!.json()).toEqual(want); expect(await b!.json()).toEqual(want)
  const s = await call(new Request(`${BASE}/.well-known/oauth-authorization-server`))
  expect(await s!.json()).toEqual({
    issuer: BASE, authorization_endpoint: `${BASE}/mcp/authorize`, token_endpoint: `${BASE}/mcp/token`,
    registration_endpoint: `${BASE}/mcp/register`, response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"], scopes_supported: ["crm", "offline_access"],
  })
  for (const r of [a!, b!, s!]) expect(r.headers.get("cache-control")).toBe("no-store")
})

test.skipIf(!testSql)("unauthorized() is a 401 pointing at the resource metadata", () => {
  const r = unauthorized()
  expect(r.status).toBe(401)
  expect(r.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`)
  expect(r.headers.get("cache-control")).toBe("no-store")
})

test.skipIf(!testSql)("routing: unknown path null, wrong method 405, no base null", async () => {
  expect(await call(new Request(`${BASE}/mcp`))).toBeNull()
  expect(await call(new Request(`${BASE}/mcp/token`))).not.toBeNull()
  expect((await call(new Request(`${BASE}/mcp/token`)))!.status).toBe(405)
  expect((await call(new Request(`${BASE}/mcp/register`)))!.status).toBe(405)
  delete process.env.MCP_PUBLIC_URL
  try { expect(publicBase()).toBeUndefined(); expect(await call(new Request(`${BASE}/.well-known/oauth-authorization-server`))).toBeNull() }
  finally { process.env.MCP_PUBLIC_URL = BASE }
})

test.skipIf(!testSql)("register: Claude's callback is 201, a foreign one is invalid_redirect_uri", async () => {
  const ok = await call(new Request(`${BASE}/mcp/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [CB] }) }))
  expect(ok!.status).toBe(201)
  const j = (await ok!.json()) as { client_id: string; redirect_uris: string[]; token_endpoint_auth_method: string }
  expect(j.client_id.length).toBeGreaterThan(20); expect(j.redirect_uris).toEqual([CB]); expect(j.token_endpoint_auth_method).toBe("none")
  const bad = await call(new Request(`${BASE}/mcp/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [CB, "https://evil.com/cb"] }) }))
  expect(bad!.status).toBe(400); expect(await bad!.json()).toEqual({ error: "invalid_redirect_uri" })
  const none = await call(new Request(`${BASE}/mcp/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }))
  expect(none!.status).toBe(400)
})

test.skipIf(!testSql)("authorize GET refuses bad requests without redirecting", async () => {
  const ch = await challengeOf("v")
  const q = (p: Record<string, string>) => new Request(`${BASE}/mcp/authorize?${new URLSearchParams(p)}`)
  const foreign = await call(q(oauthParams(ch, { redirect_uri: "https://evil.com/cb" })))
  expect(foreign!.status).toBe(400); expect(foreign!.headers.get("location")).toBeNull()
  const { code_challenge: _c, ...noChallenge } = oauthParams(ch)
  const nc = await call(q(noChallenge))
  expect(nc!.status).toBe(400); expect(nc!.headers.get("location")).toBeNull()
  expect((await call(q(oauthParams(ch, { code_challenge_method: "plain" }))))!.status).toBe(400)
  expect((await call(q(oauthParams(ch, { resource: "https://other.test/mcp" }))))!.status).toBe(400)
  expect((await call(q(oauthParams(ch, { resource: `${BASE}/mcp` }))))!.status).toBe(200)
})

test.skipIf(!testSql)("authorize GET escapes hostile state in the page", async () => {
  const ch = await challengeOf("v")
  const state = `"><script>alert(1)</script>`
  const res = await call(new Request(`${BASE}/mcp/authorize?${new URLSearchParams(oauthParams(ch, { state }))}`))
  expect(res!.status).toBe(200)
  const body = await res!.text()
  expect(body).not.toContain("<script>alert(1)")
  expect(body).not.toContain("<script")
  expect(body).toContain("&#60;script&#62;alert(1)")
  expect(body).toContain("Kirish va ruxsat berish")
  expect(body).toContain("claude.ai")
  expect(res!.headers.get("cache-control")).toBe("no-store")
})

test.skipIf(!testSql)("authorize POST with a wrong password shows the error and saves no code", async () => {
  const u = await mk()
  const res = await call(authPost(u.email, "bad", await challengeOf("v")), { checkPassword: async () => null })
  expect(res!.status).toBe(200)
  expect(await res!.text()).toContain("Email yoki parol noto&#39;g&#39;ri")
  expect(await countCodes(u.id)).toBe(0)
})

test.skipIf(!testSql)("authorize POST: 5 wrong passwords throttle the 6th without calling GoTrue", async () => {
  const u = await mk()
  let calls = 0
  const deps = { checkPassword: async () => { calls++; return null } }
  for (let i = 0; i < 5; i++) await call(authPost(u.email, "bad", await challengeOf("v")), deps)
  const res = await call(authPost(u.email, "bad", await challengeOf("v")), deps)
  expect(await res!.text()).toContain("Juda ko&#39;p urinish")
  expect(calls).toBe(5)
})

test.skipIf(!testSql)("authorize POST refuses inactive staff and an id with no profile", async () => {
  const off = await mk({ active: false })
  const r1 = await call(authPost(`${off.id}@x.fy.uz`, "pw", await challengeOf("v")), { checkPassword: async () => off.id })
  expect(r1!.status).toBe(200); expect(r1!.headers.get("location")).toBeNull()
  expect(await r1!.text()).toContain("Bu akkaunt xodim emas yoki o&#39;chirilgan.")
  expect(await countCodes(off.id)).toBe(0)
  const ghost = crypto.randomUUID()
  const r2 = await call(authPost(`${ghost}@x.fy.uz`, "pw", await challengeOf("v")), { checkPassword: async () => ghost })
  expect(r2!.headers.get("location")).toBeNull()
  expect(await r2!.text()).toContain("Bu akkaunt xodim emas")
})

test.skipIf(!testSql)("authorize POST with tampered hidden fields never redirects to a foreign URI", async () => {
  const u = await mk()
  const res = await call(authPost(u.email, "pw", await challengeOf("v"), { redirect_uri: "https://evil.com/cb" }), { checkPassword: async () => u.id })
  expect(res!.status).toBe(400); expect(res!.headers.get("location")).toBeNull()
  expect(await countCodes(u.id)).toBe(0)
})

test.skipIf(!testSql)("happy path: code once, tokens, reuse refused", async () => {
  const u = await mk()
  const verifier = randomToken("")
  const { res, loc, code } = await signIn(u.id, u.email, await challengeOf(verifier), "a&b=c d")
  expect(res.status).toBe(302)
  expect(loc.origin + loc.pathname).toBe(CB)
  expect(loc.searchParams.get("state")).toBe("a&b=c d")
  expect(code.length).toBeGreaterThan(20)
  // only the hash is stored
  const rows = await testSql!`select code_hash from public.mcp_auth_codes where user_id = ${u.id}`
  expect(rows[0]!.code_hash).toBe(await sha256hex(code)); expect(rows[0]!.code_hash).not.toBe(code)

  const t = await call(tokenReq({ grant_type: "authorization_code", code, redirect_uri: CB, client_id: "cid", code_verifier: verifier }))
  expect(t!.status).toBe(200); expect(t!.headers.get("cache-control")).toBe("no-store")
  const j = (await t!.json()) as { access_token: string; refresh_token: string; token_type: string; expires_in: number; scope: string }
  expect(j.access_token.startsWith("fya_")).toBe(true); expect(j.refresh_token.startsWith("fyr_")).toBe(true)
  expect(j.token_type).toBe("Bearer"); expect(j.expires_in).toBe(3600); expect(j.scope).toBe("crm offline_access")
  expect(await userByAccess(testSql!, j.access_token)).toBe(u.id)
  const stored = await testSql!`select access_hash, refresh_hash from public.mcp_connections where user_id = ${u.id}`
  expect(stored[0]!.access_hash).toBe(await sha256hex(j.access_token)); expect(stored[0]!.refresh_hash).toBe(await sha256hex(j.refresh_token))

  const again = await call(tokenReq({ grant_type: "authorization_code", code, redirect_uri: CB, client_id: "cid", code_verifier: verifier }))
  expect(again!.status).toBe(400); expect(await again!.json()).toEqual({ error: "invalid_grant" })
})

test.skipIf(!testSql)("token refuses a wrong verifier, another redirect_uri or client_id, and an expired code", async () => {
  const u = await mk()
  const verifier = randomToken("")
  const grant = (code: string, o: Record<string, string> = {}) =>
    tokenReq({ grant_type: "authorization_code", code, redirect_uri: CB, client_id: "cid", code_verifier: verifier, ...o })
  const bad = async (req: Request) => { const r = await call(req); expect(r!.status).toBe(400); expect(await r!.json()).toEqual({ error: "invalid_grant" }) }
  const ch = await challengeOf(verifier)
  await bad(grant((await signIn(u.id, u.email, ch)).code, { code_verifier: "wrong" }))
  await bad(grant((await signIn(u.id, u.email, ch)).code, { redirect_uri: "http://localhost:1/callback" }))
  await bad(grant((await signIn(u.id, u.email, ch)).code, { client_id: "other" }))
  const { code } = await signIn(u.id, u.email, ch)
  await testSql!`update public.mcp_auth_codes set expires_at = now() - interval '1 second' where code_hash = ${await sha256hex(code)}`
  await bad(grant(code))
  await bad(tokenReq({ grant_type: "authorization_code", code: "nope" }))
  const gt = await call(tokenReq({ grant_type: "password" }))
  expect(gt!.status).toBe(400); expect(await gt!.json()).toEqual({ error: "unsupported_grant_type" })
  expect(await countCodes(u.id)).toBe(0)
})

test.skipIf(!testSql)("a code taken by a deactivated user gives no connection", async () => {
  const u = await mk()
  const verifier = randomToken("")
  const { code } = await signIn(u.id, u.email, await challengeOf(verifier))
  await testSql!`update public.profiles set is_active = false where id = ${u.id}`
  const r = await call(tokenReq({ grant_type: "authorization_code", code, redirect_uri: CB, client_id: "cid", code_verifier: verifier }))
  expect(r!.status).toBe(400)
  expect((await testSql!`select count(*)::int n from public.mcp_connections where user_id = ${u.id}`)[0]!.n).toBe(0)
})

const refreshDays = async (uid: string) =>
  (await testSql!`select extract(epoch from refresh_expires_at - now()) / 86400 as d from public.mcp_connections where user_id = ${uid}`)[0]!.d as number
const expect60 = (d: number) => { expect(Number(d)).toBeGreaterThan(59); expect(Number(d)).toBeLessThan(61) }

async function connect(u: { id: string; email: string }) {
  const verifier = randomToken("")
  const { code } = await signIn(u.id, u.email, await challengeOf(verifier))
  const t = await call(tokenReq({ grant_type: "authorization_code", code, redirect_uri: CB, client_id: "cid", code_verifier: verifier }))
  return (await t!.json()) as { access_token: string; refresh_token: string }
}
const refresh = (rt: string) => call(tokenReq({ grant_type: "refresh_token", refresh_token: rt }))

test.skipIf(!testSql)("refresh rotates the pair; the old access token dies", async () => {
  const u = await mk()
  const first = await connect(u)
  expect60(await refreshDays(u.id))
  await testSql!`update public.mcp_connections set refresh_expires_at = now() + interval '1 day' where user_id = ${u.id}`
  const r = await refresh(first.refresh_token)
  expect(r!.status).toBe(200)
  const next = (await r!.json()) as { access_token: string; refresh_token: string; expires_in: number }
  expect60(await refreshDays(u.id))
  expect(next.access_token).not.toBe(first.access_token); expect(next.refresh_token).not.toBe(first.refresh_token)
  expect(next.expires_in).toBe(3600)
  expect(await userByAccess(testSql!, first.access_token)).toBeNull()
  expect(await userByAccess(testSql!, next.access_token)).toBe(u.id)
})

test.skipIf(!testSql)("replaying the old refresh token kills the whole connection", async () => {
  const u = await mk()
  const first = await connect(u)
  const next = (await (await refresh(first.refresh_token))!.json()) as { access_token: string; refresh_token: string }
  const replay = await refresh(first.refresh_token)
  expect(replay!.status).toBe(400); expect(await replay!.json()).toEqual({ error: "invalid_grant" })
  expect(await userByAccess(testSql!, next.access_token)).toBeNull()
  expect((await refresh(next.refresh_token))!.status).toBe(400)
  expect((await testSql!`select count(*)::int n from public.mcp_connections where user_id = ${u.id}`)[0]!.n).toBe(0)
  expect((await refresh("fyr_unknown"))!.status).toBe(400)
})

test.skipIf(!testSql)("a deactivated user loses access and refresh", async () => {
  const u = await mk()
  const c = await connect(u)
  expect(await userByAccess(testSql!, c.access_token)).toBe(u.id)
  await testSql!`update public.profiles set is_active = false where id = ${u.id}`
  expect(await userByAccess(testSql!, c.access_token)).toBeNull()
  const r = await refresh(c.refresh_token)
  expect(r!.status).toBe(400); expect(await r!.json()).toEqual({ error: "invalid_grant" })
})

test.skipIf(!testSql)("an expired access token is refused", async () => {
  const u = await mk()
  const c = await connect(u)
  await testSql!`update public.mcp_connections set access_expires_at = now() - interval '1 second' where user_id = ${u.id}`
  expect(await userByAccess(testSql!, c.access_token)).toBeNull()
})
