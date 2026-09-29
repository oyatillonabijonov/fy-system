// Payment / expense receipt as a PNG (SVG template → resvg). Fonts are bundled: the
// container has none, and client names can be Cyrillic.

import { Resvg } from "@resvg/resvg-js"
import { join } from "node:path"
import { readFileSync } from "node:fs"

export type ReceiptKind = "payment" | "refund" | "void" | "cashback" | "expense" | "expense_void"

export interface ReceiptData {
  kind: ReceiptKind
  number: string            // short id shown as №
  amount: number            // absolute value
  at: Date
  client: string            // expenses: the category label
  phone: string | null
  event: string
  method: string | null     // naqd | karta | transfer (null for cashback)
  staff: string | null      // who recorded / voided
  reason: string | null     // void reason
  note?: string | null      // expenses: the note typed with it
  price: number             // agreed amount
  paid: number              // paid so far (after this operation)
}

const FONT_DIR = join(import.meta.dir, "..", "fonts")
// DM Sans = the web app's font; Inter only as fallback for Cyrillic names (DM Sans has none)
const FONTS = ["DMSans-400", "DMSans-500", "DMSans-600", "Inter-400", "Inter-500", "Inter-600"].map((f) => join(FONT_DIR, f + ".ttf"))
// The web app's logo (public/Sidebar/Logo.svg, 178×36), copied into the image
const LOGO = "data:image/svg+xml;base64," + readFileSync(join(import.meta.dir, "..", "assets", "logo.svg")).toString("base64")

// icon: check | cross | back arrow, drawn inside the status circle
const KIND: Record<ReceiptKind, { title: string; fg: string; bg: string; icon: "check" | "cross" | "back" }> = {
  payment:  { title: "To'lov qabul qilindi", fg: "#15803d", bg: "#e6f4ea", icon: "check" },
  refund:   { title: "Pul qaytarildi",       fg: "#b45309", bg: "#fdf3e1", icon: "back" },
  void:     { title: "To'lov bekor qilindi", fg: "#b91c1c", bg: "#fdecec", icon: "cross" },
  cashback: { title: "Keshbek ishlatildi",   fg: "#6d28d9", bg: "#f1ebfd", icon: "check" },
  expense:      { title: "Xarajat kiritildi",     fg: "#b45309", bg: "#fdf3e1", icon: "check" },
  expense_void: { title: "Xarajat bekor qilindi", fg: "#b91c1c", bg: "#fdecec", icon: "cross" },
}
const isExpense = (k: ReceiptKind) => k === "expense" || k === "expense_void"
const METHOD: Record<string, string> = { naqd: "Naqd", karta: "Karta", transfer: "O'tkazma" }
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"]

const num = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")
export const money = (n: number) => num(n) + " so'm"

