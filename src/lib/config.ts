// Company settings for the web app, read when the page starts from /config.js. The container writes that file from
// its environment at start (docker/40-app-config.sh), so one image serves every customer. Nothing given = our own
// values and the build's VITE_* (the ERP, as before). productMode (PRODUCT_MODE=1, a customer's install) assumes
// nothing of ours: what is missing is listed in `configMissing`, and main.tsx shows the "not set up" page instead of the app.
// The worker reads the same variables in amo-sync/src/company.ts.
interface Raw {
  productMode?: boolean
  companyName?: string; shortName?: string; tagline?: string
  appUrl?: string; apiUrl?: string; anonKey?: string
  loginBg?: string
}

const KEY = "fy_config"
function read(): Raw {
  const live = (globalThis as { __APP_CONFIG__?: Raw }).__APP_CONFIG__
  if (live) {
    try { localStorage.setItem(KEY, JSON.stringify(live)) } catch { /* storage closed: nothing to keep */ }
    return live
  }
  // config.js didn't load (the installed app opened offline): the last one seen
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Raw } catch { return {} }
}

const raw = read()
const s = (v: string | undefined) => (typeof v === "string" ? v.trim() : "")
const product = raw.productMode === true
const ours = (v: string | undefined) => (product ? "" : v ?? "")
const name = s(raw.companyName) || ours("Fikr Yetakchilari")

export const config = {
  product,
  companyName: name,
  /** the installed app's short name */
  shortName: s(raw.shortName) || (product ? name : "FY Tizim"),
  /** after the name in a page footer */
  tagline: s(raw.tagline) || ours("Biznes Klub"),
  /** the API's origin (Supabase gateway + /hooks), no trailing slash */
  apiUrl: (s(raw.apiUrl) || ours(import.meta.env.VITE_SUPABASE_URL as string | undefined)).replace(/\/+$/, ""),
  anonKey: s(raw.anonKey) || ours(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined),
  /** the photo behind the login card */
  loginBg: s(raw.loginBg) || "/images/bg-field.jpg",
}

/** Env names this install still lacks; empty = ready to run */
export const configMissing: string[] = [
  ...(config.companyName ? [] : ["COMPANY_NAME"]),
  ...(product && !s(raw.appUrl) ? ["APP_URL"] : []),
  ...(config.apiUrl ? [] : ["API_URL"]),
  ...(config.anonKey ? [] : ["SUPABASE_ANON_KEY"]),
]

/** "© 2026 Fikr Yetakchilari · Biznes Klub" */
export const copyright = `© 2026 ${[config.companyName, config.tagline].filter(Boolean).join(" · ")}`
