// Sotuv bo'limi → Telegram (redesign 2026-11-18, variant A chosen by the owner): one frame, three columns like
// Telegram Desktop / AmoCRM — chats · the chat · the client and their bitim. Below xl the client column hides;
// on a phone: the list, then the chat full screen.
import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ArrowSquareOut, Lightning, MagnifyingGlass, Phone, TelegramLogo } from "@phosphor-icons/react"
import { Sheet } from "@/components/ui/Sheet"
import { TgTemplates } from "@/components/telegram/TgTemplates"
import { useAuth } from "@/context/AuthContext"
import { usePhone } from "@/context/PhoneContext"
import { useMedia } from "@/hooks/useMedia"
import { useClientLeadId, useTgInbox } from "@/hooks/useTelegram"
import { useLead, usePipelines, useStages } from "@/hooks/useSotuv"
import { filterInbox, dayLabel, type InboxMode, type TgInboxRow } from "@/lib/telegram"
import { tashkentToday } from "@/lib/period"
import { formatNumber, formatPhone } from "@/lib/format"
import { StageDot } from "@/components/sotuv/ui"
import { TgAvatar } from "@/components/telegram/TgAvatar"
import { TgChat } from "@/components/telegram/TgChat"

const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
const TABS: [InboxMode, string][] = [["all", "Hammasi"], ["unread", "O'qilmagan"], ["mine", "Mening"]]

export function SotuvTelegram() {
  const { user, isAdmin } = useAuth()
  const [templates, setTemplates] = useState(false)
  const phoneView = useMedia("(width < 64rem)")
  const { data: rows = [], isLoading } = useTgInbox()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState("")
  const [mode, setMode] = useState<InboxMode>("all")
  const list = filterInbox(rows, q, mode, user?.id ?? null)
  // nothing opens by itself: opening marks the chat read and the client sees ✓✓
  const open = rows.find((r) => r.id === params.get("chat")) ?? null
  const { data: clientLead = null } = useClientLeadId(open && !open.lead_id ? open.client_id : null)
  const leadId = open?.lead_id ?? clientLead
  const pick = (id: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("chat", id); else n.delete("chat"); return n }, { replace: true })
  const unreadTotal = rows.reduce((s, r) => s + (r.unread > 0 ? 1 : 0), 0)

  const chat = open?.client_id && (
    <TgChat key={open.id} clientId={open.client_id} leadId={leadId} title={open.title} phone={open.phone} image={open.image}
      bitimLink={phoneView} onClose={phoneView ? () => pick(null) : undefined} />
  )

  if (phoneView && open) return <div className="fixed inset-0 z-[60] bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">{chat}</div>

  return (
    <div className="flex h-[calc(100dvh-9rem)] max-lg:h-auto rounded-surface border border-line overflow-hidden bg-surface">
      <section className="w-[340px] max-lg:w-full shrink-0 flex flex-col min-h-0 border-r border-line max-lg:border-0">
        <div className="px-3 pt-3 pb-2 flex flex-col gap-2.5">
          <label className="relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism yoki raqam" aria-label="Qidirish"
              className="w-full h-control-md pl-9 pr-3 rounded-full bg-surface-sunken border border-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus" />
          </label>
          <div className="flex items-center gap-1.5">
          <div role="radiogroup" aria-label="Suhbatlar" className="flex gap-1.5 flex-1 min-w-0 overflow-x-auto no-scrollbar">
            {TABS.map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)}
                className={`h-7 px-3 inline-flex items-center gap-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${mode === v ? "bg-[#2AABEE] text-white" : "bg-mute-soft text-ink-muted hover:text-ink"}`}>
                {label}{v === "unread" && unreadTotal > 0 && <span className={`tabular-nums ${mode === v ? "text-white/80" : "text-[#2AABEE]"}`}>{unreadTotal}</span>}
              </button>
            ))}
          </div>
          {isAdmin && (
            <button type="button" onClick={() => setTemplates(true)} aria-label="Shablonlar" title="Shablonlar"
              className="size-7 shrink-0 rounded-full flex items-center justify-center bg-mute-soft text-[#2AABEE] hover:bg-mute-soft-hover"><Lightning size={16} weight="fill" /></button>
          )}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-2">
          {isLoading ? <p className="py-10 text-center text-base text-ink-muted">Yuklanmoqda…</p>
            : list.length === 0 ? (
              <div className="py-12 px-6 flex flex-col items-center gap-2 text-center">
                <span className="size-12 rounded-full bg-[#2AABEE] text-white flex items-center justify-center"><TelegramLogo size={28} weight="fill" /></span>
                <p className="text-sm text-ink-muted">{q ? "Hech narsa topilmadi" : mode === "unread" ? "O'qilmagan xabar yo'q" : mode === "mine" ? "Sizning bitimlaringizda yozishma yo'q" : "Hali yozishma yo'q"}</p>
              </div>
            )
            : list.map((r) => <Row key={r.id} row={r} active={!phoneView && r.id === open?.id} onClick={() => pick(r.id)} />)}
        </div>
      </section>

      {!phoneView && (
        <section className="flex-1 min-w-0 flex flex-col">
          {chat || (
            <div className="h-full flex flex-col items-center justify-center gap-3 bg-[#E9EEF3] dark:bg-[#0E1621]">
              <span className="size-16 rounded-full bg-[#2AABEE] text-white flex items-center justify-center"><TelegramLogo size={36} weight="fill" /></span>
              <p className="px-3 h-7 inline-flex items-center rounded-full bg-black/10 dark:bg-white/10 text-sm text-[#444441] dark:text-white/80">Suhbatni tanlang</p>
            </div>
          )}
        </section>
      )}

      {!phoneView && open && <ClientPanel row={open} leadId={leadId} />}
      <Sheet open={templates} onClose={() => setTemplates(false)} title="Shablonlar" className="sm:max-w-2xl">
        <p className="text-sm text-ink-muted mb-1">Tayyor xabarlar: chatda ⚡ tugma bo'lib chiqadi, voronka bosqichiga ham biriktiriladi.</p>
        <TgTemplates />
      </Sheet>
    </div>
  )
}

