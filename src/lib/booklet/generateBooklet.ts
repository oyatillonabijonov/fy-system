import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { BookletPage } from "./BookletPage"
import type { Event, Participant } from "../supabase/queries/events"

const CARDS_PER_PAGE = 4

export async function generateBooklet(
  event: Event,
  participants: Participant[]
): Promise<void> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas-pro"),
  ])

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  // Pre-fetch photos as data URLs. Storage responses lack `Vary: Origin`, so an
  // <img> loaded without CORS elsewhere on the page (participants table) gets
  // cached without CORS headers; the booklet's crossOrigin="anonymous" <img>
  // then reuses that cached response and html2canvas taints/drops it. Data URLs
  // are same-origin — this also covers photos on a different Supabase host.
  const photoData = new Map<string, string>()
  await Promise.all(
    participants
      .filter((p) => p.photo_url)
      .map(async (p) => {
        try {
          const res = await fetch(p.photo_url!, { mode: "cors", cache: "no-store" })
          if (!res.ok) return
          const blob = await res.blob()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = () => reject(new Error("read failed"))
            reader.readAsDataURL(blob)
          })
          photoData.set(p.photo_url!, dataUrl)
        } catch {
          // leave unmapped → card renders the initials placeholder
        }
      })
  )

  const resolved = participants.map((p) =>
    p.photo_url && photoData.has(p.photo_url)
      ? { ...p, photo_url: photoData.get(p.photo_url)! }
      : p
  )

  const totalPages = Math.ceil(resolved.length / CARDS_PER_PAGE)

  for (let page = 0; page < totalPages; page++) {
    const pageParticipants = resolved.slice(
      page * CARDS_PER_PAGE,
      (page + 1) * CARDS_PER_PAGE
    )

    // Off-screen container
    const container = document.createElement("div")
    container.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      z-index: -1;
      background: white;
    `
    document.body.appendChild(container)

    // Render React page synchronously
    const root = createRoot(container)
    flushSync(() => {
      root.render(
        createElement(BookletPage, {
          event,
          participants: pageParticipants,
          pageNumber: page + 1,
          isFirstPage: page === 0,
        })
      )
    })

    // Wait for images to load
    const images = container.querySelectorAll("img")
    if (images.length > 0) {
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) return resolve()
              img.onload = () => resolve()
              img.onerror = () => resolve()
            })
        )
      )
    }

    // Small delay for font rendering
    await new Promise((r) => setTimeout(r, 100))

    const target = container.firstChild as HTMLElement

    // Screenshot
    const canvas = await html2canvas(target, {
      scale: 3,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      width: target.scrollWidth,
      height: target.scrollHeight,
    })

    // Add page to PDF
    if (page > 0) doc.addPage()
    const imgData = canvas.toDataURL("image/jpeg", 0.95)
    doc.addImage(imgData, "JPEG", 0, 0, 210, 297)

    // Cleanup
    root.unmount()
    document.body.removeChild(container)
  }

  // Download
  const fileName = `${event.name.replace(/\s+/g, "_")}_booklet.pdf`
  doc.save(fileName)
}
