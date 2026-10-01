import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react"
import { CaretLeft, CaretRight } from "@phosphor-icons/react"

/** Horizontal row (Kanban columns) with the native scrollbar hidden: past either edge a fade
 *  and a round arrow show there's more (the arrow scrolls two columns), and the empty space
 *  drags the row by hand. While a card is dragged (`dragging`) the arrows light up: holding
 *  the card at an edge scrolls the row (@hello-pangea/dnd auto-scroll). */
export function EdgeScroll({ className, dragging = false, step = 568, children }: {
  className: string
  dragging?: boolean
  step?: number
  children: ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const pan = useRef<{ x: number; left: number } | null>(null)
  const [edge, setEdge] = useState({ left: false, right: false })
  const [panning, setPanning] = useState(false)

  // Only a real change re-renders (an unconditional set here looped renders and froze the page)
  const measure = () => {
    const el = scroller.current
    if (!el) return
    const left = el.scrollLeft > 4, right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setEdge((e) => (e.left === left && e.right === right ? e : { left, right }))
  }
  useEffect(measure)   // columns added/removed or filled
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Drag the empty space (not a card, button or field) to scroll by hand
  const down = (e: PointerEvent<HTMLDivElement>) => {
    const el = scroller.current
    if (!el || e.button !== 0 || (e.target as HTMLElement).closest("[data-rfd-drag-handle-draggable-id], button, a, input, textarea")) return
    pan.current = { x: e.clientX, left: el.scrollLeft }
    el.setPointerCapture(e.pointerId)
    setPanning(true)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (pan.current && scroller.current) scroller.current.scrollLeft = pan.current.left - (e.clientX - pan.current.x)
  }
  const up = () => { pan.current = null; setPanning(false) }

  return (
    <div className="relative">
      <div ref={scroller} onScroll={measure} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className={`overflow-x-auto no-scrollbar ${panning ? "cursor-grabbing select-none" : ""} ${className}`}>{children}</div>
      {([["left", -1, CaretLeft, "Oldingi ustunlar"], ["right", 1, CaretRight, "Keyingi ustunlar"]] as const).map(([side, dir, Icon, label]) => (
        <div key={side} aria-hidden={!edge[side]}
          className={`pointer-events-none absolute inset-y-0 w-16 from-surface to-transparent transition-opacity duration-150 ${side === "left" ? "left-0 bg-linear-to-r" : "right-0 bg-linear-to-l"} ${edge[side] ? "opacity-100" : "opacity-0"}`}>
          <button type="button" tabIndex={edge[side] ? 0 : -1} onClick={() => scroller.current?.scrollBy({ left: dir * step, behavior: "smooth" })} aria-label={label} title={label}
            className={`${edge[side] ? "pointer-events-auto" : ""} absolute top-[min(50%,30vh)] -translate-y-1/2 ${side === "left" ? "left-1" : "right-1"} size-9 rounded-full border flex items-center justify-center transition-colors ${dragging ? "bg-accent text-ink-on-accent border-transparent" : "bg-surface border-line text-ink hover:bg-surface-sunken"}`}>
            <Icon size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
