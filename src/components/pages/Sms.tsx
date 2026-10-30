import { Fragment, useMemo, useRef, useState } from "react"
import { MagnifyingGlass, PaperPlaneTilt, X, Check, CaretDown } from "@phosphor-icons/react"
import { useEvents } from "@/hooks/useEvents"
import {
  useSmsRecipients, useEventClientIds, useSmsTemplates, useAddSmsTemplate, useDeleteSmsTemplate,
  useSendSms, useSmsCampaigns, useSmsMessages, useEskizTemplates,
} from "@/hooks/useSms"
import { SMS_STATUS, type SmsKind } from "@/lib/supabase/queries/sms"
import { smsParts, fitsTemplate } from "@/lib/sms"
import { formatPhone } from "@/lib/format"
import { confirmAction } from "@/lib/confirm"
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"
import { INPUT, LABEL } from "@/components/moliya/PaymentActionModals"
import { ModalOrSheet } from "@/components/events/ModalOrSheet"

const KINDS: [SmsKind, string][] = [["promo", "Reklama"], ["reminder", "Eslatma"]]
const SEGMENTS = [["all", "Hammasi"], ["customer", "Mijozlar"], ["lead", "Lidlar"]] as const
const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })
const seg = (on: boolean) => `h-7 px-3 rounded-item max-lg:h-9 max-lg:rounded-full text-sm font-medium transition-colors ${on ? "bg-surface text-ink max-lg:bg-card" : "text-ink-muted hover:text-ink"}`
const pill = "h-control-md px-4 rounded-full text-base font-medium transition-colors"

