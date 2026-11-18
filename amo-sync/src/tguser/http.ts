// /hooks/tg/* — the browser's side of the Telegram widget (migration 100). Session JWT like /hooks/pbx/*.
//   POST send {lead_id, text, template_id?, files?}   sotuv   → {ok} | {error, seconds?}
//   POST read {lead_id}                               sotuv
//   GET  status                                       sotuv   → {ok}  (503 tg_off when not configured)
//   POST login {title, profile_id?}                   admin   → {id}
//   GET  login/<id>                                   admin   → LoginState
//   POST login/<id>/password {password}               admin
//   POST logout/<id>                                  admin
import type { Sql } from "postgres"
import { verifyJwt } from "../pbx"
import { beginLogin, loginState, logoutAccount, submitPassword, tgEnabled } from "./accounts"
import { TgError } from "./port"
import { readLead, sendToLead, type SendBody } from "./send"

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type" }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...CORS, "cache-control": "no-store" } })

export async function handleTg(req: Request, sql: Sql, path: string): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (!tgEnabled()) return json({ error: "tg_off" }, 503)
  const uid = await verifyJwt((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""))
  if (!uid) return json({ error: "unauthorized" }, 401)
  const [me] = await sql<{ sales: boolean; admin: boolean }[]>`
    select public.has_permission(id, 'sotuv-crmn') as sales, public.is_admin(id) as admin from profiles where id = ${uid}`
  if (!me?.sales && !me?.admin) return json({ error: "forbidden" }, 403)
  const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {}

  try {
    if (path === "status" && req.method === "GET") return json({ ok: true })
    if (path === "send" && req.method === "POST") {
      if (typeof body.lead_id !== "string") return json({ error: "bad_request" }, 400)
      await sendToLead(sql, uid, body as unknown as SendBody)
      return json({ ok: true })
    }
    if (path === "read" && req.method === "POST") {
      if (typeof body.lead_id !== "string") return json({ error: "bad_request" }, 400)
      await readLead(sql, body.lead_id)
      return json({ ok: true })
    }

    if (!me.admin) return json({ error: "forbidden" }, 403)
    if (path === "login" && req.method === "POST") {
      const title = String(body.title ?? "").trim().slice(0, 60) || "Kompaniya"
      return json({ id: await beginLogin(sql, typeof body.profile_id === "string" ? body.profile_id : null, title) })
    }
    const login = path.match(/^login\/([\w-]+)(\/password)?$/)
    if (login && req.method === "GET" && !login[2]) return json(loginState(login[1]))
    if (login && req.method === "POST" && login[2]) { submitPassword(login[1], String(body.password ?? "")); return json({ ok: true }) }
    const out = path.match(/^logout\/([\w-]+)$/)
    if (out && req.method === "POST") { await logoutAccount(sql, out[1]); return json({ ok: true }) }
    return json({ error: "not_found" }, 404)
  } catch (e) {
    if (e instanceof TgError) {
      // a refusal the seller sees; logged so "it didn't go" can be traced afterwards
      console.log(`[tg] ${path} ${typeof body.lead_id === "string" ? body.lead_id : ""}: ${e.code}`)
      return json({ error: e.code, seconds: e.seconds || undefined }, 409)
    }
    console.error(`[tg] ${path}: ${e instanceof Error ? e.message : e}`)
    return json({ error: "tg_error" }, 500)
  }
}
