// The Claude connector's entry: one dispatcher the worker's HTTP handler calls for /mcp* and /.well-known/oauth-*.
// Off (404) until MCP_PUBLIC_URL is set. Every answer carries Cache-Control: no-store.
import type { Sql } from "postgres"
import { makeAsUser } from "./db"
import type { AsUser } from "./db"
import { getFile } from "./files"
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

/** Content-Disposition for a download: an ASCII fallback plus the real (percent-encoded) name; quotes, slashes and control characters never reach the header */
function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\/;]/g, "_")
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
}

const notFound = () => new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...NO_STORE, "content-type": "application/json" } })

export async function handleConnector(req: Request, sql: Sql, url: URL): Promise<Response> {
  if (!publicBase()) return notFound()
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) {
    return new Response(JSON.stringify({ error: "payload_too_large" }), { status: 413, headers: { ...NO_STORE, "content-type": "application/json" } })
  }
  try {
    if (url.pathname === "/mcp") return await handleMcp(req, sql, getAsUser())
    if (url.pathname.startsWith("/mcp/files/")) {
      const id = url.pathname.slice("/mcp/files/".length)
      const file = req.method === "GET" && /^[A-Za-z0-9_-]{43}$/.test(id) ? getFile(id) : null
      if (!file) return notFound()
      return new Response(new Uint8Array(file.bytes), {
        headers: {
          ...NO_STORE,
          "content-type": "application/pdf",
          "content-length": String(file.bytes.length),
          "content-disposition": attachment(file.name),
          "x-content-type-options": "nosniff",
        },
      })
    }
    return (await handleOAuth(req, sql, url)) ?? notFound()
  } catch (e) {
    console.error("[mcp]", e instanceof Error ? e.message : String(e))
    return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: { ...NO_STORE, "content-type": "application/json" } })
  }
}
