import { useEffect, useRef, useState, type ReactNode } from "react"
import { CaretLeft, CaretRight } from "@phosphor-icons/react"

/** Horizontal row (Kanban columns) with the native scrollbar hidden: past either edge a fade
 *  and a round arrow show there's more, and the arrow scrolls two columns. */
export function EdgeScroll({ className, step = 568, children }: { className: string; step?: number; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ left: false, right: false })
  const measure = () => {
    const el = scroller.current
    if (el) setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    measure()
    // The row's own size and its content (columns added, removed, filled)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const c of Array.from(el.children)) ro.observe(c)
    return () => ro.disconnect()
  })

  return (
    <div className="relative">
      <div ref={scroller} onScroll={measure} className={`overflow-x-auto no-scrollbar ${className}`}>{children}</div>
      {([["left", -1, CaretLeft, "Oldingi ustunlar"], ["right", 1, CaretRight, "Keyingi ustunlar"]] as const).map(([side, dir, Icon, label]) => edge[side] && (
        <div key={side} className={`pointer-events-none absolute inset-y-0 ${side === "left" ? "left-0 bg-linear-to-r" : "right-0 bg-linear-to-l"} w-20 from-surface to-transparent`}>
          <button type="button" onClick={() => scroller.current?.scrollBy({ left: dir * step, behavior: "smooth" })} aria-label={label} title={label}
            className={`pointer-events-auto absolute top-[min(50%,30vh)] -translate-y-1/2 ${side === "left" ? "left-1" : "right-1"} size-9 rounded-full bg-surface border border-line text-ink flex items-center justify-center hover:bg-surface-sunken transition-colors`}>
            <Icon size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
