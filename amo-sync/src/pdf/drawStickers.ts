// Name stickers: A4 portrait, 2 × 7 = 14 per sheet, cut by hand from plain self-adhesive A4.
// Two layouts:
//   classic — the club's reference: a name band (large F mark, the name in two bold lines), a caption
//             strip with "• occasion", a thin base bar
//   minimal — quiet business card: muted ground, the name centred above a short brass rule, the
//             occasion in spaced capitals on the bottom margin, the mark answering on the right
// Everything is vector — shapes, axial-shading gradients, DM Sans embedded — so it prints sharp.
// The caller registers the fonts as family "DMSans": "normal" = DM Sans 500, "bold" = DM Sans 600.
import { ShadingPattern, type jsPDF } from "jspdf"

export type RGB = [number, number, number]
interface Classic {
  layout: "classic"; id: string; label: string
  band: [RGB, RGB]; strip: [RGB, RGB]; base: RGB      // gradients run top → bottom
  name: RGB; mark: RGB; caption: RGB
}
interface Minimal {
  layout: "minimal"; id: string; label: string
  bg: RGB; ink: RGB; metal: RGB; muted: RGB
}
export type StickerStyle = Classic | Minimal

export const STICKER_STYLES: StickerStyle[] = [
  { layout: "classic", id: "onyx", label: "Onyx", band: [[16, 12, 10], [30, 22, 17]], strip: [[234, 234, 232], [206, 205, 202]],
    base: [24, 18, 14], name: [218, 198, 168], mark: [255, 255, 255], caption: [40, 36, 33] },
  { layout: "classic", id: "sandstone", label: "Sandstone", band: [[230, 226, 216], [216, 210, 198]], strip: [[48, 47, 44], [36, 35, 33]],
    base: [140, 114, 74], name: [36, 38, 42], mark: [140, 114, 74], caption: [224, 219, 208] },
  { layout: "minimal", id: "graphite", label: "Graphite", bg: [40, 39, 37], ink: [222, 216, 202], metal: [168, 146, 108], muted: [150, 144, 132] },
  { layout: "minimal", id: "linen", label: "Linen", bg: [224, 219, 208], ink: [36, 38, 42], metal: [140, 114, 74], muted: [104, 100, 92] },
  { layout: "minimal", id: "ivory", label: "Ivory", bg: [244, 239, 229], ink: [27, 36, 51], metal: [160, 128, 80], muted: [110, 106, 98] },
]

// Sheet geometry, mm
const W = 95, H = 37
const COLS = 2, ROWS = 7
const GAP_X = 4, GAP_Y = 3
const X0 = (210 - COLS * W - (COLS - 1) * GAP_X) / 2   // 8
const Y0 = (297 - ROWS * H - (ROWS - 1) * GAP_Y) / 2   // 11
export const PER_SHEET = COLS * ROWS

const PT = 0.3528                 // mm per pt
const CAP = 0.7                   // DM Sans cap height, em
const LINE = 0.86                 // name line height, em

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

let shade = 0
/** Vertical gradient as a real PDF axial shading (smooth, vector; no banding) */
export function gradient(doc: jsPDF, x: number, y: number, w: number, h: number, [a, b]: [RGB, RGB]) {
  doc.advancedAPI((d) => {
    const key = `g${++shade}`
    d.addShadingPattern(key, new ShadingPattern("axial", [x, y, x, y + h], [{ offset: 0, color: a }, { offset: 1, color: b }]))
    d.rect(x, y, w, h, null)
    d.fill({ key, matrix: d.Matrix(1, 0, 0, 1, 0, 0) })
  })
}

