import { useSyncExternalStore } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, WarningCircle, Info, X } from "@phosphor-icons/react"
import { toastStore, dismiss, type ToastKind } from "@/lib/toast"

// A system card that drops from the top centre like Apple's Dynamic Island:
// it grows out of a narrow pill and lifts back into it. Tokens, so it follows the theme.
const ICON: Record<ToastKind, { Icon: typeof Check; tone: string }> = {
  success: { Icon: Check, tone: "bg-success-soft text-success-text" },
  error: { Icon: WarningCircle, tone: "bg-danger-soft text-danger-text" },
  info: { Icon: Info, tone: "bg-info-soft text-info-text" },
}

export function Toaster() {
  const items = useSyncExternalStore(toastStore.subscribe, toastStore.get)
  return (
    <div aria-live="polite" className="fixed top-3 inset-x-0 z-[300] flex flex-col items-center gap-2 pointer-events-none px-4">
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const { Icon, tone } = ICON[t.kind]
          return (
            <motion.button
              key={t.id}
              type="button"
              layout
              onClick={() => dismiss(t.id)}
              initial={{ opacity: 0, y: -32, scaleX: 0.45, scaleY: 0.6 }}
              animate={{ opacity: 1, y: 0, scaleX: 1, scaleY: 1 }}
              exit={{ opacity: 0, y: -28, scaleX: 0.5, scaleY: 0.6, transition: { duration: 0.22 } }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              role={t.kind === "error" ? "alert" : "status"}
              className="pointer-events-auto w-[min(92vw,380px)] flex items-start gap-3 p-3.5 rounded-surface bg-surface-raised border border-line text-left"
            >
              <span className={`size-9 shrink-0 rounded-control flex items-center justify-center ${tone}`}>
                <Icon size={20} />
              </span>
              <span className="min-w-0 flex-1 flex flex-col gap-0.5 py-0.5">
                <span className="text-base font-semibold text-ink leading-snug">{t.title}</span>
                {t.detail && <span className="text-sm text-ink-muted leading-snug break-words">{t.detail}</span>}
              </span>
              <X size={16} className="shrink-0 mt-1 text-ink-muted" aria-hidden="true" />
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
