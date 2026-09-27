// Deterministic tint per event — the dot on event tabs / finance headers,
// so the same event always carries the same colour. Muted, business-calm hues.
const TINTS = [
  "#3e4f73", // slate
  "#2f5f58", // teal
  "#74463d", // terracotta
  "#51437a", // violet
  "#56613a", // olive
  "#735a3a", // sand
  "#305873", // steel
  "#4d4d4d", // graphite
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function eventTint(name: string): string {
  return TINTS[hashStr(name || "tadbir") % TINTS.length]
}