function Row({ row: r, active, onClick }: { row: TgInboxRow; active: boolean; onClick: () => void }) {
  const today = tashkentToday()
  const when = r.last_message_at ? (dayLabel(r.last_message_at, today) === "Bugun" ? clock(r.last_message_at) : dayLabel(r.last_message_at, today)) : ""
  const last = r.last ? (r.last.text || (r.last.files.length ? "📎 Fayl" : "")) : ""
  return (
    <button type="button" onClick={onClick} aria-current={active || undefined}
      className={`w-full h-[68px] px-2.5 flex items-center gap-3 text-left rounded-control transition-colors ${active ? "bg-[#2AABEE] text-white" : "hover:bg-mute-ghost-hover"}`}>
      <TgAvatar name={r.title} url={r.image} size={48} />
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={`flex-1 min-w-0 text-base font-semibold truncate ${active ? "" : "text-ink"}`}>{r.title}</span>
          <span className={`shrink-0 text-xs tabular-nums ${active ? "text-white/80" : "text-ink-faint"}`}>{when}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`flex-1 min-w-0 text-sm truncate ${active ? "text-white/85" : r.unread ? "text-ink" : "text-ink-muted"}`}>
            {r.last?.direction === "out" && <span className={active ? "" : "text-[#2AABEE]"}>Siz: </span>}{last || "—"}
          </span>
          {r.unread > 0 && <span className={`shrink-0 h-5 min-w-5 px-1.5 rounded-full text-xs font-semibold tabular-nums inline-flex items-center justify-center ${active ? "bg-white text-[#2AABEE]" : "bg-[#2AABEE] text-white"}`}>{r.unread}</span>}
        </span>
      </span>
    </button>
  )
}

/** The right column: who this is and where their bitim stands, call and open the bitim in one click */
function ClientPanel({ row, leadId }: { row: TgInboxRow; leadId: string | null }) {
  const { status, dial, call } = usePhone()
  const ACTION = "flex-1 h-14 flex flex-col items-center justify-center gap-1 rounded-control bg-surface-sunken text-xs font-medium text-ink hover:bg-surface-sunken-hover disabled:opacity-40"
  return (
    <aside className="w-[300px] shrink-0 border-l border-line overflow-y-auto max-xl:hidden">
      <div className="px-5 pt-6 pb-4 flex flex-col items-center gap-2 text-center">
        <TgAvatar name={row.title} url={row.image} size={80} />
        <span className="mt-1 text-lg font-semibold text-ink">{row.title}</span>
        {row.phone && <span className="text-sm text-ink-muted tabular-nums">{formatPhone(row.phone)}</span>}
      </div>
      <div className="px-4 flex gap-2">
        <button type="button" disabled={!row.phone || !!call} className={ACTION}
          onClick={() => { if (!row.phone) return; if (status === "ready") void dial(row.phone).catch(() => {}); else location.href = `tel:${row.phone}` }}>
          <Phone size={20} />Qo'ng'iroq
        </button>
        {leadId && <Link to={`/sotuv/bitim/${leadId}`} className={ACTION}><ArrowSquareOut size={20} />Bitim</Link>}
      </div>
      {leadId && <LeadInfo leadId={leadId} />}
    </aside>
  )
}

function LeadInfo({ leadId }: { leadId: string }) {
  const { data: lead } = useLead(leadId)
  const { data: pipelines = [] } = usePipelines()
  const { data: stages = [] } = useStages(lead?.pipeline_id ?? "")
  if (!lead) return null
  const stage = stages.find((s) => s.id === lead.stage_id)
  const line = (label: string, value: React.ReactNode) => value ? (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-0">
      <span className="text-sm text-ink-muted shrink-0">{label}</span><span className="text-sm text-ink text-right min-w-0 truncate">{value}</span>
    </div>
  ) : null
  return (
    <div className="m-4 px-3 rounded-surface bg-surface-sunken">
      {line("Voronka", pipelines.find((p) => p.id === lead.pipeline_id)?.name)}
      {line("Bosqich", stage && <span className="inline-flex items-center gap-1.5"><StageDot color={stage.color} />{stage.name}</span>)}
      {line("Mas'ul", lead.responsible?.full_name ?? "Belgilanmagan")}
      {line("Summa", lead.price > 0 ? `${formatNumber(lead.price)} so'm` : null)}
      {line("Lid sifati", lead.lead_score != null ? `${lead.qualified ? "Sifatli" : "Sifatsiz"} · ${lead.lead_score}/7` : null)}
    </div>
  )
}
