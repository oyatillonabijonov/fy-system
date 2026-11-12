// "Anketa havolasi" (097): copy the client's personal anketa link or send it by SMS. The SMS goes through the
// normal one-client SmsSend: a template with the {havola} blank gets the link filled in by itself.
import { useEffect, useRef, useState } from "react"
import { ChatCircleText, Copy, IdentificationCard } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useAnketaLink } from "@/hooks/useAnketa"
import { Sheet } from "@/components/ui/Sheet"
import { SmsSend } from "@/components/sms/SmsSend"
import { toast } from "@/lib/toast"

export function AnketaLinkButton({ clientId, clientName, optOut }: { clientId: string; clientName: string | null; optOut?: boolean }) {
  const { hasAccess } = useAuth()
  const link = useAnketaLink()
  const [open, setOpen] = useState(false)
  const [sms, setSms] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc) }
  }, [open])

  if (!hasAccess("mijozlar") && !hasAccess("sotuv-crmn")) return null
  const canSms = hasAccess("sms") || hasAccess("sotuv-crmn")
  const row = "w-full h-10 px-3 flex items-center gap-2.5 rounded-item text-base text-ink hover:bg-mute-ghost-hover disabled:opacity-40"

  function copy() {
    setOpen(false)
    link.mutate(clientId, {
      onSuccess: (url) => void navigator.clipboard.writeText(url).then(() => toast.success("Anketa havolasi nusxalandi", "Mijozga Telegram yoki SMS orqali yuboring")),
    })
  }

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} disabled={link.isPending}
        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-surface-sunken text-sm font-medium text-ink whitespace-nowrap hover:bg-surface-sunken-hover disabled:opacity-50">
        <IdentificationCard size={16} />Anketa havolasi
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-1 z-20 w-56 p-1 rounded-menu bg-surface border border-line">
          <button role="menuitem" type="button" className={row} onClick={copy}><Copy size={18} />Nusxalash</button>
          {canSms && <button role="menuitem" type="button" className={row} onClick={() => { setOpen(false); setSms(true) }}><ChatCircleText size={18} />SMS yuborish</button>}
        </div>
      )}
      <Sheet open={sms} onClose={() => setSms(false)} title={`Anketa SMS — ${clientName ?? ""}`}>
        <p className="text-sm text-ink-muted mb-2.5">Matnida {"{havola}"} bo'lgan shablonni tanlang — havola o'zi qo'yiladi.</p>
        <SmsSend clientId={clientId} clientName={clientName} optOut={optOut} onSent={() => setSms(false)} />
      </Sheet>
    </div>
  )
}
