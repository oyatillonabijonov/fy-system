// Lead quality (migration 093): a site form that carries Lavozim / Oylik aylanma is scored the moment
// it arrives; qualified = score >= the voronka's lead_threshold (default 4). The form's Meta fields
// (event_id, fbc, fbp, …) are kept for the Conversions API, never shown as answers.

export const CAPI_KEYS = ["event_id", "event_source_url", "content_name", "fbc", "fbp"] as const
export type Capi = Partial<Record<(typeof CAPI_KEYS)[number] | "client_ip" | "user_agent", string>>

/** Lower case, spaces folded, every apostrophe one ', every dash one - (site texts use ‘ and –) */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[‘’ʻʼ`´]/g, "'").replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim()
}
const loose = (s: string) => norm(s).replace(/\s*([/-])\s*/g, "$1")

const POSITION: Record<string, number> = { "biznes egasi/asoschi": 3, "direktor/top-menejer": 2, "bo'lim rahbari": 1 }
const TURNOVER: Record<string, number> = { "1 mlrd so'mdan yuqori": 3, "500 mln-1 mlrd so'm": 2, "100-500 mln so'm": 1 }
const NOT_A_COMPANY = new Set(["yo'q", "yoq", "нет", "-", "talaba", "student", "o'quvchi", "ishsiz", "test"])

const field = (fields: Record<string, string>, key: string) => Object.entries(fields).find(([k]) => norm(k) === key)?.[1]

const companyPoint = (c: string) => {
  const v = norm(c)
  return v.length >= 3 && /\p{L}/u.test(v) && !NOT_A_COMPANY.has(v) ? 1 : 0
}

/** null = an older form without the new fields: not scored */
export function scoreLead(fields: Record<string, string>): number | null {
  const position = field(fields, "lavozim")
  const turnover = field(fields, "oylik aylanma")
  if (position === undefined && turnover === undefined) return null
  return (POSITION[loose(position ?? "")] ?? 0) + (TURNOVER[loose(turnover ?? "")] ?? 0) + companyPoint(field(fields, "kompaniya") ?? "")
}

export function splitCapi(fields: Record<string, string>): { fields: Record<string, string>; capi: Capi } {
  const rest: Record<string, string> = {}
  const capi: Capi = {}
  for (const [k, v] of Object.entries(fields)) {
    const key = CAPI_KEYS.find((c) => c === k.toLowerCase())
    if (!key) { rest[k] = v; continue }
    const value = String(v).trim().slice(0, 1000)
    if (value) capi[key] = value
  }
  return { fields: rest, capi }
}

/** The visitor's address behind Cloudflare → Traefik → nginx, and their browser */
export function clientMeta(h: Headers): Pick<Capi, "client_ip" | "user_agent"> {
  const ip = h.get("cf-connecting-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim()
  const ua = h.get("user-agent")?.trim()
  return { ...(ip ? { client_ip: ip } : {}), ...(ua ? { user_agent: ua.slice(0, 500) } : {}) }
}
