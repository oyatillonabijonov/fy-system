import { addDmSans, fileSafe } from "@/lib/pdfFonts"
import { drawSigns, type Sign, type SignStyle } from "./drawSigns"

/** Builds the navigation signs in the browser and downloads them as `<event>_navigatsiya.pdf` */
export async function generateSigns(signs: Sign[], style: SignStyle, fileBase: string): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" })
  await addDmSans(doc)
  drawSigns(doc, signs, style)
  doc.save(`${fileSafe(fileBase)}_navigatsiya.pdf`)
}
