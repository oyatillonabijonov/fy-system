import { expect, test } from "bun:test"
import type { Sql } from "postgres"
import { handleOAuth } from "./oauth"
import { asset, signInPage } from "./page"

test("assets: the three fonts and the photo are served from the versioned path, cacheable for good", async () => {
  for (const [name, type] of [["dm-sans-400.ttf", "font/ttf"], ["dm-sans-500.ttf", "font/ttf"], ["dm-sans-600.ttf", "font/ttf"], ["login-bg.webp", "image/webp"]]) {
    const r = asset(`/mcp/assets/v1/${name}`)
    expect(r?.headers.get("content-type")).toBe(type)
    expect(r?.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect((await r!.arrayBuffer()).byteLength).toBeGreaterThan(10_000)
  }
})

test("assets: nothing outside the list — no traversal, no object keys, no other version", () => {
  for (const p of ["/mcp/assets/v1/../../.env", "/mcp/assets/v1/constructor", "/mcp/assets/v1/__proto__", "/mcp/assets/v1/", "/mcp/assets/v2/dm-sans-400.ttf", "/mcp/assets/v1/logo.svg", "/mcp/authorize"])
    expect(asset(p)).toBeNull()
})

test("sign-in page: every interpolated value is escaped; no script; the CSP lets in only our own fonts and photo", async () => {
  const bad = `"><script>alert(1)</script>`
  const r = signInPage({ hidden: { state: bad, client_id: bad }, host: bad }, 200, bad, bad)
  const html = await r.text()
  expect(html).not.toContain("<script")
  expect(html.split("&#60;script&#62;alert(1)").length - 1).toBe(5)   // two hidden fields, the host, the error, the e-mail
  expect(r.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; frame-ancestors 'none'")
  expect(r.headers.get("x-frame-options")).toBe("DENY")
  expect(r.headers.get("cache-control")).toBe("no-store")
})

test("sign-in page: the form names the place the user returns to; after an error the password field takes focus", async () => {
  const first = await signInPage({ hidden: { state: "s" }, host: "claude.ai" }, 200).text()
  expect(first).toContain("Kirgach, claude.ai manziliga qaytasiz.")
  expect(first).toMatch(/name="email"[^>]* autofocus/)
  expect(first).not.toContain('role="alert"')
  const again = await signInPage({ hidden: {}, host: "claude.ai" }, 200, "Email yoki parol noto'g'ri", "ali@fy.uz").text()
  expect(again).toMatch(/name="password"[^>]* autofocus/)
  expect(again).not.toMatch(/name="email"[^>]* autofocus/)
  expect(again).toContain('role="alert"')
})

test("sign-in page: a request we cannot serve gets the explanation and no form", async () => {
  const r = signInPage(null, 400, "So'rov noto'g'ri. Claude'da ulanishni qaytadan boshlang.")
  const html = await r.text()
  expect(r.status).toBe(400)
  expect(html).not.toContain("<form")
  expect(html).toContain("Ulanib bo&#39;lmadi")
})

test("the OAuth handler serves the page's assets on GET only, and only when the connector is on", async () => {
  const sql = undefined as unknown as Sql
  const url = new URL("https://x.test/mcp/assets/v1/login-bg.webp")
  const before = process.env.MCP_PUBLIC_URL
  process.env.MCP_PUBLIC_URL = "https://x.test"
  try {
    expect((await handleOAuth(new Request(url), sql, url))?.headers.get("content-type")).toBe("image/webp")
    expect(await handleOAuth(new Request(url, { method: "POST" }), sql, url)).toBeNull()
    delete process.env.MCP_PUBLIC_URL
    expect(await handleOAuth(new Request(url), sql, url)).toBeNull()
  } finally {
    if (before === undefined) delete process.env.MCP_PUBLIC_URL; else process.env.MCP_PUBLIC_URL = before
  }
})
