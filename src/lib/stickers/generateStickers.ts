import medium from "@/assets/fonts/DMSans-500.ttf?url"
import semibold from "@/assets/fonts/DMSans-600.ttf?url"
import { drawStickers, type StickerStyle } from "./drawStickers"

/** jsPDF takes a TTF as a base64 string */
async function base64(url: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Builds the sticker sheets in the browser and downloads them as `<event>_stikerlar.pdf` */
export async function generateStickers(names: string[], caption: string, style: StickerStyle, fileBase: string): Promise<void> {
  const [{ jsPDF }, f500, f600] = await Promise.all([import("jspdf"), base64(medium), base64(semibold)])
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
  doc.addFileToVFS("DMSans-500.ttf", f500)
  doc.addFont("DMSans-500.ttf", "DMSans", "normal")
  doc.addFileToVFS("DMSans-600.ttf", f600)
  doc.addFont("DMSans-600.ttf", "DMSans", "bold")
  drawStickers(doc, names, caption, style)
  doc.save(`${fileBase.replace(/[^\p{L}\p{N}]+/gu, "_")}_stikerlar.pdf`)
}
