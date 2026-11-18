// A client's Telegram conversation (2026-11-18 redesign): header, bubbles by day, composer.
// Used by the floating window (TgWidget) and the Sotuv bo'limi → Telegram page.
import { useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { ArrowSquareOut, Check, Checks, Minus, Paperclip, TelegramLogo, X } from "@phosphor-icons/react"
import { useClientTelegram, useReadTelegram } from "@/hooks/useTelegram"
import { tgFileUrl, type TgMessage } from "@/lib/supabase/queries/telegram"
import { withDays } from "@/lib/telegram"
import { tashkentToday } from "@/lib/period"
import { formatPhone } from "@/lib/format"
import { toast } from "@/lib/toast"
import { PersonDot } from "@/components/vazifalar/pickers"
import { TgComposer } from "./TgComposer"

const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
const ICON_BTN = "size-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover"

export function TgChat({ clientId, leadId, title, phone, image, onClose, onCollapse, bitimLink }: {
  clientId: string; leadId: string | null; title: string; phone: string | null; image?: string | null
  onClose?: () => void; onCollapse?: () => void; bitimLink?: boolean
}) {
  const { data, isLoading, dataUpdatedAt } = useClientTelegram(clientId)
  const read = useReadTelegram()
  const body = useRef<HTMLDivElement>(null)
  const messages = data?.messages ?? []
  const unread = (data?.chats ?? []).some((c) => c.unread > 0)

  // open = seen: the lead gets ✓✓, the badges clear — checked on every refresh, so a message that lands
  // while the window is open is read too
  useEffect(() => { if (unread && !read.isPending) read.mutate(clientId) }, [unread, dataUpdatedAt, clientId])   // eslint-disable-line react-hooks/exhaustive-deps
  // newest at the bottom; scrolls only this list (scrollIntoView would move the page too)
  useEffect(() => { const el = body.current; if (el) el.scrollTop = el.scrollHeight }, [messages.length])

  const today = tashkentToday()
  return (
    <div className="flex flex-col h-full min-h-0 bg-surface">
      <div className="flex items-center gap-3 px-3 h-14 border-b border-line shrink-0">
        <span className="relative shrink-0">
          <PersonDot name={title} url={image ?? null} size={36} />
          <span className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-[#2AABEE] text-white flex items-center justify-center ring-2 ring-surface"><TelegramLogo size={10} weight="fill" /></span>
        </span>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-base font-semibold text-ink truncate">{title}</span>
          <span className="text-sm text-ink-muted truncate tabular-nums">{phone ? formatPhone(phone) : "Telegram"}</span>
        </span>
        {bitimLink && leadId && <Link to={`/sotuv/bitim/${leadId}`} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-mute-soft text-sm text-ink hover:bg-mute-soft-hover whitespace-nowrap"><ArrowSquareOut size={16} />Bitim</Link>}
        {onCollapse && <button type="button" aria-label="Yig'ish" onClick={onCollapse} className={ICON_BTN}><Minus size={18} /></button>}
        {onClose && <button type="button" aria-label="Yopish" onClick={onClose} className={ICON_BTN}><X size={18} /></button>}
      </div>

      <div ref={body} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 flex flex-col gap-1 bg-surface-sunken">
        {isLoading ? <p className="m-auto text-sm text-ink-muted">Yuklanmoqda…</p>
          : messages.length === 0 ? (
            <div className="m-auto flex flex-col items-center gap-2 text-center px-6">
              <span className="size-12 rounded-full bg-[#2AABEE] text-white flex items-center justify-center"><TelegramLogo size={28} weight="fill" /></span>
              <p className="text-sm text-ink-muted">Hali yozishma yo'q — birinchi xabarni yuboring</p>
            </div>
          )
          : withDays(messages, today).map((m, i) => "day" in m
            ? <div key={`d${i}`} className="self-center my-2 px-3 h-6 inline-flex items-center rounded-full bg-surface text-xs text-ink-muted">{m.day}</div>
            : <Bubble key={m.id} msg={m} />)}
      </div>

      <div className="border-t border-line shrink-0">
        {leadId ? <TgComposer leadId={leadId} /> : <p className="px-4 py-3 text-sm text-ink-muted">Bu mijozning bitimi yo'q — yozish uchun avval bitim oching.</p>}
      </div>
    </div>
  )
}

function Bubble({ msg }: { msg: TgMessage }) {
  const out = msg.direction === "out"
  const files = Array.isArray(msg.files) ? msg.files : []
  const open = (path: string) => tgFileUrl(path).then((u) => window.open(u, "_blank", "noopener"), (e: Error) => toast.error("Fayl ochilmadi", e.message))
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 ${out ? "rounded-br-md bg-[#D7EEFC] text-[#0C447C] dark:bg-[#163b55] dark:text-[#d7eefc]" : "rounded-bl-md bg-surface text-ink"}`}>
        {files.map((f) => (
          <button key={f.path} type="button" onClick={() => void open(f.path)}
            className="my-1 w-full flex items-center gap-2 text-left rounded-control bg-black/5 dark:bg-white/10 px-2.5 py-2 hover:bg-black/10 dark:hover:bg-white/15">
            <span className="size-8 shrink-0 rounded-full bg-[#2AABEE] text-white flex items-center justify-center"><Paperclip size={16} /></span>
            <span className="min-w-0 text-sm font-medium truncate">{f.name}</span>
          </button>
        ))}
        {msg.text && <p className="text-base whitespace-pre-wrap break-words">{msg.text}</p>}
        <span className={`flex items-center justify-end gap-1 text-xs ${out ? "opacity-70" : "text-ink-faint"}`}>
          {out && !msg.sender && <span className="mr-auto">ilovadan</span>}
          {out && msg.sender && <span className="mr-auto truncate">{msg.sender.full_name.split(" ")[0]}</span>}
          <span className="tabular-nums">{clock(msg.created_at)}</span>
          {out && (msg.read_at ? <Checks size={12} weight="bold" className="text-[#2AABEE]" /> : <Check size={12} weight="bold" />)}
        </span>
      </div>
    </div>
  )
}
