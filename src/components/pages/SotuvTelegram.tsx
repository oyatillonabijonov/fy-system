// Sotuv bo'limi → Telegram (2026-11-18): every chat of the company account in one place, like Telegram Desktop —
// the list on the left, the chosen chat on the right. On a phone: the list, then the chat full screen.
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { MagnifyingGlass, TelegramLogo } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useMedia } from "@/hooks/useMedia"
import { useClientLeadId, useTgInbox } from "@/hooks/useTelegram"
import { filterInbox, dayLabel, type TgInboxRow } from "@/lib/telegram"
import { tashkentToday } from "@/lib/period"
import { PersonDot } from "@/components/vazifalar/pickers"
import { TgBadge } from "@/components/telegram/TgBadge"
import { TgChat } from "@/components/telegram/TgChat"

const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))

export function SotuvTelegram() {
  const { user } = useAuth()
  const phoneView = useMedia("(width < 64rem)")
  const { data: rows = [], isLoading } = useTgInbox()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState("")
  const [mine, setMine] = useState(true)
  const openId = params.get("chat")
  const list = filterInbox(rows, q, mine, user?.id ?? null)
  // nothing opens by itself: opening marks the chat read and the client sees ✓✓
  const open = rows.find((r) => r.id === openId) ?? null
  const { data: clientLead = null } = useClientLeadId(open && !open.lead_id ? open.client_id : null)
  const pick = (id: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("chat", id); else n.delete("chat"); return n }, { replace: true })

  const chat = open?.client_id && (
    <TgChat key={open.id} clientId={open.client_id} leadId={open.lead_id ?? clientLead} title={open.title} phone={open.phone} bitimLink
      onClose={phoneView ? () => pick(null) : undefined} />
  )

  if (phoneView && open) return <div className="fixed inset-0 z-[60] bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">{chat}</div>

  return (
    <div className="flex gap-4 h-[calc(100dvh-10rem)] max-lg:h-auto">
      <section className="w-[340px] max-lg:w-full shrink-0 flex flex-col min-h-0 rounded-surface bg-surface-sunken overflow-hidden">
        <div className="p-3 flex flex-col gap-2 border-b border-line">
          <label className="relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism yoki raqam" aria-label="Qidirish"
              className="w-full h-control-md pl-9 pr-3 rounded-control bg-surface border border-line text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus" />
          </label>
          <div role="radiogroup" aria-label="Kimniki" className="inline-flex self-start gap-1 p-1 rounded-full bg-surface">
            {([[true, "Mening"], [false, "Hammasi"]] as const).map(([v, label]) => (
              <button key={label} type="button" role="radio" aria-checked={mine === v} onClick={() => setMine(v)}
                className={`h-7 px-3 rounded-full text-sm font-medium whitespace-nowrap ${mine === v ? "bg-accent text-ink-on-accent" : "text-ink-muted hover:text-ink"}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? <p className="py-10 text-center text-base text-ink-muted">Yuklanmoqda…</p>
            : list.length === 0 ? (
              <div className="py-12 px-6 flex flex-col items-center gap-2 text-center">
                <span className="size-12 rounded-full bg-[#2AABEE] text-white flex items-center justify-center"><TelegramLogo size={28} weight="fill" /></span>
                <p className="text-sm text-ink-muted">{q ? "Hech narsa topilmadi" : mine ? "Sizning bitimlaringizda yozishma yo'q" : "Hali yozishma yo'q"}</p>
              </div>
            )
            : list.map((r) => <Row key={r.id} row={r} active={!phoneView && r.id === open?.id} onClick={() => pick(r.id)} />)}
        </div>
      </section>
      {!phoneView && (
        <section className="flex-1 min-w-0 rounded-surface border border-line overflow-hidden">
          {chat || <div className="h-full flex items-center justify-center text-base text-ink-muted">Suhbatni tanlang</div>}
        </section>
      )}
    </div>
  )
}

function Row({ row: r, active, onClick }: { row: TgInboxRow; active: boolean; onClick: () => void }) {
  const today = tashkentToday()
  const when = r.last_message_at ? (dayLabel(r.last_message_at, today) === "Bugun" ? clock(r.last_message_at) : dayLabel(r.last_message_at, today)) : ""
  const last = r.last ? `${r.last.direction === "out" ? "Siz: " : ""}${r.last.text || (r.last.files.length ? "📎 Fayl" : "")}` : "—"
  return (
    <button type="button" onClick={onClick} aria-current={active || undefined}
      className={`w-full min-h-16 px-3 py-2.5 flex items-center gap-3 text-left border-b border-line last:border-0 transition-colors ${active ? "bg-surface" : "hover:bg-surface-sunken-hover"}`}>
      <PersonDot name={r.title} url={null} size={44} />
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="flex items-baseline gap-2">
          <span className="flex-1 min-w-0 text-base font-medium text-ink truncate">{r.title}</span>
          <span className="shrink-0 text-xs text-ink-faint tabular-nums">{when}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`flex-1 min-w-0 text-sm truncate ${r.unread ? "text-ink" : "text-ink-muted"}`}>{last}</span>
          <TgBadge n={r.unread} />
        </span>
      </span>
    </button>
  )
}
