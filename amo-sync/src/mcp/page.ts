// The sign-in page the connector opens from Claude: the platform's own login look (photo ground, one card, DM Sans), as one HTML string.
// No script. Fonts and the photo come from /mcp/assets/v1/ on this origin; the CSP allows nothing else.
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..", "..")
const A = "/mcp/assets/v1/"
const FILES = new Map<string, [file: string, type: string]>([
  ["dm-sans-400.ttf", ["fonts/DMSans-400.ttf", "font/ttf"]],
  ["dm-sans-500.ttf", ["fonts/DMSans-500.ttf", "font/ttf"]],
  ["dm-sans-600.ttf", ["fonts/DMSans-600.ttf", "font/ttf"]],
  ["login-bg.webp", ["assets/login-bg.webp", "image/webp"]],
])

/** A file of the page (a font, the photo), or null. The path carries a version, so the answer may be cached for good. */
export function asset(pathname: string): Response | null {
  const hit = pathname.startsWith(A) ? FILES.get(pathname.slice(A.length)) : undefined
  return hit ? new Response(Bun.file(join(ROOT, hit[0])), { headers: { "content-type": hit[1], "cache-control": "public, max-age=31536000, immutable" } }) : null
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// Claude's mark as geometry (a burst of rounded rays) and the club's own tile
const RAYS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6 - Math.PI / 2
  const p = (r: number) => `${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`
  return `M${p(2.6)}L${p(i % 2 ? 7.4 : 9.4)}`
}).join("")
const BRIDGE = `<div class="bridge" aria-hidden="true">
<span class="tile claude"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d97757" stroke-width="2.1" stroke-linecap="round"><path d="${RAYS}"/></svg></span>
<span class="link"><i></i><b><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5h10M10.6 3.1L13 5.5l-2.4 2.4M13 10.5H3M5.4 8.1L3 10.5l2.4 2.4"/></svg></b><i></i></span>
<span class="tile"><svg width="48" height="48" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="8" fill="#f86742"/><path d="M21.2 8.15H8.36v19.7h6.42v-6.57h6.42v-6.56h6.43V8.15H21.2z" fill="#ffede8"/></svg></span>
</div>`
const ARROW = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9.2 4.2L13 8l-3.8 3.8"/></svg>`

