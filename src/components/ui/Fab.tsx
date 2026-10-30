import type { ReactNode } from "react"
import { useMainScroll } from "@/hooks/useMainScroll"

/** The page's main action on a phone/tablet: a pill pinned above the tab bar (hidden from lg, where the
 *  page's own button is). Label it with a verb: "Vazifa", "Kirim", "Mijoz". While the page scrolls down it
 *  folds to its icon, so it doesn't sit on the rows' own buttons; scrolling back up unfolds it. */
export function Fab({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  const folded = useMainScroll() === "down"
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={`lg:hidden fixed right-4 bottom-[calc(var(--tabbar-h)+16px)] z-30 h-14 min-w-14 rounded-full bg-accent text-ink-on-accent text-base font-semibold flex items-center justify-center active:opacity-85 transition-[padding] duration-200 ${folded ? "px-0" : "pl-[18px] pr-6"}`}>
      {icon}
      <span className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ${folded ? "max-w-0 opacity-0 ml-0" : "max-w-40 opacity-100 ml-2"}`}>{label}</span>
    </button>
  )
}
