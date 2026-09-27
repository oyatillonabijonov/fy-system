// Deterministic palettes for events — shared by the generated banner and the
// tab / list dot so the same event always looks consistent.
// Muted, dark-based pairs: calm enough for a business tool, distinct enough to tell apart.
export interface EventPalette {
  /** Dark ground of the banner */
  base: string
  /** Main glow; also the event's dot colour */
  a: string
  /** Secondary glow */
  b: string
}

const PALETTES: EventPalette[] = [
  { base: "#15171c", a: "#3e4f73", b: "#8394b5" }, // slate
  { base: "#131a19", a: "#2f5f58", b: "#7fa89f" }, // teal
  { base: "#1b1615", a: "#74463d", b: "#bb917b" }, // terracotta
  { base: "#17151d", a: "#51437a", b: "#968bbd" }, // violet
  { base: "#171914", a: "#56613a", b: "#a3ab7c" }, // olive
  { base: "#1a1714", a: "#735a3a", b: "#c6a77f" }, // sand
  { base: "#13181c", a: "#305873", b: "#83aac2" }, // steel
  { base: "#171717", a: "#4d4d4d", b: "#9a9a9a" }, // graphite
]

export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function eventPalette(name: string): EventPalette {
  return PALETTES[hashStr(name || "tadbir") % PALETTES.length]
}

export function eventTint(name: string): string {
  return eventPalette(name).a
}
