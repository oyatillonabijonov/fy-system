import type { jsPDF } from "jspdf"
import medium from "@/assets/fonts/DMSans-500.ttf?url"
import semibold from "@/assets/fonts/DMSans-600.ttf?url"

/** jsPDF takes a TTF as a base64 string */
async function base64(url: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Embeds DM Sans as family "DMSans": "normal" = 500, "bold" = 600 (stickers, navigation signs) */
export async function addDmSans(doc: jsPDF): Promise<void> {
  const [f500, f600] = await Promise.all([base64(medium), base64(semibold)])
  doc.addFileToVFS("DMSans-500.ttf", f500)
  doc.addFont("DMSans-500.ttf", "DMSans", "normal")
  doc.addFileToVFS("DMSans-600.ttf", f600)
  doc.addFont("DMSans-600.ttf", "DMSans", "bold")
}

/** "Biznes nonushta 3.0" → "Biznes_nonushta_3_0" for file names */
export const fileSafe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "_")
