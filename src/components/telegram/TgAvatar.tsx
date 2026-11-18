// A chat avatar like Telegram's: the photo, else initials on a colour picked from the name (data palette,
// the same hues as Vazifalar / Integratsiyalar groups).
const PALETTE = [["#CECBF6", "#3C3489"], ["#9FE1CB", "#085041"], ["#F5C4B3", "#712B13"], ["#F4C0D1", "#72243E"], ["#B5D4F4", "#0C447C"], ["#FAC775", "#633806"], ["#C0DD97", "#27500A"]] as const
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0) >>> 0
const initials = (s: string) => s.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"

export function TgAvatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const box = { width: size, height: size, fontSize: Math.round(size * 0.38) }
  if (url) return <img src={url} alt="" className="rounded-full object-cover shrink-0" style={box} />
  const [bg, fg] = PALETTE[hash(name) % PALETTE.length]
  return <span className="rounded-full shrink-0 inline-flex items-center justify-center font-semibold" style={{ ...box, backgroundColor: bg, color: fg }}>{initials(name)}</span>
}
