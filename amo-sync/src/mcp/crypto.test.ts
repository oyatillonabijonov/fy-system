import { expect, test } from "bun:test"
import { pkceOk, randomToken, redirectAllowed, sha256hex } from "./crypto"

test("PKCE S256: the RFC 7636 appendix B vector", async () => {
  expect(await pkceOk("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(true)
  expect(await pkceOk("wrong", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(false)
  expect(await pkceOk("", "")).toBe(false)
})

test("redirects: Claude's callback and loopback /callback on any port — nothing else", () => {
  for (const ok of ["https://claude.ai/api/mcp/auth_callback", "http://localhost:3118/callback", "http://127.0.0.1:9/callback", "http://localhost/callback"])
    expect(redirectAllowed(ok)).toBe(true)
  for (const bad of ["https://claude.ai/api/mcp/auth_callback/x", "https://claude.ai.evil.com/api/mcp/auth_callback",
    "http://claude.ai/api/mcp/auth_callback", "https://localhost/callback", "http://localhost:3118/other",
    "http://localhost.evil.com/callback", "http://localhost@evil.com/callback", "http://[::1]/callback", "javascript:alert(1)", ""])
    expect(redirectAllowed(bad)).toBe(false)
})

test("tokens: prefixed, 43 url-safe characters of entropy, never equal", async () => {
  const a = randomToken("fya_"), b = randomToken("fya_")
  expect(a).toMatch(/^fya_[A-Za-z0-9_-]{43}$/)
  expect(a).not.toBe(b)
  expect(await sha256hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
})