// The platform's tokens (Plexus light; its own dark palette under prefers-color-scheme)
const CSS = `
@font-face{font-family:"DM Sans";font-weight:400;font-display:swap;src:url(${A}dm-sans-400.ttf) format("truetype")}
@font-face{font-family:"DM Sans";font-weight:500;font-display:swap;src:url(${A}dm-sans-500.ttf) format("truetype")}
@font-face{font-family:"DM Sans";font-weight:600;font-display:swap;src:url(${A}dm-sans-600.ttf) format("truetype")}
:root{color-scheme:light dark;--surface:#fff;--sunken:#f2f2f2;--sunken-hover:#e5e5e5;--ink:#1c1c1c;--muted:#666;--faint:#6e6e6e;--focus:#1c1c1c;--accent:#1c1c1c;--accent-hover:#343434;--on-accent:#f2f2f2;--danger-soft:#f4dcdc;--danger-text:#a80016;--shade:#00000040}
@media (prefers-color-scheme:dark){:root{--surface:#141416;--sunken:#202024;--sunken-hover:#27272b;--ink:#ededef;--muted:#9d9da6;--faint:#8a8a93;--focus:#ededef;--accent:#ededef;--accent-hover:#d4d4d8;--on-accent:#0b0b0c;--danger-soft:#2a1416;--danger-text:#ff7b75;--shade:#00000073}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:32px 16px;background:var(--surface);color:var(--ink);font:400 15px/1.5 "DM Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased;caret-color:var(--ink)}
::selection{background:var(--accent);color:var(--on-accent)}
.wrap{position:relative;width:100%;max-width:400px}
.card{background:var(--surface);border-radius:16px;padding:32px;display:grid;gap:28px}
.head{display:grid;gap:20px;justify-items:center;text-align:center}
.head .t{display:grid;gap:4px}
h1{margin:0;font-size:20px;line-height:1.25;font-weight:600;letter-spacing:-.015em;text-wrap:balance}
p{margin:0}
.muted{color:var(--muted)}
.fine{font-size:13px;line-height:1.45;color:var(--faint);text-align:center;text-wrap:pretty}
.foot{margin-top:20px}
.bridge{display:flex;align-items:center;gap:10px}
.tile{display:grid;place-items:center;width:48px;height:48px;border-radius:12px;overflow:hidden;flex:none}
.tile svg{display:block}
.tile.claude{background:#f0eee6}
.link{display:flex;align-items:center;gap:6px;color:var(--faint)}
.link i{width:14px;height:2px;background:radial-gradient(circle,currentColor 1px,transparent 1.2px) 0 0/5px 2px repeat-x}
.link b{display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:var(--sunken);color:var(--muted)}
form{display:grid;gap:16px}
label{display:block;font-size:14px;font-weight:500;margin-bottom:6px}
input:not([type=hidden]){display:block;width:100%;height:44px;padding:0 14px;font:inherit;font-size:16px;color:var(--ink);background:var(--sunken);border:1px solid transparent;border-radius:10px;outline:0;transition:background-color .15s,border-color .15s}
input::placeholder{color:var(--faint)}
input:not([type=hidden]):hover{background:var(--sunken-hover)}
input:not([type=hidden]):focus{border-color:var(--focus);background:var(--sunken)}
input:-webkit-autofill{-webkit-text-fill-color:var(--ink);box-shadow:0 0 0 100px var(--sunken) inset}
.err{padding:10px 14px;border-radius:10px;background:var(--danger-soft);color:var(--danger-text);font-size:14px;font-weight:500}
button{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:44px;margin-top:4px;padding:0 18px;font:inherit;font-weight:500;color:var(--on-accent);background:var(--accent);border:0;border-radius:999px;cursor:pointer;transition:background-color .15s}
button:hover{background:var(--accent-hover)}
button:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
button svg{transition:transform .2s cubic-bezier(.2,.8,.2,1)}
button:hover svg{transform:translateX(2px)}
@media (min-width:481px){
body{background:#3d4a2c url(${A}login-bg.webp) center/cover}
body::before{content:"";position:fixed;inset:0;background:var(--shade)}
.foot{color:#ffffffd9}
}
@media (max-width:480px){
body{display:block;padding:0}
.wrap{max-width:none;min-height:100dvh;display:flex;flex-direction:column}
.card{flex:1;border-radius:0;align-content:center;padding:max(32px,env(safe-area-inset-top)) 24px 24px}
.foot{margin:0;padding:8px 24px max(20px,env(safe-area-inset-bottom))}
input:not([type=hidden]),button{height:48px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`

export interface SignIn { hidden: Record<string, string>; host: string }

/** The sign-in card; without `a` (a request we can't serve) it only explains what went wrong. Every value is escaped here. */
export function signInPage(a: SignIn | null, status: number, error?: string, email = ""): Response {
  const alert = error ? `<div class="err" role="alert">${esc(error)}</div>` : ""
  const body = a ? `<div class="head">${BRIDGE}<div class="t"><h1>Claude&#39;ga ruxsat berish</h1><p class="muted">Ish hisobingiz email va paroli bilan kiring</p></div></div>
<form method="post" action="/mcp/authorize">${Object.entries(a.hidden).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("")}
<div><label for="e">Email</label><input id="e" type="email" name="email" value="${esc(email)}" placeholder="email@example.com" autocomplete="username" required${email ? "" : " autofocus"}></div>
<div><label for="p">Parol</label><input id="p" type="password" name="password" placeholder="••••••••" autocomplete="current-password" required${email ? " autofocus" : ""}></div>
${alert}<button type="submit">Kirish${ARROW}</button></form>
<p class="fine">Claude ma&#39;lumotni faqat sizning huquqingiz doirasida o&#39;qiydi. Kirgach, ${esc(a.host)} manziliga qaytasiz.</p>`
    : `<div class="head">${BRIDGE}<div class="t"><h1>Ulanib bo&#39;lmadi</h1></div></div>${alert}`
  const html = `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>FY Tizim — Claude ulanishi</title><style>${CSS}</style></head><body><main class="wrap"><div class="card">${body}</div>
<p class="fine foot">© 2026 Fikr Yetakchilari · Biznes Klub</p></main></body></html>`
  return new Response(html, { status, headers: {
    "cache-control": "no-store", "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; frame-ancestors 'none'",
  } })
}
