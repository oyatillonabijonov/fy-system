import { useSyncExternalStore } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle, WarningCircle, Info, X } from "@phosphor-icons/react"
import { toastStore, dismiss, type ToastKind } from "@/lib/toast"

// A system card (same radius/fill/hairline as the app's cards) dropping in at the
// top centre. Tokens, so it follows the theme; the one soft shadow is --toast-shadow.
const ICON: Record<ToastKind, { Icon: typeof CheckCircle; tone: string }> = {
  success: { Icon: CheckCircle, tone: "text-success-text" },
  error: { Icon: WarningCircle, tone: "text-danger-text" },
  info: { Icon: Info, tone: "text-info-text" },
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
              initial={{ opacity: 0, y: -16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.97, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              role={t.kind === "error" ? "alert" : "status"}
              className="group pointer-events-auto w-[min(92vw,340px)] flex items-start gap-2.5 px-3.5 py-3 rounded-surface bg-surface-raised border border-line text-left"
              style={{ boxShadow: "var(--toast-shadow)" }}
            >
              <Icon size={20} className={`shrink-0 ${tone}`} />
              <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                <span className="text-base font-semibold text-ink leading-snug">{t.title}</span>
                {t.detail && <span className="text-sm text-ink-muted leading-snug break-words">{t.detail}</span>}
              </span>
              <X size={12} weight="bold" className="shrink-0 mt-1 text-ink-faint group-hover:text-ink" aria-hidden="true" />
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