export function mark(doc: jsPDF, x: number, y: number, size: number, color: RGB) {
  const pts = F.map(([u, v]) => [x + u * size, y + v * size])
  doc.setFillColor(...color)
  doc.lines(pts.slice(1).map(([px, py], i) => [px - pts[i][0], py - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], "F", true)
}

/** Font size for the name lines: the largest ≤ max that fits maxW (with `track` em spacing) and maxH */
function fitName(doc: jsPDF, lines: string[], max: number, maxW: number, maxH: number, track: number) {
  doc.setFontSize(max)
  const widest = Math.max(1, ...lines.map((l) => doc.getTextWidth(l) + track * max * PT * (l.length - 1)))
  const rows = Math.max(lines.length, 1)
  const size = Math.min(max, (max * maxW) / widest, maxH / (((rows - 1) * LINE + CAP) * PT))
  return { size, blockH: ((rows - 1) * LINE + CAP) * size * PT }
}

function classic(doc: jsPDF, x: number, y: number, full: string, caption: string, s: Classic) {
  const BAND = 25.5, STRIP = 9, MARK = 12.5, CAPTION = 10.5
  gradient(doc, x, y, W, BAND, s.band)
  gradient(doc, x, y + BAND, W, STRIP, s.strip)
  doc.setFillColor(...s.base)
  doc.rect(x, y + BAND + STRIP, W, H - BAND - STRIP, "F")

  const mx = x + 7
  mark(doc, mx, y + (BAND - MARK) / 2, MARK, s.mark)

  // Name: bold, a touch tighter, one size for both lines, centred in the band
  const lines = nameLines(full)
  const nx = mx + MARK + 6.5
  doc.setFont("DMSans", "bold")
  const { size, blockH } = fitName(doc, lines, 30, x + W - 5 - nx, BAND - 8, 0)
  doc.setFontSize(size)
  doc.setCharSpace(-size * 0.02 * PT)
  doc.setTextColor(...s.name)
  const top = y + (BAND - blockH) / 2
  lines.forEach((l, i) => doc.text(l, nx, top + CAP * size * PT + i * LINE * size * PT))
  doc.setCharSpace(0)

  // Caption strip: • occasion
  const cy = y + BAND + STRIP / 2
  doc.setFillColor(...s.caption)
  doc.circle(x + 8.6, cy, 0.55, "F")
  doc.setFont("DMSans", "normal")
  doc.setFontSize(CAPTION)
  doc.setTextColor(...s.caption)
  doc.text(doc.splitTextToSize(caption, W - 18)[0] ?? "", x + 11, cy + (CAP * CAPTION * PT) / 2)
}

function minimal(doc: jsPDF, x: number, y: number, full: string, caption: string, s: Minimal) {
  const PAD = 7.5, GAP = 3, LIFT = 0.5, MARK = 8.5, CAPS = 6.4, TRACK = 0.07
  doc.setFillColor(...s.bg)
  doc.rect(x, y, W, H, "F")
  doc.setFont("DMSans", "normal")

  // Occasion in spaced capitals on the bottom margin, a short brass rule above it
  const capBase = y + H - PAD + 0.6
  doc.setFontSize(CAPS)
  doc.setCharSpace(0.18 * CAPS * PT)
  doc.setTextColor(...s.muted)
  doc.text(doc.splitTextToSize(caption.toLocaleUpperCase("uz"), W - 2 * PAD)[0] ?? "", x + PAD, capBase)
  const rule = capBase - CAP * CAPS * PT - GAP
  doc.setDrawColor(...s.metal); doc.setLineWidth(0.2)
  doc.line(x + PAD, rule, x + PAD + 12, rule)

  // Name: medium weight, spaced; centred in the space above the rule
  const lines = nameLines(full)
  const areaTop = y + PAD - 1, areaH = rule - GAP - areaTop
  const { size, blockH } = fitName(doc, lines, 22, W - 2 * PAD - MARK - 5, Math.min(areaH, 14), TRACK)
  const top = areaTop + (areaH - blockH) / 2 - LIFT
  doc.setFontSize(size)
  doc.setCharSpace(TRACK * size * PT)
  doc.setTextColor(...s.ink)
  lines.forEach((l, i) => doc.text(l, x + PAD, top + CAP * size * PT + i * LINE * size * PT))
  doc.setCharSpace(0)

  // Mark: level with the name's capitals; a one-line name is shorter than it, so centre on it instead
  mark(doc, x + W - PAD - MARK, blockH < MARK ? top + (blockH - MARK) / 2 : top, MARK, s.metal)
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
export function drawStickers(doc: jsPDF, names: string[], caption: string, style: StickerStyle) {
  names.forEach((full, i) => {
    const k = i % PER_SHEET
    if (i > 0 && k === 0) doc.addPage()
    if (k === 0) cutMarks(doc)
    const x = X0 + (k % COLS) * (W + GAP_X), y = Y0 + Math.floor(k / COLS) * (H + GAP_Y)
    if (style.layout === "classic") classic(doc, x, y, full, caption, style)
    else minimal(doc, x, y, full, caption, style)
  })
}
