import type { ReactNode } from "react"

/** The page's main action on a phone/tablet: a pill pinned above the tab bar (hidden from lg, where the
 *  page's own button is). Label it with a verb: "Vazifa", "Kirim", "Mijoz". */
export function Fab({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="lg:hidden fixed right-4 bottom-[calc(var(--tabbar-h)+16px)] z-30 h-12 pl-4 pr-5 rounded-full bg-accent text-ink-on-accent text-base font-semibold flex items-center gap-2 active:opacity-85">
      {icon}{label}
    </button>
  )
}
