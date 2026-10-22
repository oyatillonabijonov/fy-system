import { addDmSans, fileSafe } from "@/lib/pdfFonts"
import { drawStickers, type StickerStyle } from "./drawStickers"

/** Builds the sticker sheets in the browser and downloads them as `<event>_stikerlar.pdf` */
export async function generateStickers(names: string[], caption: string, style: StickerStyle, fileBase: string): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
  await addDmSans(doc)
  drawStickers(doc, names, caption, style)
  doc.save(`${fileSafe(fileBase)}_stikerlar.pdf`)
}
