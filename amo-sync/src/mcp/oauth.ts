// The connector's own small OAuth server (RFC 9728 / 8414 / 7591, PKCE S256): metadata, registration, login page, token endpoint.
// A code only ever goes to a redirect_uri that passes redirectAllowed — checked on every request, hidden fields included.
import type { Sql } from "postgres"
import { pkceOk, randomToken, redirectAllowed } from "./crypto"
import { checkPassword as realCheck, clearAttempts, releaseAttempt, reserveAttempt } from "./gotrue"
import { activeStaff, openConnection, refreshConnection, saveCode, takeCode } from "./store"

const SCOPES = ["crm", "offline_access"]
const ERR = {
  creds: "Email yoki parol noto'g'ri",
  throttle: "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring.",
  staff: "Bu akkaunt xodim emas yoki o'chirilgan.",
  bad: "So'rov noto'g'ri. Claude'da ulanishni qaytadan boshlang.",
  down: "Xizmat vaqtincha ishlamayapti. Birozdan keyin qayta urinib ko'ring.",
}

/** MCP_PUBLIC_URL without a trailing slash, read on every call. */
export function publicBase(): string | undefined {
  return process.env.MCP_PUBLIC_URL?.replace(/\/+$/, "") || undefined
}

const NO_STORE = { "cache-control": "no-store" }
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { ...NO_STORE, ...headers } })
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { ...NO_STORE, "content-type": "application/json", "www-authenticate": `Bearer resource_metadata="${publicBase()}/.well-known/oauth-protected-resource/mcp"` },
  })
}

interface AuthParams { client_id: string; redirect_uri: string; code_challenge: string; state: string | null; resource: string | null }

