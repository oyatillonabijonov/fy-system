import { useId, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import { useDialog } from "@/hooks/useDialog"
import { useMedia } from "@/hooks/useMedia"
import { sheet, sheetMotion } from "./sheetStyles"

/** Bottom sheet on a phone, centred dialog from sm: title row, scrolling body, optional sticky footer */
export function Sheet({ open, onClose, title, footer, className = "sm:max-w-md", children }: {
  open: boolean; onClose: () => void; title: string; footer?: ReactNode; className?: string; children: ReactNode
}) {
  const phone = useMedia("(width < 40rem)")
  return createPortal(
    <AnimatePresence>{open && <Panel phone={phone} onClose={onClose} title={title} footer={footer} className={className}>{children}</Panel>}</AnimatePresence>,
    document.body,
  )
}

function Panel({ phone, onClose, title, footer, className, children }: {
  phone: boolean; onClose: () => void; title: string; footer?: ReactNode; className: string; children: ReactNode
}) {
  const titleId = useId()
  const ref = useDialog<HTMLDivElement>(onClose)
  return (
    <div className={sheet.wrap}>
      <motion.div className="absolute inset-0 bg-surface-overlay" onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />
      <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`${sheet.panel} ${className}`} {...sheetMotion(phone)}>
        <div className={sheet.grabber} />
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-2 pb-3 sm:pt-5">
          <h3 id={titleId} className="text-lg sm:text-md font-semibold text-ink truncate">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Yopish"
            className="size-10 sm:size-8 -mr-2 sm:-mr-1 shrink-0 rounded-full flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover">
            <X size={20} />
          </button>
        </div>
        <div className={`${sheet.body} px-4 sm:px-5 ${footer ? "pb-4" : "pb-[calc(16px+env(safe-area-inset-bottom))] sm:pb-5"}`}>{children}</div>
        {footer && <div className={sheet.footer}>{footer}</div>}
      </motion.div>
    </div>
  )
}
