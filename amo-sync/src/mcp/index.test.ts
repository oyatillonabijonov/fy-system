import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { Sql } from "postgres"
import { clearFiles, putFile } from "./files"
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

describe("GET /mcp/files/<id>", () => {
  const was = process.env.MCP_PUBLIC_URL
  beforeEach(() => { process.env.MCP_PUBLIC_URL = "https://x.test"; clearFiles() })
  afterEach(() => { if (was === undefined) delete process.env.MCP_PUBLIC_URL; else process.env.MCP_PUBLIC_URL = was })
  const pdf = new Uint8Array([37, 80, 68, 70, 45, 1, 2, 3])

  test("serves the bytes as an attachment, no-store", async () => {
    const id = putFile("Кайзен_8_0_stikerlar.pdf", pdf)
    const r = await call(`/mcp/files/${id}`)
    expect(r.status).toBe(200)
    expect(r.headers.get("content-type")).toBe("application/pdf")
    expect(r.headers.get("cache-control")).toBe("no-store")
    expect(r.headers.get("x-content-type-options")).toBe("nosniff")
    expect(r.headers.get("content-length")).toBe(String(pdf.length))
    const cd = r.headers.get("content-disposition") ?? ""
    expect(cd).toContain('attachment; filename="')
    expect(cd).toContain('filename="_______8_0_stikerlar.pdf"')
    expect(cd).toContain("filename*=UTF-8''%D0%9A%D0%B0%D0%B9%D0%B7%D0%B5%D0%BD_8_0_stikerlar.pdf")
    expect(Array.from(new Uint8Array(await r.arrayBuffer()))).toEqual(Array.from(pdf))
  })

  test("a quote or line break in the name cannot break the header", async () => {
    const id = putFile('a"b\r\nSet-Cookie: x=1.pdf', pdf)
    const r = await call(`/mcp/files/${id}`)
    const cd = r.headers.get("content-disposition") ?? ""
    expect(cd).not.toMatch(/[\r\n]/)
    expect(cd.split('"')).toHaveLength(3)
    expect(r.headers.get("set-cookie")).toBeNull()
  })

  test("unknown id, malformed id, wrong method, connector off → 404 no-store", async () => {
    const id = putFile("a.pdf", pdf)
    for (const r of [
      await call(`/mcp/files/${"A".repeat(43)}`),
      await call("/mcp/files/short"),
      await call(`/mcp/files/${id}/x`),
      await call("/mcp/files/"),
      await call(`/mcp/files/${id}`, { method: "POST", body: "{}" }),
    ]) {
      expect(r.status).toBe(404)
      expect(r.headers.get("cache-control")).toBe("no-store")
    }
    delete process.env.MCP_PUBLIC_URL
    const off = await call(`/mcp/files/${id}`)
    expect(off.status).toBe(404)
    expect(off.headers.get("cache-control")).toBe("no-store")
  })
})
