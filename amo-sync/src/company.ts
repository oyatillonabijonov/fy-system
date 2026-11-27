// Company settings: what differs from one install to another, read from the environment once, when the worker starts.
// Without PRODUCT_MODE every default is our own value, so the ERP runs exactly as before. PRODUCT_MODE=1 is a
// customer's install: REQUIRED must be given (the worker refuses to start otherwise) and nothing of ours is assumed —
// no pixel means the Conversions API is off, no FY_APP_URL means the members' app is off.
// The web container reads the same variables (docker/40-app-config.sh): one env file serves both.
import { existsSync } from "node:fs"
import { join } from "node:path"

type Env = Record<string, string | undefined>

export interface Company {
  product: boolean
  name: string        // "Fikr Yetakchilari"
  shortName: string   // the app's short name: "FY Tizim"
  tagline: string     // after the name in a page footer: "Biznes Klub"
  kind: string        // what the company is, after its name in the call-analysis prompt: "biznes klubi"
  about: string       // what it sells and what a seller is after — a sentence or more for the same prompt
  appUrl: string      // the web app's origin, no trailing slash
  apiUrl: string      // the API's origin (Supabase gateway + /hooks), no trailing slash
  pixel: string       // Meta pixel id; "" = Conversions API off
  fyAppUrl: string    // the FY members' app backend; "" = off
}

export const REQUIRED = ["COMPANY_NAME", "APP_URL", "API_URL", "SUPABASE_ANON_KEY"]

export function companyFrom(env: Env): Company {
  const v = (k: string) => (env[k] ?? "").trim()
  const url = (k: string) => v(k).replace(/\/+$/, "")
  const product = v("PRODUCT_MODE") === "1"
  if (product) {
    const missing = REQUIRED.filter((k) => !v(k))
    if (missing.length) throw new Error(`[sozlama] PRODUCT_MODE=1, lekin ${missing.join(", ")} berilmagan — worker ishga tushmaydi`)
  }
  const ours = (s: string) => (product ? "" : s)
  const name = v("COMPANY_NAME") || ours("Fikr Yetakchilari")
  return {
    product, name,
    shortName: v("COMPANY_SHORT_NAME") || (product ? name : "FY Tizim"),
    tagline: v("COMPANY_TAGLINE") || ours("Biznes Klub"),
    kind: v("COMPANY_KIND") || ours("biznes klubi"),
    // an env file can't hold a line break: a literal "\n" stands for one
    about: v("COMPANY_ABOUT").replace(/\\n/g, "\n") || (product
      ? "Sotuvchining maqsadi — mijozga sotish yoki keyingi aniq qadamni kelishish."
      : "Klub tadbirkorlar uchun pullik tadbirlar o'tkazadi; sotuvchining maqsadi — mijozni tadbirga yozish yoki keyingi aniq qadamni kelishish."),
    appUrl: url("APP_URL") || ours("https://app.fikryetakchilari.uz"),
    apiUrl: url("API_URL") || url("PUBLIC_API_URL") || ours("https://api.fikryetakchilari.uz"),
    pixel: v("META_PIXEL_ID") || ours("1647118073645060"),
    fyAppUrl: url("FY_APP_URL") || ours("https://com.fikryetakchilari.uz"),
  }
}

export const COMPANY = companyFrom(process.env)

const BRAND_DIR = process.env.BRAND_DIR || "/brand"
/** A customer's own file from the mounted brand folder (logo.svg, login-bg.jpg, icon-192.png), else `ours` */
export const brandFile = (name: string, ours: string): string => {
  const own = join(BRAND_DIR, name)
  return existsSync(own) ? own : ours
}
