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

  const totalPages = Math.ceil(participants.length / CARDS_PER_PAGE)

  for (let page = 0; page < totalPages; page++) {
    const pageParticipants = participants.slice(
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
