// Name stickers: A4 portrait, 2 × 7 = 14 per sheet, cut by hand from plain self-adhesive A4.
// "Quiet luxury" business-card layout: a muted ground, the name centred in the upper space,
// the occasion on the bottom margin under a short brass rule, the F mark answering on the right.
// Everything is vector (rects, the mark, DM Sans embedded), so it prints sharp at any DPI.
// The caller registers the font as family "DMSans", style "normal" (DM Sans 500).
import type { jsPDF } from "jspdf"

type RGB = [number, number, number]
export interface StickerPalette { id: string; label: string; bg: RGB; ink: RGB; metal: RGB; muted: RGB }

export const STICKER_PALETTES: StickerPalette[] = [
  { id: "charcoal", label: "Ko'mir", bg: [40, 39, 37], ink: [222, 216, 202], metal: [168, 146, 108], muted: [150, 144, 132] },
  { id: "stone", label: "Tosh", bg: [224, 219, 208], ink: [36, 38, 42], metal: [140, 114, 74], muted: [104, 100, 92] },
  { id: "cream", label: "Krem", bg: [244, 239, 229], ink: [27, 36, 51], metal: [160, 128, 80], muted: [110, 106, 98] },
]

// Sheet geometry, mm
const W = 95, H = 37
const COLS = 2, ROWS = 7
const GAP_X = 4, GAP_Y = 3
const X0 = (210 - COLS * W - (COLS - 1) * GAP_X) / 2   // 8
const Y0 = (297 - ROWS * H - (ROWS - 1) * GAP_Y) / 2   // 11
export const PER_SHEET = COLS * ROWS

// Card grid: 7.5 mm margins, 3 mm between elements, the name lifted a hair above the geometric centre
const PAD = 7.5, GAP = 3, LIFT = 0.5
const PT = 0.3528                 // mm per pt
const CAP = 0.7                   // DM Sans cap height, em
const LINE = 0.86                 // name line height, em
const TRACK = 0.07                // name letter-spacing, em
const NAME_MAX = 22               // pt
const CAPS = 6.4                  // caption size, pt
const CAPS_TRACK = 0.18           // caption letter-spacing, em
const MARK = 8.5                  // mm

// The logo's F, normalised to a unit box (from public/favicon.svg)
const F: [number, number][] = [[0, 0], [1, 0], [1, 0.333], [0.667, 0.333], [0.667, 0.667], [0.333, 0.667], [0.333, 1], [0, 1]]

/** Uzbek apostrophes, whatever was typed: o‘ g‘ get the turned comma, everything else the tutuq ’ */
export function cleanName(s: string): string {
  return s.trim().replace(/\s+/g, " ")
    .replace(/([OoGg])['`ʻʼ‘’]/g, "$1‘")
    .replace(/['`ʻʼ]/g, "’")
    .toLocaleUpperCase("uz")
}

/** "Otabek Shahriddinov Akmal o‘g‘li" → ["OTABEK", "SHAHRIDDINOV"]: first name over surname */
export function nameLines(full: string): string[] {
  return cleanName(full).split(" ").filter(Boolean).slice(0, 2)
}

function card(doc: jsPDF, x: number, y: number, full: string, caption: string, p: StickerPalette) {
  doc.setFillColor(...p.bg)
  doc.rect(x, y, W, H, "F")
  doc.setFont("DMSans", "normal")

  // Occasion on the bottom margin, a short brass rule above it
  const capBase = y + H - PAD + 0.6
  doc.setFontSize(CAPS)
  doc.setCharSpace(CAPS_TRACK * CAPS * PT)
  doc.setTextColor(...p.muted)
  doc.text(doc.splitTextToSize(caption.toLocaleUpperCase("uz"), W - 2 * PAD)[0] ?? "", x + PAD, capBase)
  const rule = capBase - CAP * CAPS * PT - GAP
  doc.setDrawColor(...p.metal); doc.setLineWidth(0.2)
  doc.line(x + PAD, rule, x + PAD + 12, rule)

  // Name: one size for both lines, the largest that fits; centred in the space above the rule
  const lines = nameLines(full)
  const maxW = W - 2 * PAD - MARK - 5
  const areaTop = y + PAD - 1, areaH = rule - GAP - areaTop
  doc.setFontSize(NAME_MAX)
  const width = (l: string) => doc.getTextWidth(l) + TRACK * NAME_MAX * PT * (l.length - 1)
  const widest = Math.max(1, ...lines.map(width))
  const rows = Math.max(lines.length, 1)
  const size = Math.min(NAME_MAX, (NAME_MAX * maxW) / widest, Math.min(areaH, 14) / (((rows - 1) * LINE + CAP) * PT))
  const blockH = ((rows - 1) * LINE + CAP) * size * PT
  const top = areaTop + (areaH - blockH) / 2 - LIFT
  doc.setFontSize(size)
  doc.setCharSpace(TRACK * size * PT)
  doc.setTextColor(...p.ink)
  lines.forEach((l, i) => doc.text(l, x + PAD, top + CAP * size * PT + i * LINE * size * PT))
  doc.setCharSpace(0)

  // Mark: level with the name's capitals; a one-line name is shorter than it, so centre on it instead
  const mx = x + W - PAD - MARK, my = blockH < MARK ? top + (blockH - MARK) / 2 : top
  const pts = F.map(([u, v]) => [mx + u * MARK, my + v * MARK])
  doc.setFillColor(...p.metal)
  doc.lines(pts.slice(1).map(([px, py], i) => [px - pts[i][0], py - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], "F", true)
}

/** Faint cut guides in the margins, on every card edge */
function cutMarks(doc: jsPDF) {
  doc.setDrawColor(190, 190, 190); doc.setLineWidth(0.1)
  const xs = Array.from({ length: COLS }, (_, c) => X0 + c * (W + GAP_X)).flatMap((v) => [v, v + W])
  const ys = Array.from({ length: ROWS }, (_, r) => Y0 + r * (H + GAP_Y)).flatMap((v) => [v, v + H])
  const yEnd = Y0 + ROWS * H + (ROWS - 1) * GAP_Y, xEnd = X0 + COLS * W + (COLS - 1) * GAP_X
  for (const v of xs) { doc.line(v, 2, v, Y0 - 2); doc.line(v, yEnd + 2, v, 295) }
  for (const v of ys) { doc.line(1, v, X0 - 2, v); doc.line(xEnd + 2, v, 209, v) }
}

/** Draws every name onto `doc` (A4 portrait, mm), adding pages as needed */
export function drawStickers(doc: jsPDF, names: string[], caption: string, palette: StickerPalette) {
  names.forEach((full, i) => {
    const k = i % PER_SHEET
    if (i > 0 && k === 0) doc.addPage()
    if (k === 0) cutMarks(doc)
    card(doc, X0 + (k % COLS) * (W + GAP_X), Y0 + Math.floor(k / COLS) * (H + GAP_Y), full, caption, palette)
  })
}