/** SMS (083): write a text, pick clients, send through Eskiz; Tarix shows every send and its delivery */
export function Sms() {
  const [tab, setTab] = useState<"new" | "history">("new")
  return (
    <div className={`flex flex-col gap-5 pb-10 ${tab === "new" ? "max-lg:pb-20" : ""}`}>
      <div role="tablist" className="inline-flex self-start gap-1 p-1 rounded-control bg-surface-sunken max-lg:grid max-lg:grid-cols-2 max-lg:self-stretch max-lg:rounded-full max-lg:bg-fill">
        {([["new", "Yangi xabar"], ["history", "Tarix"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={seg(tab === id)}>{label}</button>
        ))}
      </div>
      {tab === "new" ? <Compose onSent={() => setTab("history")} /> : <History />}
    </div>
  )
}

function Compose({ onSent }: { onSent: () => void }) {
  const [kind, setKind] = useState<SmsKind>("promo")
  const [text, setText] = useState("")
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number][0]>("all")
  const [eventId, setEventId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)

  const { data: people = [], isLoading } = useSmsRecipients()
  const { data: events = [] } = useEvents()
  const { data: eventIds } = useEventClientIds(eventId)
  const { data: templates = [] } = useSmsTemplates()
  const { data: eskiz, isError: eskizError } = useEskizTemplates()
  const delTemplate = useDeleteSmsTemplate()
  const send = useSendSms()

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const inEvent = eventId && eventIds ? new Set(eventIds) : null
    return people.filter((p) =>
      p.phone &&
      (segment === "all" || (segment === "customer") === p.is_customer) &&
      (!inEvent || inEvent.has(p.id)) &&
      (!q || p.full_name.toLowerCase().includes(q) || p.phone.includes(q.replace(/\D/g, "") || q)))
  }, [people, segment, eventId, eventIds, search])
  const { page, setPage, pageCount, pageItems } = usePaged(visible)

  // Promo skips clients who refused it — the DB does the same; shown here so the count is honest
  const sendable = people.filter((p) => picked.has(p.id) && p.phone && !(kind === "promo" && p.sms_opt_out)).length
  const { parts, gsm } = smsParts(text.replace(/\{ism\}/g, "Abdurahmon"))
  const eskizForKind = (eskiz ?? []).filter((t) => t.kind === kind)
  // Eskiz delivers only approved texts: a promo must fit a "reklama" template, a reminder a "service" one
  const fits = eskiz && text.trim() ? fitsTemplate(text, eskizForKind.map((t) => t.template)) : null
  const allVisible = visible.length > 0 && visible.every((p) => picked.has(p.id))

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setPicked((s) => {
    const n = new Set(s)
    for (const p of visible) if (allVisible) n.delete(p.id); else n.add(p.id)
    return n
  })
  const insertName = () => {
    const el = area.current
    const at = el?.selectionStart ?? text.length
    setText(text.slice(0, at) + "{ism}" + text.slice(el?.selectionEnd ?? at))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + 5, at + 5) })
  }

  const sendLabel = send.isPending ? "Yuborilmoqda…" : sendable ? `${sendable} ta mijozga yuborish` : "Mijozlarni tanlang"

  async function submit() {
    const ok = await confirmAction({
      title: "SMS yuborilsinmi?",
      message: `${sendable} ta mijozga ${KINDS.find((k) => k[0] === kind)![1].toLowerCase()} SMS'i, har biri ${parts} bo'lak — jami ${sendable * parts} ta SMS.`,
      confirmLabel: "Yuborish",
      danger: false,
    })
    if (!ok) return
    send.mutate({ kind, text, clientIds: [...picked] }, {
      onSuccess: () => { setText(""); setPicked(new Set()); onSent() },
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
      {/* Text */}
      <section className="flex flex-col gap-4 p-5 max-lg:p-4 rounded-surface bg-surface-sunken lg:sticky lg:top-4">
        <div role="radiogroup" aria-label="SMS turi" className="inline-flex self-start gap-1 p-1 rounded-control bg-surface max-lg:grid max-lg:grid-cols-2 max-lg:self-stretch max-lg:rounded-full max-lg:bg-fill">
          {KINDS.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={kind === id} onClick={() => setKind(id)}
              className={`h-7 px-3 rounded-item max-lg:h-9 max-lg:rounded-full text-sm font-medium transition-colors ${kind === id ? "bg-accent text-ink-on-accent max-lg:bg-card max-lg:text-ink" : "text-ink-muted hover:text-ink"}`}>{label}</button>
          ))}
        </div>
        <p className="text-sm text-ink-muted -mt-2 max-lg:hidden">
          {kind === "promo" ? "Reklama — \"Reklama SMS'i yubormang\" belgilangan mijozlarga bormaydi." : "Eslatma — hamma tanlanganlarga boradi."}
        </p>

        {templates.length > 0 && (
          <div className="flex flex-wrap gap-2 max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:no-scrollbar max-lg:-mx-4 max-lg:px-4">
            {templates.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 h-7 max-lg:h-9 max-lg:shrink-0 max-lg:whitespace-nowrap pl-3 pr-1 rounded-full bg-surface text-sm text-ink">
                <button onClick={() => setText(t.text)} className="hover:underline">{t.title}</button>
                <button aria-label={`${t.title} — o'chirish`} className="p-1 max-lg:p-2 rounded-full hover:bg-mute-ghost-hover text-ink-muted"
                  onClick={async () => { if (await confirmAction({ title: "Tayyor matn o'chirilsinmi?", message: t.title })) delTemplate.mutate(t.id) }}>
                  <X size={12} weight="bold" />
                </button>
              </span>
            ))}
          </div>
        )}

        <select aria-label="Eskiz shabloni" value="" disabled={!eskizForKind.length}
          onChange={(e) => { const t = eskizForKind.find((x) => String(x.id) === e.target.value); if (t) setText(t.example) }}
          className={`${INPUT} max-lg:h-12 bg-surface max-lg:border-transparent disabled:opacity-60`}>
          <option value="">{eskizError ? "Eskiz shablonlari ochilmadi" : !eskiz ? "Eskiz shablonlari yuklanmoqda…" : eskizForKind.length ? `Eskiz shabloni tanlash (${eskizForKind.length})` : "Bu turda tasdiqlangan shablon yo'q"}</option>
          {eskizForKind.map((t) => <option key={t.id} value={t.id}>{t.example.replace(/\s+/g, " ").slice(0, 70)}</option>)}
        </select>

        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Matn</span>
          <textarea ref={area} rows={7} aria-describedby="sms-count" value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Assalomu alaykum, {ism}! …" className={`${INPUT} bg-surface max-lg:border-transparent resize-y max-lg:min-h-44`} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
          <div className="flex gap-2">
            <button onClick={insertName} className="h-7 max-lg:h-9 px-3 rounded-full bg-surface text-ink hover:bg-mute-ghost-hover">+ {"{ism}"}</button>
            <button onClick={() => setSaving(true)} disabled={!text.trim()} className="h-7 max-lg:h-9 px-3 rounded-full bg-surface text-ink hover:bg-mute-ghost-hover disabled:opacity-40">Saqlash</button>
          </div>
          <span id="sms-count" className="tabular-nums">{text.length} belgi · {parts} SMS{!gsm && text ? " · kirill/ʻ: 70 belgi" : ""}</span>
        </div>

        {fits !== null && (
          <p className={`text-sm -mt-2 ${fits ? "text-success" : "text-danger"}`}>
            {fits ? "Eskiz tasdiqlagan shablonga mos" : "Tasdiqlangan shablonga mos emas — Eskiz yetkazmaydi. Shablondan tanlab, faqat o'zgaruvchi joylarini o'zgartiring."}
          </p>
        )}

        <button onClick={submit} disabled={!text.trim() || sendable === 0 || send.isPending}
          className={`${pill} max-lg:hidden flex items-center justify-center gap-2 bg-accent text-ink-on-accent hover:bg-accent-hover disabled:opacity-40 disabled:pointer-events-none`}>
          <PaperPlaneTilt size={16} />
          {sendLabel}
        </button>
        <p className="max-lg:hidden text-sm text-ink-faint -mt-2">Yangi matn avval my.eskiz.uz'da tasdiqlanadi · yuborish 9:00–21:00</p>
      </section>

      {/* Recipients */}
      <section className="flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap items-center gap-3 max-lg:flex-col max-lg:items-stretch max-lg:gap-2">
          <div role="radiogroup" aria-label="Kimlar" className="inline-flex gap-1 p-1 rounded-control bg-surface-sunken max-lg:grid max-lg:grid-cols-3 max-lg:rounded-full max-lg:bg-fill">
            {SEGMENTS.map(([id, label]) => (
              <button key={id} role="radio" aria-checked={segment === id} onClick={() => setSegment(id)} className={seg(segment === id)}>{label}</button>
            ))}
          </div>
          <select aria-label="Tadbir" value={eventId ?? ""} onChange={(e) => setEventId(e.target.value || null)} className={`${INPUT} w-auto max-w-56 h-9 py-0 max-lg:w-full max-lg:max-w-none max-lg:h-12 max-lg:bg-surface-sunken max-lg:border-transparent`}>
            <option value="">Barcha tadbirlar</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <label className="relative flex-1 min-w-48 max-lg:min-w-0">
            <MagnifyingGlass size={16} className="absolute left-3 max-lg:left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ism yoki raqam" aria-label="Qidirish" className={`${INPUT} h-9 py-0 pl-9 max-lg:h-12 max-lg:pl-10 max-lg:bg-surface-sunken max-lg:border-transparent`} />
          </label>
        </div>
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <span className="tabular-nums">Tanlangan: <b className="text-ink">{picked.size}</b> · ro'yxatda {visible.length}</span>
          {picked.size > 0 && <button onClick={() => setPicked(new Set())} className="text-ink hover:underline max-lg:h-9">Tozalash</button>}
          <button onClick={toggleAll} disabled={visible.length === 0} className="lg:hidden ml-auto h-9 px-3 rounded-full bg-surface-sunken text-ink font-medium disabled:opacity-40">
            {allVisible ? "Olib tashlash" : "Hammasini tanlash"}
          </button>
        </div>

        {/* Phones and tablets: the recipients as a tappable list */}
        <div className="lg:hidden rounded-surface bg-surface-sunken overflow-hidden">
          {isLoading ? <p className="py-10 text-center text-base text-ink-muted">Yuklanmoqda…</p>
            : pageItems.length === 0 ? <p className="py-10 text-center text-base text-ink-muted">Raqami bor mijoz topilmadi</p>
            : pageItems.map((p) => {
              const on = picked.has(p.id)
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)} role="checkbox" aria-checked={on}
                  className="w-full min-h-16 px-4 py-3 flex items-center gap-3 text-left border-b border-line last:border-0 active:bg-surface-sunken-hover">
                  <span className={`size-7 shrink-0 rounded-full flex items-center justify-center ${on ? "bg-accent text-ink-on-accent" : "border border-line bg-surface"}`}>
                    {on && <Check size={16} weight="bold" />}
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-base font-medium text-ink truncate">{p.full_name}</span>
                    <span className="text-sm text-ink-muted truncate tabular-nums">{formatPhone(p.phone)} · {p.is_customer ? "Mijoz" : "Lid"}</span>
                  </span>
                  {p.sms_opt_out && <span className="shrink-0 h-6 px-2 rounded-full bg-surface text-xs font-medium text-ink-muted flex items-center">Rad etgan</span>}
                </button>
              )
            })}
        </div>

        <div className={`${tbl.scroll} max-lg:hidden`}>
          <table className={tbl.table}>
            <thead>
              <tr>
                <th className={`${tbl.th} w-10`}>
                  <input type="checkbox" aria-label="Hammasini tanlash" checked={allVisible} onChange={toggleAll} className="size-4 accent-[var(--ds-color-bg-inverted)]" />
                </th>
                <th className={tbl.th}>Ism</th><th className={tbl.th}>Telefon</th><th className={`${tbl.th} max-sm:hidden`}>Turi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={4} className={tbl.empty}>Yuklanmoqda…</td></tr>
                : pageItems.length === 0 ? <tr><td colSpan={4} className={tbl.empty}>Raqami bor mijoz topilmadi</td></tr>
                : pageItems.map((p) => (
                  <tr key={p.id} className={`${tbl.tr} cursor-pointer`} onClick={() => toggle(p.id)}>
                    <td className={`${tbl.td} ${picked.has(p.id) ? tbl.tdSelected : ""}`}>
                      <input type="checkbox" aria-label={p.full_name} checked={picked.has(p.id)} onChange={() => toggle(p.id)} onClick={(e) => e.stopPropagation()} className="size-4 accent-[var(--ds-color-bg-inverted)]" />
                    </td>
                    <td className={`${tbl.td} ${picked.has(p.id) ? tbl.tdSelected : ""}`}>
                      {p.full_name}
                      {p.sms_opt_out && <span className="ml-2 max-sm:ml-0 max-sm:block text-sm text-ink-faint">reklama rad etgan</span>}
                    </td>
                    <td className={`${tbl.td} tabular-nums whitespace-nowrap ${picked.has(p.id) ? tbl.tdSelected : ""}`}>{formatPhone(p.phone)}</td>
                    <td className={`${tbl.td} text-ink-muted max-sm:hidden ${picked.has(p.id) ? tbl.tdSelected : ""}`}>{p.is_customer ? "Mijoz" : "Lid"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageCount={pageCount} total={visible.length} onPage={setPage} />
      </section>

      <div className="lg:hidden fixed inset-x-0 bottom-[var(--tabbar-h)] z-30 bg-surface border-t border-line px-4 py-3">
        <button onClick={submit} disabled={!text.trim() || sendable === 0 || send.isPending}
          className="w-full h-12 rounded-full bg-accent text-ink-on-accent text-base font-semibold flex items-center justify-center gap-2 active:opacity-80 disabled:bg-fill disabled:text-ink-muted">
          <PaperPlaneTilt size={18} />
          {sendLabel}
        </button>
      </div>

      {saving && <SaveTemplate text={text} onClose={() => setSaving(false)} />}
    </div>
  )
}

function SaveTemplate({ text, onClose }: { text: string; onClose: () => void }) {
  const [title, setTitle] = useState("")
  const add = useAddSmsTemplate()
  return (
    <ModalOrSheet title="Tayyor matn sifatida saqlash" error={null} submitLabel="Saqlash" canSubmit={!!title.trim()} pending={add.isPending}
      onSubmit={() => add.mutate({ title: title.trim(), text }, { onSuccess: onClose })} onClose={onClose}>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Nomi</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tadbir eslatmasi" className={`${INPUT} max-sm:h-12`}
          onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) add.mutate({ title: title.trim(), text }, { onSuccess: onClose }) }} />
      </label>
    </ModalOrSheet>
  )
}

