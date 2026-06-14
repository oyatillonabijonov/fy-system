// Deterministic solid tints for events — shared by the banner background and
// the browser-tab favicon dot so the same event always looks consistent.
const TINTS = [
  "#141414",
  "#1E293B",
  "#1C2A3A",
  "#27272A",
  "#33271E",
  "#22303A",
  "#2A2433",
  "#1F2A24",
]

export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function eventTint(name: string): string {
  return TINTS[hashStr(name || "tadbir") % TINTS.length]
}
