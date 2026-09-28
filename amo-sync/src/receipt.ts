// Payment receipt as a PNG (SVG template → resvg). Inter is bundled because
// client names can be Cyrillic and the container has no system fonts.

import { Resvg } from "@resvg/resvg-js"
import { join } from "node:path"
import { readFileSync } from "node:fs"

export type ReceiptKind = "payment" | "refund" | "void" | "cashback"

export interface ReceiptData {
  kind: ReceiptKind
  number: string            // short id shown as №
  amount: number            // absolute value
  at: Date
  client: string
  phone: string | null
  event: string
  method: string | null     // naqd | karta | transfer (null for cashback)
  staff: string | null      // who recorded / voided
  reason: string | null     // void reason
  price: number             // agreed amount
  paid: number              // paid so far (after this operation)
}

const FONT_DIR = join(import.meta.dir, "..", "fonts")
const FONTS = ["Inter-400.ttf", "Inter-500.ttf", "Inter-600.ttf"].map((f) => join(FONT_DIR, f))
// The web app's logo (public/Sidebar/Logo.svg, 178×36), copied into the image
const LOGO = "data:image/svg+xml;base64," + readFileSync(join(import.meta.dir, "..", "assets", "logo.svg")).toString("base64")

const KIND: Record<ReceiptKind, { title: string; fg: string; bg: string }> = {
  payment:  { title: "To'lov qabul qilindi", fg: "#15803d", bg: "#e8f6ed" },
  refund:   { title: "Pul qaytarildi",       fg: "#b45309", bg: "#fdf3e1" },
  void:     { title: "To'lov bekor qilindi", fg: "#b91c1c", bg: "#fdecec" },
  cashback: { title: "Keshbek ishlatildi",   fg: "#6d28d9", bg: "#f1ebfd" },
}
const METHOD: Record<string, string> = { naqd: "Naqd", karta: "Karta", transfer: "O'tkazma" }
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"]

export const money = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm"

/** Tashkent wall time: "28-sentyabr 2026, 14:35" */
export function tashkentTime(d: Date): string {
  const t = new Date(d.getTime() + 5 * 3600_000)
  const hh = String(t.getUTCHours()).padStart(2, "0")
  const mm = String(t.getUTCMinutes()).padStart(2, "0")
  return `${t.getUTCDate()}-${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${hh}:${mm}`
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
// ponytail: fixed character budget instead of measuring glyphs; fits Inter 26px in the value column
const fit = (s: string, max = 30) => (s.length > max ? s.slice(0, max - 1) + "…" : s)

export function renderReceipt(d: ReceiptData): Uint8Array<ArrayBuffer> {
  const k = KIND[d.kind]
  const W = 720
  const debt = Math.max(d.price - d.paid, 0)

  const rows: [string, string][] = [
    ["Mijoz", d.client],
    ["Telefon", d.phone ? d.phone.replace(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/, "+998 $1 $2 $3 $4") : "—"],
    ["Tadbir", d.event],
  ]
  if (d.method) rows.push(["To'lov usuli", METHOD[d.method] ?? d.method])
  if (d.staff) rows.push([d.kind === "void" ? "Bekor qildi" : "Kassir", d.staff])
  if (d.reason) rows.push(["Sabab", d.reason])

  const totals: [string, string, string?][] = [
    ["Kelishuv", money(d.price)],
    ["Jami to'langan", money(d.paid)],
    ["Qoldiq", debt === 0 ? "To'liq to'langan" : money(debt), debt === 0 ? "#15803d" : "#1c1c1c"],
  ]

  let y = 0
  const parts: string[] = []
  const text = (x: number, yy: number, s: string, size: number, weight: number, fill: string, anchor = "start") =>
    parts.push(`<text x="${x}" y="${yy}" font-family="Inter" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`)

  // Header
  y = 88
  parts.push(`<image href="${LOGO}" x="56" y="${y - 34}" width="231" height="47"/>`)
  text(W - 56, y - 12, "To'lov cheki", 20, 500, "#1c1c1c", "end")
  text(W - 56, y + 16, `№ ${d.number}`, 18, 400, "#8a8a8a", "end")

  // Status + amount
  y = 176
  const pillW = k.title.length * 10.2 + 50
  parts.push(`<rect x="56" y="${y}" width="${pillW}" height="40" rx="20" fill="${k.bg}"/>`)
  parts.push(`<circle cx="78" cy="${y + 20}" r="5" fill="${k.fg}"/>`)
  text(92, y + 27, k.title, 19, 500, k.fg)
  y += 108
  const sign = d.kind === "refund" || d.kind === "void" ? "−" : ""
  text(56, y, sign + money(d.amount), 60, 600, d.kind === "void" ? "#9a9a9a" : "#1c1c1c")
  y += 44
  text(56, y, tashkentTime(d.at), 20, 400, "#8a8a8a")

  // Details
  y += 44
  parts.push(`<line x1="56" y1="${y}" x2="${W - 56}" y2="${y}" stroke="#e5e5e5" stroke-width="2" stroke-dasharray="8 8"/>`)
  y += 22
  for (const [label, value] of rows) {
    y += 46
    text(56, y, label, 21, 400, "#8a8a8a")
    text(W - 56, y, fit(value), 21, 500, "#1c1c1c", "end")
  }

  // Totals
  y += 34
  parts.push(`<rect x="40" y="${y}" width="${W - 80}" height="${totals.length * 46 + 30}" rx="18" fill="#f5f5f5"/>`)
  y -= 2
  for (const [label, value, color] of totals) {
    y += 46
    const last = label === "Qoldiq"
    text(68, y, label, 21, last ? 600 : 400, last ? "#1c1c1c" : "#6b6b6b")
    text(W - 68, y, value, 21, 600, color ?? "#1c1c1c", "end")
  }
  y += 30

  // Footer
  y += 54
  text(W / 2, y, "Avtomatik chek · app.fikryetakchilari.uz", 17, 400, "#a3a3a3", "middle")
  const H = y + 44

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="32" fill="#ffffff"/>
${parts.join("\n")}
</svg>`

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: W * 2 },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" },
    background: "#ffffff",
  }).render().asPng()
  return new Uint8Array(png)
}

/** Short caption under the photo: kind, amount, time, client */
export function receiptCaption(d: ReceiptData): string {
  const icon = { payment: "🧾", refund: "↩️", void: "❌", cashback: "🎁" }[d.kind]
  return `${icon} ${KIND[d.kind].title}: ${money(d.amount)}\n${d.client} · ${tashkentTime(d.at)}`
}
