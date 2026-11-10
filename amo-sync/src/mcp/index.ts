// The Claude connector's entry: one dispatcher the worker's HTTP handler calls for /mcp* and /.well-known/oauth-*.
// Off (404) until MCP_PUBLIC_URL is set. Every answer carries Cache-Control: no-store.
import type { Sql } from "postgres"
import { makeAsUser } from "./db"
import type { AsUser } from "./db"
import { handleOAuth, publicBase } from "./oauth"
import { handleMcp } from "./server"

const MAX_BODY = 65536
const NO_STORE = { "cache-control": "no-store" }

/** Which paths belong to the connector */
export function isConnectorPath(pathname: string): boolean {
  return pathname === "/mcp" || pathname.startsWith("/mcp/") || pathname.startsWith("/.well-known/oauth-")
}

let asUser: AsUser | undefined
/** The tools' own pool, opened on first use so a worker with the connector off never opens it */
const getAsUser = (): AsUser => (asUser ??= makeAsUser(process.env.DATABASE_URL ?? ""))

const notFound = () => new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...NO_STORE, "content-type": "application/json" } })

export async function handleConnector(req: Request, sql: Sql, url: URL): Promise<Response> {
  if (!publicBase()) return notFound()
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) {
    return new Response(JSON.stringify({ error: "payload_too_large" }), { status: 413, headers: { ...NO_STORE, "content-type": "application/json" } })
  }
  try {
    if (url.pathname === "/mcp") return await handleMcp(req, sql, getAsUser())
    return (await handleOAuth(req, sql, url)) ?? notFound()
  } catch (e) {
    console.error("[mcp]", e instanceof Error ? e.message : String(e))
    return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: { ...NO_STORE, "content-type": "application/json" } })
  }
}
