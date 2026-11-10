// Name stickers and venue signs as PDF bytes: the web's drawing code (copied next to this file) on a server-side jsPDF.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { jsPDF } from "jspdf"
import { cleanName, drawStickers, STICKER_STYLES } from "./drawStickers"
import { DIRECTIONS, drawSigns, SIGN_STYLES } from "./drawSigns"
import type { Sign } from "./drawSigns"

const MAX_NAMES = 600
const MAX_SIGNS = 100

const FONT_DIR = join(import.meta.dir, "..", "..", "fonts")
const b64 = (file: string) => readFileSync(join(FONT_DIR, file)).toString("base64")
const F500 = b64("DMSans-500.ttf")
const F600 = b64("DMSans-600.ttf")

/** As src/lib/pdfFonts.ts addDmSans: family "DMSans", "normal" = 500, "bold" = 600 */
function addDmSans(doc: jsPDF): void {
  doc.addFileToVFS("DMSans-500.ttf", F500)
  doc.addFont("DMSans-500.ttf", "DMSans", "normal")
  doc.addFileToVFS("DMSans-600.ttf", F600)
  doc.addFont("DMSans-600.ttf", "DMSans", "bold")
}

/** "Biznes nonushta 3.0" → "Biznes_nonushta_3_0" for file names */
export const fileSafe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "_")

const finish = (doc: jsPDF) => ({ bytes: new Uint8Array(doc.output("arraybuffer")), pages: doc.getNumberOfPages() })

export async function stickersPdf(names: string[], caption: string, style: string): Promise<{ bytes: Uint8Array; pages: number }> {
  const st = STICKER_STYLES.find((s) => s.id === style)
  if (!st) throw new Error(`Noma'lum stiker uslubi: ${style} (${STICKER_STYLES.map((s) => s.id).join(", ")})`)
  const list = names.map((n) => n.trim()).filter(Boolean)
  if (!list.length) throw new Error("Stiker uchun ism yo'q")
  if (list.length > MAX_NAMES) throw new Error(`Ko'pi bilan ${MAX_NAMES} ta ism (${list.length} ta berildi)`)
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
  addDmSans(doc)
  drawStickers(doc, list, caption.trim(), st)
  return finish(doc)
}

export async function signsPdf(signs: { place: string; direction: string }[], style: string): Promise<{ bytes: Uint8Array; pages: number }> {
  const st = SIGN_STYLES.find((s) => s.id === style)
  if (!st) throw new Error(`Noma'lum belgi uslubi: ${style} (${SIGN_STYLES.map((s) => s.id).join(", ")})`)
  const list: Sign[] = []
  for (const s of signs) {
    if (!cleanName(s.place)) continue
    const d = DIRECTIONS.find((x) => x.id === s.direction)
    if (!d) throw new Error(`Noma'lum direction: ${s.direction} (${DIRECTIONS.map((x) => x.id).join(", ")})`)
    list.push({ place: s.place, direction: d.id })
  }
  if (!list.length) throw new Error("Belgi uchun joy nomi yo'q")
  if (list.length > MAX_SIGNS) throw new Error(`Ko'pi bilan ${MAX_SIGNS} ta belgi (${list.length} ta berildi)`)
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" })
  addDmSans(doc)
  drawSigns(doc, list, st)
  return finish(doc)
}
