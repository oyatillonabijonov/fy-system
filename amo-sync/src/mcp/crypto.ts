const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url")
const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))

/** Opaque token: prefix + 32 random bytes as base64url (43 chars, no padding). */
export function randomToken(prefix: "fya_" | "fyr_" | ""): string {
  return prefix + b64u(crypto.getRandomValues(new Uint8Array(32)))
}

export async function sha256hex(s: string): Promise<string> {
  return Buffer.from(await digest(s)).toString("hex")
}

/** PKCE S256 only: base64url(SHA-256(verifier)) must equal the stored challenge. */
export async function pkceOk(verifier: string, challenge: string): Promise<boolean> {
  if (!verifier || !challenge) return false
  return b64u(await digest(verifier)) === challenge
}

/** The only places an authorization code may go: Claude's hosted callback, or loopback /callback on any port. */
export function redirectAllowed(uri: string): boolean {
  let u: URL
  try { u = new URL(uri) } catch { return false }
  if (u.href !== uri || /[?#]/.test(uri) ||u.username ||u.password || u.search || u.hash) return false
  if (u.protocol === "https:") return u.hostname === "claude.ai" && u.port === "" && u.pathname === "/api/mcp/auth_callback"
  if (u.protocol === "http:") return (u.hostname === "localhost" || u.hostname === "127.0.0.1") && u.pathname === "/callback"
  return false
}