function History() {
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const { data, isLoading } = useSmsCampaigns(page)
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  return (
    <div className="flex flex-col">
      {/* Phones and tablets: one row per send, tap for the per-number delivery */}
      <div className="lg:hidden rounded-surface bg-surface-sunken overflow-hidden">
        {isLoading ? <p className="py-10 text-center text-base text-ink-muted">Yuklanmoqda…</p>
          : rows.length === 0 ? <p className="py-10 text-center text-base text-ink-muted">Hali SMS yuborilmagan</p>
          : rows.map((c) => (
            <div key={c.id} className="border-b border-line last:border-0">
              <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}
                className="w-full px-4 py-3 flex items-start gap-3 text-left active:bg-surface-sunken-hover">
                <span className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <span className="text-base font-medium text-ink line-clamp-2 break-words">{c.text}</span>
                  <span className="text-sm text-ink-muted truncate tabular-nums">{when(c.created_at)} · {c.author ?? "—"}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
                    <span className="h-6 px-2 rounded-full bg-surface text-xs font-medium text-ink flex items-center">{c.kind === "promo" ? "Reklama" : "Eslatma"}</span>
                    <span><span className="text-success">{c.delivered}</span><span className="text-ink-muted"> / {c.total} yetdi</span></span>
                    {c.sent + c.queued > 0 && <span className="text-ink-muted">{c.sent + c.queued} yo'lda</span>}
                    {c.failed > 0 && <span className="text-danger">{c.failed} xato</span>}
                  </span>
                </span>
                <CaretDown size={16} className={`mt-1 shrink-0 text-ink-faint transition-transform ${open === c.id ? "rotate-180" : ""}`} />
              </button>
              {open === c.id && <div className="px-4 pb-3"><CampaignMessages campaignId={c.id} /></div>}
            </div>
          ))}
      </div>
      <div className={`${tbl.scroll} max-lg:hidden`}>
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={tbl.th}>Vaqt</th><th className={tbl.th}>Turi</th><th className={tbl.th}>Matn</th>
              <th className={tbl.th}>Kim</th><th className={`${tbl.th} text-right`}>Holat</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={5} className={tbl.empty}>Yuklanmoqda…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={5} className={tbl.empty}>Hali SMS yuborilmagan</td></tr>
              : rows.map((c) => (
                <Fragment key={c.id}>
                  <tr className={`${tbl.tr} cursor-pointer`} onClick={() => setOpen(open === c.id ? null : c.id)}>
                    <td className={`${tbl.td} whitespace-nowrap tabular-nums`}>{when(c.created_at)}</td>
                    <td className={tbl.td}>{c.kind === "promo" ? "Reklama" : "Eslatma"}</td>
                    <td className={`${tbl.td} max-w-md truncate`} title={c.text}>{c.text}</td>
                    <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{c.author ?? "—"}</td>
                    <td className={`${tbl.td} text-right whitespace-nowrap tabular-nums text-sm`}>
                      <span className="text-success">{c.delivered}</span>
                      {c.sent + c.queued > 0 && <span className="text-ink-muted"> · {c.sent + c.queued} yo'lda</span>}
                      {c.failed > 0 && <span className="text-danger"> · {c.failed} xato</span>}
                      <span className="text-ink-faint"> / {c.total}</span>
                    </td>
                  </tr>
                  {open === c.id && <tr><td colSpan={5} className="px-4 py-3 border-b border-line bg-surface-sunken"><CampaignMessages campaignId={c.id} /></td></tr>}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={Math.max(1, Math.ceil(total / 20))} total={total} onPage={setPage} />
    </div>
  )
}

function CampaignMessages({ campaignId }: { campaignId: string }) {
  const { data = [], isLoading } = useSmsMessages({ campaignId })
  const { page, setPage, pageCount, pageItems } = usePaged(data)
  if (isLoading) return <p className="text-sm text-ink-muted">Yuklanmoqda…</p>
  return (
    <div className="flex flex-col gap-1">
      {pageItems.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-4 text-sm py-1">
          <span className="tabular-nums text-ink">{formatPhone(m.phone)}</span>
          <span className={`${SMS_STATUS[m.status].cls} truncate`} title={m.error ?? undefined}>
            {SMS_STATUS[m.status].label}{m.status === "failed" && m.error ? ` — ${m.error}` : ""}
          </span>
        </div>
      ))}
      <Pager page={page} pageCount={pageCount} total={data.length} onPage={setPage} />
    </div>
  )
}
