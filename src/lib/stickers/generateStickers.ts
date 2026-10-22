import fontUrl from "@/assets/fonts/DMSans-500.ttf?url"
import { drawStickers, type StickerPalette } from "./drawStickers"

/** Builds the sticker sheets in the browser and downloads them as `<event>_stikerlar.pdf` */
export async function generateStickers(names: string[], caption: string, palette: StickerPalette, fileBase: string): Promise<void> {
  const [{ jsPDF }, font] = await Promise.all([
    import("jspdf"),
    fetch(fontUrl).then((r) => r.arrayBuffer()),
  ])
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
  // jsPDF takes the TTF as a binary string
  let bin = ""
  const bytes = new Uint8Array(font)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  doc.addFileToVFS("DMSans-500.ttf", btoa(bin))
  doc.addFont("DMSans-500.ttf", "DMSans", "normal")
  drawStickers(doc, names, caption, palette)
  doc.save(`${fileBase.replace(/[^\p{L}\p{N}]+/gu, "_")}_stikerlar.pdf`)
}