/** Tashkent wall time: "28-sentyabr 2026, 14:35" */
export function tashkentTime(d: Date): string {
  const t = new Date(d.getTime() + 5 * 3600_000)
  const hh = String(t.getUTCHours()).padStart(2, "0")
  const mm = String(t.getUTCMinutes()).padStart(2, "0")
  return `${t.getUTCDate()}-${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${hh}:${mm}`
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
// ponytail: fixed character budget instead of measuring text; fine for DM Sans at 19px in the value column
const fit = (s: string, max = 30) => (s.length > max ? s.slice(0, max - 1) + "…" : s)

function statusIcon(kind: ReceiptKind, cx: number, cy: number): string {
  const k = KIND[kind]
  const r = 22
  const glyph = {
    check: `<path d="M${cx - 8} ${cy} l6 6 l11 -12" />`,
    cross: `<path d="M${cx - 7} ${cy - 7} l14 14 M${cx + 7} ${cy - 7} l-14 14" />`,
    back:  `<path d="M${cx + 8} ${cy + 7} v-4 a6 6 0 0 0 -6 -6 h-10 M${cx - 4} ${cy - 9} l-6 6 l6 6" />`,
  }[k.icon]
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${k.bg}"/><g stroke="${k.fg}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>`
}

/** "System card" receipt: white card on the page grey, details block, payment progress (payments only). */
export function renderReceipt(d: ReceiptData): Uint8Array<ArrayBuffer> {
  const k = KIND[d.kind]
  const W = 720, P = 28, X = P + 36, R = W - P - 36
  const debt = Math.max(d.price - d.paid, 0)
  const parts: string[] = []
  const text = (x: number, y: number, s: string, size: number, weight: number, fill: string, anchor = "start", extra = "") =>
    parts.push(`<text x="${x}" y="${y}" font-family="DM Sans, Inter" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ${extra}>${esc(s)}</text>`)

  // Header: logo + receipt number
  let y = P + 44
  parts.push(`<image href="${LOGO}" x="${X}" y="${y}" width="200" height="40"/>`)
  text(R, y + 18, isExpense(d.kind) ? "Xarajat cheki" : "To'lov cheki", 19, 500, "#1c1c1c", "end")
  text(R, y + 42, `№ ${d.number}`, 16, 400, "#8f8f8f", "end")

  // Status + time
  y += 96
  parts.push(statusIcon(d.kind, X + 22, y + 22))
  text(X + 58, y + 16, k.title, 18, 500, k.fg)
  text(X + 58, y + 40, tashkentTime(d.at), 16, 400, "#8f8f8f")

  // Amount
  y += 116
  const amount = (d.kind === "payment" || d.kind === "cashback" ? "" : "−") + num(d.amount)
  // One <text> with a tspan: "so'm" follows the digits exactly, whatever their width
  parts.push(`<text x="${X}" y="${y}" font-family="DM Sans, Inter" font-size="66" font-weight="600" letter-spacing="-2" fill="${d.kind === "void" || d.kind === "expense_void" ? "#a3a3a3" : "#1c1c1c"}">${esc(amount)}<tspan dx="14" font-size="30" font-weight="500" letter-spacing="0" fill="#8f8f8f">so'm</tspan></text>`)

  // Details block
  const voided = d.kind === "void" || d.kind === "expense_void"
  const rows: [string, string][] = isExpense(d.kind)
    ? [["Kategoriya", d.client], ["Tadbir", d.event]]
    : [
        ["Mijoz", d.client],
        ["Telefon", d.phone ? d.phone.replace(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/, "+998 $1 $2 $3 $4") : "—"],
        ["Tadbir", d.event],
      ]
  if (d.note) rows.push(["Izoh", d.note])
  if (d.method) rows.push(["To'lov usuli", METHOD[d.method] ?? d.method])
  if (d.staff) rows.push([voided ? "Bekor qildi" : isExpense(d.kind) ? "Kiritdi" : "Kassir", d.staff])
  if (d.reason) rows.push(["Sabab", d.reason])

  y += 44
  const boxY = y
  const rowParts: string[] = []
  y += 12
  rows.forEach(([label, value], i) => {
    y += 52
    const before = parts.length
    text(X + 20, y, label, 19, 400, "#8f8f8f")
    text(R - 20, y, fit(value), 19, 500, "#1c1c1c", "end")
    rowParts.push(...parts.splice(before))
    if (i < rows.length - 1) rowParts.push(`<line x1="${X + 20}" y1="${y + 20}" x2="${R - 20}" y2="${y + 20}" stroke="#ebebeb" stroke-width="1.5"/>`)
  })
  y += 28
  parts.push(`<rect x="${X}" y="${boxY}" width="${R - X}" height="${y - boxY}" rx="18" fill="#f7f7f7"/>`, ...rowParts)

  // Payment progress (an expense has no debt to show)
  const pct = d.price > 0 ? Math.min(d.paid / d.price, 1) : 0
  if (!isExpense(d.kind)) {
    y += 52
    text(X, y, "To'lov holati", 19, 500, "#1c1c1c")
    text(R, y, `${Math.round(pct * 100)}%`, 19, 600, "#1c1c1c", "end")
    y += 20
    parts.push(`<rect x="${X}" y="${y}" width="${R - X}" height="10" rx="5" fill="#eeeeee"/>`)
    if (pct > 0) parts.push(`<rect x="${X}" y="${y}" width="${Math.max((R - X) * pct, 10)}" height="10" rx="5" fill="${debt === 0 ? "#15803d" : "#1c1c1c"}"/>`)
    y += 44
    text(X, y, `To'langan ${num(d.paid)} / ${money(d.price)}`, 17, 400, "#8f8f8f")
    y += 40
    text(X, y, "Qoldiq", 21, 600, "#1c1c1c")
    text(R, y, debt === 0 ? "To'liq to'langan" : money(debt), 21, 600, debt === 0 ? "#15803d" : "#1c1c1c", "end")
  }

  // Footer
  y += 56
  parts.push(`<line x1="${X}" y1="${y}" x2="${R}" y2="${y}" stroke="#ebebeb" stroke-width="1.5" stroke-dasharray="6 6"/>`)
  y += 40
  text(W / 2, y, "Fikr Yetakchilari · avtomatik chek", 15, 400, "#a3a3a3", "middle")
  y += 44
  const H = y + P

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#f2f2f2"/>
<rect x="${P}" y="${P}" width="${W - 2 * P}" height="${H - 2 * P}" rx="28" fill="#ffffff"/>
${parts.join("\n")}
</svg>`

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: W * 2 },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "DM Sans" },
  }).render().asPng()
  return new Uint8Array(png)
}

/** Short caption under the photo: kind, amount, time, client (expenses: category · event, then the note) */
export function receiptCaption(d: ReceiptData): string {
  const icon = { payment: "🧾", refund: "↩️", void: "❌", cashback: "🎁", expense: "💸", expense_void: "❌" }[d.kind]
  const head = `${icon} ${KIND[d.kind].title}: ${money(d.amount)}`
  if (!isExpense(d.kind)) return `${head}\n${d.client} · ${tashkentTime(d.at)}`
  const why = d.kind === "expense_void" ? d.reason && `Sabab: ${d.reason}` : d.note && `Izoh: ${d.note}`
  return [head, `${d.client} · ${d.event} · ${tashkentTime(d.at)}`, why].filter(Boolean).join("\n")
}
