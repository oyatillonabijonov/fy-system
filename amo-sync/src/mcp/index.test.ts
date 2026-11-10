import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { Sql } from "postgres"
import { handleConnector, isConnectorPath } from "./index"

const sql = {} as unknown as Sql
const call = (path: string, init?: RequestInit) => handleConnector(new Request(`http://x${path}`, init), sql, new URL(`http://x${path}`))

describe("isConnectorPath", () => {
  test("claims connector paths only", () => {
    for (const p of ["/mcp", "/mcp/token", "/.well-known/oauth-authorization-server"]) expect(isConnectorPath(p)).toBe(true)
    for (const p of ["/hooks/health", "/hooks/lead/meta", "/mcpx", "/.well-known/other", "/"]) expect(isConnectorPath(p)).toBe(false)
  })
})

describe("handleConnector", () => {
  const was = process.env.MCP_PUBLIC_URL
  beforeEach(() => { delete process.env.MCP_PUBLIC_URL })
  afterEach(() => { if (was === undefined) delete process.env.MCP_PUBLIC_URL; else process.env.MCP_PUBLIC_URL = was })

  test("off: everything is 404 with no-store", async () => {
    for (const p of ["/mcp", "/mcp/token", "/.well-known/oauth-authorization-server"]) {
      const r = await call(p)
      expect(r.status).toBe(404)
      expect(r.headers.get("cache-control")).toBe("no-store")
    }
  })

  test("on: unknown path is 404, oversized body is 413", async () => {
    process.env.MCP_PUBLIC_URL = "https://x.test"
    const a = await call("/mcp/nope")
    expect(a.status).toBe(404)
    expect(a.headers.get("cache-control")).toBe("no-store")
    const b = await call("/mcp/token", { method: "POST", headers: { "content-length": "70000" } })
    expect(b.status).toBe(413)
    expect(b.headers.get("cache-control")).toBe("no-store")
  })
})
