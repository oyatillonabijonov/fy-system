// Navigation signs for venues (hotel / restaurant halls): A4 landscape, two 285 × 98 mm signs per
// sheet, cut along the middle. Same family as the name stickers (src/lib/stickers): a band with the
// destination in big bold capitals and a large arrow block, then a dark strip with the club's logo.
// Vector throughout; fonts registered by the caller as "DMSans" normal (500) / bold (600).
import type { jsPDF } from "jspdf"
import { cleanName, gradient, mark, type RGB } from "@/lib/stickers/drawStickers"

export type Direction = "right" | "left" | "up" | "down" | "up-right" | "up-left" | "down-right" | "down-left"

export const DIRECTIONS: { id: Direction; glyph: string; label: string }[] = [
  { id: "left", glyph: "←", label: "Chapga" },
  { id: "up", glyph: "↑", label: "To'g'riga" },
  { id: "right", glyph: "→", label: "O'ngga" },
  { id: "up-left", glyph: "↖", label: "Chapga yuqoriga" },
  { id: "up-right", glyph: "↗", label: "O'ngga yuqoriga" },
  { id: "down", glyph: "↓", label: "Pastga" },
  { id: "down-left", glyph: "↙", label: "Chapga pastga" },
  { id: "down-right", glyph: "↘", label: "O'ngga pastga" },
]

const ANGLE: Record<Direction, number> = {
  right: 0, "down-right": 45, down: 90, "down-left": 135, left: 180, "up-left": 225, up: 270, "up-right": 315,
}

export interface SignStyle {
  id: string; label: string
  band: [RGB, RGB]; strip: [RGB, RGB]
  text: RGB; block: RGB; arrow: RGB; club: RGB; mark: RGB
}

export const SIGN_STYLES: SignStyle[] = [
  { id: "signal", label: "Signal", band: [[255, 255, 255], [244, 243, 240]], strip: [[24, 24, 26], [14, 14, 16]],
    text: [20, 20, 24], block: [250, 95, 55], arrow: [255, 255, 255], club: [255, 255, 255], mark: [250, 95, 55] },
  { id: "ember", label: "Ember", band: [[252, 104, 66], [240, 82, 42]], strip: [[24, 24, 26], [14, 14, 16]],
    text: [255, 255, 255], block: [255, 255, 255], arrow: [240, 86, 46], club: [255, 255, 255], mark: [250, 95, 55] },
]

// Sheet: A4 landscape, two signs stacked, cut line in the 2 mm gap
const SW = 285, SH = 98, GAP = 2
const X0 = (297 - SW) / 2, Y0 = (210 - 2 * SH - GAP) / 2
const BAND = 74, STRIP = SH - BAND
const PAD = 9, BLOCK = 58
const PT = 0.3528, CAP = 0.7, LINE = 0.9

// Arrow pointing right in a unit box; rotated about its centre for the other directions
const ARROW: [number, number][] = [[0.1, 0.4], [0.5, 0.4], [0.5, 0.16], [0.9, 0.5], [0.5, 0.84], [0.5, 0.6], [0.1, 0.6]]

function arrow(doc: jsPDF, x: number, y: number, size: number, dir: Direction, color: RGB) {
  const a = (ANGLE[dir] * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  const pts = ARROW.map(([u, v]) => {
    const dx = u - 0.5, dy = v - 0.5
    return [x + (0.5 + dx * c - dy * s) * size, y + (0.5 + dx * s + dy * c) * size]
  })
  doc.setFillColor(...color)
  doc.lines(pts.slice(1).map(([px, py], i) => [px - pts[i][0], py - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], "F", true)
}

/** "Tadbirlar zali" → up to two balanced lines of capitals */
function placeLines(doc: jsPDF, text: string, maxW: number): string[] {
  const words = cleanName(text).split(" ").filter(Boolean)
  if (words.length < 2 || doc.getTextWidth(words.join(" ")) <= maxW) return [words.join(" ")]
  // Split where the two lines come out most even
  let best = 1, bestDiff = Infinity
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(doc.getTextWidth(words.slice(0, i).join(" ")) - doc.getTextWidth(words.slice(i).join(" ")))
    if (d < bestDiff) { bestDiff = d; best = i }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")]
}

export interface Sign { place: string; direction: Direction }

function sign(doc: jsPDF, x: number, y: number, { place, direction }: Sign, st: SignStyle) {
  gradient(doc, x, y, SW, BAND, st.band)
  gradient(doc, x, y + BAND, SW, STRIP, st.strip)

  // Arrow block on the side the arrow points to (left for straight up/down)
  const right = direction.includes("right")
  const bx = right ? x + SW - PAD - BLOCK : x + PAD, by = y + (BAND - BLOCK) / 2
  doc.setFillColor(...st.block)
  doc.rect(bx, by, BLOCK, BLOCK, "F")
  arrow(doc, bx + BLOCK * 0.1, by + BLOCK * 0.1, BLOCK * 0.8, direction, st.arrow)

  // Destination: the largest bold capitals that fit beside the block, one or two lines
  const tx = right ? x + PAD : bx + BLOCK + 12
  const maxW = SW - 2 * PAD - BLOCK - 12
  doc.setFont("DMSans", "bold")
  doc.setFontSize(100)
  const lines = placeLines(doc, place, maxW)
  const widest = Math.max(1, ...lines.map((l) => doc.getTextWidth(l)))
  const size = Math.min(110, (100 * maxW) / widest, (BAND - 22) / (((lines.length - 1) * LINE + CAP) * PT))
  const blockH = ((lines.length - 1) * LINE + CAP) * size * PT
  doc.setFontSize(size)
  doc.setCharSpace(-size * 0.015 * PT)
  doc.setTextColor(...st.text)
  const top = y + (BAND - blockH) / 2
  lines.forEach((l, i) => doc.text(l, tx, top + CAP * size * PT + i * LINE * size * PT))
  doc.setCharSpace(0)

  // Strip: the club's logo — mark and name — on the same side as the destination
  const cy = y + BAND + STRIP / 2, CLUB = 22, m = 13
  doc.setFont("DMSans", "bold")
  doc.setFontSize(CLUB)
  doc.setTextColor(...st.club)
  const club = "Fikr Yetakchilari", cw = doc.getTextWidth(club)
  const lx = right ? x + PAD : x + SW - PAD - m - 4.5 - cw
  mark(doc, lx, cy - m / 2, m, st.mark)
  doc.text(club, lx + m + 4.5, cy + (CAP * CLUB * PT) / 2)
}

/** Draws every sign onto `doc` (A4 landscape, mm), two per page */
export function drawSigns(doc: jsPDF, signs: Sign[], style: SignStyle) {
  signs.forEach((s, i) => {
    if (i > 0 && i % 2 === 0) doc.addPage()
    if (i % 2 === 0) {
      // cut guide in the gap between the two signs, outside the artwork
      doc.setDrawColor(190, 190, 190); doc.setLineWidth(0.1)
      const cy = Y0 + SH + GAP / 2
      doc.line(0, cy, X0 - 1.5, cy); doc.line(X0 + SW + 1.5, cy, 297, cy)
    }
    sign(doc, X0, Y0 + (i % 2) * (SH + GAP), s, style)
  })
}
