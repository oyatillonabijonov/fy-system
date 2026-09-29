import { useSyncExternalStore } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, X, Info } from "@phosphor-icons/react"
import { toastStore, dismiss, type ToastKind } from "@/lib/toast"

// Apple "Dynamic Island" look: a dark capsule drops from the top centre and lifts
// away. Fixed dark colours on purpose (like the booklet) — it reads over every theme.
const ICON: Record<ToastKind, { Icon: typeof Check; bg: string }> = {
  success: { Icon: Check, bg: "#1D9E75" },
  error: { Icon: X, bg: "#E24B4A" },
  info: { Icon: Info, bg: "#378ADD" },
}

export function Toaster() {
  const items = useSyncExternalStore(toastStore.subscribe, toastStore.get)
  return (
    <div aria-live="polite" className="fixed top-3 inset-x-0 z-[300] flex flex-col items-center gap-2 pointer-events-none px-4">
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const { Icon, bg } = ICON[t.kind]
          return (
            <motion.button
              key={t.id}
              type="button"
              layout
              onClick={() => dismiss(t.id)}
              initial={{ opacity: 0, y: -28, scale: 0.86 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -24, scale: 0.9, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              role={t.kind === "error" ? "alert" : "status"}
              className="pointer-events-auto max-w-[min(92vw,460px)] flex items-center gap-2.5 rounded-full pl-1.5 pr-4 py-1.5 text-left"
              style={{ backgroundColor: "#1c1c1e", color: "#fff", boxShadow: "0 0 0 0.5px rgba(255,255,255,0.12)" }}
            >
              <span className="size-7 shrink-0 rounded-full flex items-center justify-center" style={{ backgroundColor: bg }}>
                <Icon size={16} weight="bold" />
              </span>
              <span className="min-w-0 text-sm leading-tight py-0.5">
                <span className="font-semibold">{t.title}</span>
                {t.detail && <span className="text-white/70"> · {t.detail}</span>}
              </span>
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
