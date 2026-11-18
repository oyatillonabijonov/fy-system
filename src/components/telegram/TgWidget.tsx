// The blue Telegram button + floating chat window (variant B, chosen 2026-11-18, AmoCRM style) on the bitim page
// and the client card. Open state is the `tg` URL param, so the call card and the phone menu can open it.
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { useSearchParams } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { TelegramLogo } from "@phosphor-icons/react"
import { useMedia } from "@/hooks/useMedia"
import { useClientTelegram } from "@/hooks/useTelegram"
import { TgBadge } from "./TgBadge"
import { TgChat } from "./TgChat"

export function useTgWindow() {
  const [params, setParams] = useSearchParams()
  const open = params.get("tg") === "1"
  const set = (v: boolean) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set("tg", "1"); else n.delete("tg"); return n }, { replace: true })
  return [open, set] as const
}

/** `pill`: a "Telegram" button in place (the client card, itself a dialog) instead of the floating round one */
export function TgWidget({ clientId, leadId, title, phone, image, pill }: { clientId: string; leadId: string | null; title: string; phone: string | null; image?: string | null; pill?: boolean }) {
  const [open, setOpen] = useTgWindow()
  const phoneView = useMedia("(width < 40rem)")
  const { data } = useClientTelegram(clientId)
  const unread = (data?.chats ?? []).reduce((s, c) => s + c.unread, 0)

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("keydown", esc)
    return () => document.removeEventListener("keydown", esc)
  }, [open])   // eslint-disable-line react-hooks/exhaustive-deps

  if (!phone && !data?.chats.length) return null
  const panel = createPortal(
    <>
      <AnimatePresence>
        {open && (
          <motion.div key="tg" role="dialog" aria-label={`Telegram — ${title}`}
            initial={{ opacity: 0, y: 16, scale: phoneView ? 1 : 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className={phoneView
              ? "fixed inset-0 z-[120] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-surface"
              : "fixed right-6 bottom-24 z-[120] w-[380px] h-[560px] max-h-[calc(100dvh-8rem)] rounded-surface border border-line overflow-hidden bg-surface"}>
            <TgChat clientId={clientId} leadId={leadId} title={title} phone={phone} image={image} onCollapse={phoneView ? undefined : () => setOpen(false)} onClose={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      {pill ? null : !(open && phoneView) && (
        <button type="button" onClick={() => setOpen(!open)} aria-label={open ? "Telegram oynasini yig'ish" : "Telegram"} aria-expanded={open}
          className="fixed right-6 max-lg:right-4 bottom-6 max-lg:bottom-[calc(var(--tabbar-h)+5.5rem)] z-[70] size-14 rounded-full bg-[#2AABEE] text-white flex items-center justify-center hover:bg-[#229ED9] transition-colors">
          <TelegramLogo size={28} weight="fill" />
          {unread > 0 && <span className="absolute -top-1 -right-1"><TgBadge n={unread} /></span>}
        </button>
      )}
    </>,
    document.body,
  )
  if (!pill) return panel
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="relative h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-[#2AABEE] text-white text-sm font-medium whitespace-nowrap hover:bg-[#229ED9]">
        <TelegramLogo size={16} weight="fill" />Telegram
        {unread > 0 && <span className="absolute -top-1.5 -right-1.5"><TgBadge n={unread} /></span>}
      </button>
      {panel}
    </>
  )
}