/** The authorization request, or null if anything is off — then the page is an error, never a redirect. */
function authParams(p: URLSearchParams, base: string): AuthParams | null {
  const client_id = p.get("client_id") ?? "", redirect_uri = p.get("redirect_uri") ?? "", code_challenge = p.get("code_challenge") ?? ""
  const state = p.get("state"), resource = p.get("resource")
  if (p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256") return null
  if (!client_id || client_id.length > 200 || !redirectAllowed(redirect_uri) || !/^[A-Za-z0-9_-]{43}$/.test(code_challenge)) return null
  if ((state !== null && state.length > 2000) || (resource !== null && resource !== `${base}/mcp`)) return null
  return { client_id, redirect_uri, code_challenge, state, resource }
}

function page(a: AuthParams | null, status: number, error?: string, email = ""): Response {
  const hidden = a ? Object.entries({ response_type: "code", code_challenge_method: "S256", client_id: a.client_id, redirect_uri: a.redirect_uri, code_challenge: a.code_challenge, state: a.state, resource: a.resource })
    .filter((e): e is [string, string] => e[1] !== null).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join("") : ""
  const form = a ? `<p class="note">Kirgach, ${esc(new URL(a.redirect_uri).host)} manziliga qaytasiz.</p>
<form method="post" action="/mcp/authorize">${hidden}
<label>Email<input type="email" name="email" value="${esc(email)}" autocomplete="username" required></label>
<label>Parol<input type="password" name="password" autocomplete="current-password" required></label>
<button type="submit">Kirish va ruxsat berish</button></form>` : ""
  const html = `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FY Tizim — Claude ulanishi</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f4f5;color:#111;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{box-sizing:border-box;width:min(420px,calc(100vw - 32px));background:#fff;border-radius:16px;padding:28px}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 16px}.note{color:#666;font-size:14px}.err{color:#b42318;background:#fef3f2;border-radius:10px;padding:10px 12px}
label{display:block;font-size:14px;color:#444;margin-bottom:14px}input:not([type=hidden]){box-sizing:border-box;display:block;width:100%;margin-top:6px;padding:12px 14px;font:inherit;font-size:16px;border:1px solid #d4d4d8;border-radius:10px}
button{width:100%;padding:13px;font:inherit;font-weight:600;color:#fff;background:#111;border:0;border-radius:999px;cursor:pointer}
</style></head><body><main><h1>FY Tizim — Claude ulanishi</h1>
<p>Claude sizning nomingizdan FY Tizim ma'lumotlarini o'qiy oladi — faqat platformadagi huquqingiz doirasida.</p>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}${form}</main></body></html>`
  return new Response(html, { status, headers: { ...NO_STORE, "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'", "x-frame-options": "DENY" } })
}

async function register(req: Request): Promise<Response> {
  const body = (await req.text().then((t) => (t.length > 10_000 ? null : JSON.parse(t))).catch(() => null)) as { redirect_uris?: unknown } | null
  const uris = body?.redirect_uris
  if (!Array.isArray(uris) || !uris.length || !uris.every((u): u is string => typeof u === "string" && redirectAllowed(u))) return json({ error: "invalid_redirect_uri" }, 400)
  return json({ client_id: randomToken(""), redirect_uris: uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }, 201)
}

async function authorizePost(req: Request, sql: Sql, base: string, check: typeof realCheck): Promise<Response> {
  const f = new URLSearchParams(await req.text())
  const a = authParams(f, base)
  if (!a) return page(null, 400, ERR.bad)
  const email = (f.get("email") ?? "").trim().toLowerCase(), password = f.get("password") ?? ""
  if (!email || email.length > 254 || !password || password.length > 1000) return page(a, 200, ERR.creds, email)
  const at = Date.now()
  if (!reserveAttempt(email, at)) return page(a, 200, ERR.throttle, email)
  let userId: string | null
  try { userId = await check(email, password) } catch (e) { releaseAttempt(email, at); console.error(`[mcp] sign-in: ${e instanceof Error ? e.message : "error"}`); return page(a, 503, ERR.down, email) }
  if (!userId) return page(a, 200, ERR.creds, email)
  clearAttempts(email)
  if (!(await activeStaff(sql, userId))) return page(a, 200, ERR.staff, email)
  const code = randomToken("")
  await saveCode(sql, { code, userId, clientId: a.client_id, redirectUri: a.redirect_uri, challenge: a.code_challenge })
  const to = new URL(a.redirect_uri)
  to.searchParams.set("code", code)
  if (a.state !== null) to.searchParams.set("state", a.state)
  return new Response(null, { status: 302, headers: { ...NO_STORE, location: to.toString() } })
}

const grantError = () => json({ error: "invalid_grant" }, 400)
const tokenOk = (t: { access_token: string; refresh_token: string; expires_in: number }) => json({ ...t, token_type: "Bearer", scope: SCOPES.join(" ") })

async function token(req: Request, sql: Sql): Promise<Response> {
  const f = new URLSearchParams(await req.text())
  const grant = f.get("grant_type")
  if (grant === "refresh_token") {
    const t = await refreshConnection(sql, f.get("refresh_token") ?? "")
    return t ? tokenOk(t) : grantError()
  }
  if (grant !== "authorization_code") return json({ error: "unsupported_grant_type" }, 400)
  const stored = await takeCode(sql, f.get("code") ?? "")
  if (!stored || f.get("redirect_uri") !== stored.redirectUri || f.get("client_id") !== stored.clientId) return grantError()
  if (!(await pkceOk(f.get("code_verifier") ?? "", stored.challenge)) || !(await activeStaff(sql, stored.userId))) return grantError()
  return tokenOk(await openConnection(sql, stored.userId, stored.clientId))
}

/** null = not an OAuth path (the caller goes on); a known path with the wrong method is a 405. */
export async function handleOAuth(req: Request, sql: Sql, url: URL, deps: { checkPassword: typeof realCheck } = { checkPassword: realCheck }): Promise<Response | null> {
  const base = publicBase()
  if (!base) return null
  const path = url.pathname, m = req.method
  const only = (method: string, run: () => Response | Promise<Response>) => (m === method ? run() : json({ error: "method_not_allowed" }, 405, { allow: method }))
  switch (path) {
    case "/.well-known/oauth-protected-resource/mcp":
    case "/.well-known/oauth-protected-resource":
      return only("GET", () => json({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: SCOPES, bearer_methods_supported: ["header"] }))
    case "/.well-known/oauth-authorization-server":
      return only("GET", () => json({ issuer: base, authorization_endpoint: `${base}/mcp/authorize`, token_endpoint: `${base}/mcp/token`, registration_endpoint: `${base}/mcp/register`,
        response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"], scopes_supported: SCOPES }))
    case "/mcp/register": return only("POST", () => register(req))
    case "/mcp/token": return only("POST", () => token(req, sql))
    case "/mcp/authorize":
      if (m === "GET") { const a = authParams(url.searchParams, base); return a ? page(a, 200) : page(null, 400, ERR.bad) }
      return only("POST", () => authorizePost(req, sql, base, deps.checkPassword))
    default: return null
  }
}
