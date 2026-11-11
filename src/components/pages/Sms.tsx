import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { MagnifyingGlass, PaperPlaneTilt, Check, CaretDown, Plus, ArrowClockwise } from "@phosphor-icons/react"
import { useEvents } from "@/hooks/useEvents"
import { usePipelines, useStages } from "@/hooks/useSotuv"
import {
  useSmsRecipients, useEventClientIds, usePipelineClientIds, useSmsTemplates, useSaveSmsTemplate, useSubmitSmsTemplate,
  useHideSmsTemplate, useDeleteSmsTemplate, useSyncSmsTemplates, useSendSmsTemplate, useSmsCampaigns, useSmsMessages, useCancelSmsCampaign,
} from "@/hooks/useSms"
import { SMS_STATUS, TEMPLATE_STATUS, KIND_LABEL, type SmsTemplate } from "@/lib/supabase/queries/sms"
import { blanks, fillTemplate, smsParts } from "@/lib/sms"
import { formatPhone } from "@/lib/format"
import { confirmAction } from "@/lib/confirm"
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"
import { Sheet } from "@/components/ui/Sheet"
import { INPUT, LABEL } from "@/components/moliya/PaymentActionModals"

const SEGMENTS = [["all", "Hammasi"], ["customer", "Mijozlar"], ["lead", "Lidlar"]] as const
const TABS = [["send", "Yuborish"], ["templates", "Shablonlar"], ["history", "Tarix"]] as const
type Tab = (typeof TABS)[number][0]
const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })
const seg = (on: boolean) => `h-7 px-3 rounded-item max-lg:h-9 max-lg:rounded-full text-sm font-medium whitespace-nowrap transition-colors ${on ? "bg-surface text-ink max-lg:bg-card" : "text-ink-muted hover:text-ink"}`
const pill = "h-control-md px-4 rounded-full text-base font-medium transition-colors"
const SELECT = `${INPUT} w-auto max-w-56 h-9 py-0 max-lg:w-full max-lg:max-w-none max-lg:h-12 max-lg:bg-surface-sunken max-lg:border-transparent`
const toIso = (local: string) => (local ? new Date(local).toISOString() : null)

/** SMS (083, 095): send an approved template to many clients (now or later), write templates for Eskiz, see every send */
export function Sms() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = (TABS.find(([id]) => id === params.get("tab"))?.[0]) ?? "send"
  const go = (t: Tab) => setParams(t === "send" ? {} : { tab: t }, { replace: true })
  return (
    <div className={`flex flex-col gap-5 pb-10 ${tab === "send" ? "max-lg:pb-20" : ""}`}>
      <div role="tablist" className="inline-flex self-start gap-1 p-1 rounded-control bg-surface-sunken max-lg:grid max-lg:grid-cols-3 max-lg:self-stretch max-lg:rounded-full max-lg:bg-fill">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => go(id)} className={seg(tab === id)}>{label}</button>
        ))}
      </div>
      {tab === "send" ? <Compose onSent={() => go("history")} onTemplates={() => go("templates")} /> : tab === "templates" ? <Templates /> : <History />}
    </div>
  )
}

// ─── Yuborish ────────────────────────────────────────────────────────────────

function Compose({ onSent, onTemplates }: { onSent: () => void; onTemplates: () => void }) {
  const { data: all = [] } = useSmsTemplates()
  const templates = useMemo(() => all.filter((t) => t.status === "approved" && !t.hidden && t.kind), [all])
  const [templateId, setTemplateId] = useState("")
  const [values, setValues] = useState<Record<string, string>>({})
  const [schedule, setSchedule] = useState(false)
  const [later, setLater] = useState("")

  const [segment, setSegment] = useState<(typeof SEGMENTS)[number][0]>("all")
  const [eventId, setEventId] = useState<string | null>(null)
  const [pipelineId, setPipelineId] = useState<string | null>(null)
  const [stageId, setStageId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const { data: people = [], isLoading } = useSmsRecipients()
  const { data: events = [] } = useEvents()
  const { data: pipelines = [] } = usePipelines()
  const { data: stages = [] } = useStages(pipelineId)
  const { data: eventIds } = useEventClientIds(eventId)
  const { data: pipeIds } = usePipelineClientIds(pipelineId, stageId)
  const send = useSendSmsTemplate()

  const t = templates.find((x) => x.id === templateId) ?? null
  const keys = t ? blanks(t.text) : []
  const missing = keys.some((k) => !values[k]?.trim())

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const inEvent = eventId && eventIds ? new Set(eventIds) : null
    const inPipe = pipelineId && pipeIds ? new Set(pipeIds) : null
    return people.filter((p) =>
      p.phone &&
      (segment === "all" || (segment === "customer") === p.is_customer) &&
      (!inEvent || inEvent.has(p.id)) &&
      (!inPipe || inPipe.has(p.id)) &&
      (!q || p.full_name.toLowerCase().includes(q) || p.phone.includes(q.replace(/\D/g, "") || q)))
  }, [people, segment, eventId, eventIds, pipelineId, pipeIds, search])
  const { page, setPage, pageCount, pageItems } = usePaged(visible)

  // Promo skips clients who refused it — the DB does the same; shown here so the count is honest
  const sendable = people.filter((p) => picked.has(p.id) && p.phone && !(t?.kind === "promo" && p.sms_opt_out)).length
  const sample = people.find((p) => picked.has(p.id))?.full_name ?? "Abdurahmon"
  const preview = t ? fillTemplate(t.text, values, sample) : ""
  const { parts } = smsParts(preview)
  const allVisible = visible.length > 0 && visible.every((p) => picked.has(p.id))

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setPicked((s) => {
    const n = new Set(s)
    for (const p of visible) if (allVisible) n.delete(p.id); else n.add(p.id)
    return n
  })

  const ready = !!t && !missing && sendable > 0 && !send.isPending && (!schedule || !!later)
  const sendLabel = send.isPending ? "Yuborilmoqda…" : !t ? "Shablonni tanlang" : sendable ? `${sendable} ta mijozga ${schedule ? "rejalashtirish" : "yuborish"}` : "Mijozlarni tanlang"

  async function submit() {
    if (!t) return
    const ok = await confirmAction({
      title: schedule ? "SMS rejalashtirilsinmi?" : "SMS yuborilsinmi?",
      message: `${sendable} ta mijozga «${t.title}» (${KIND_LABEL[t.kind!].toLowerCase()}), har biri ${parts} bo'lak — jami ${sendable * parts} ta SMS${schedule && later ? `, ${when(toIso(later)!)} da` : ""}.`,
      confirmLabel: schedule ? "Rejalashtirish" : "Yuborish",
      danger: false,
    })
    if (!ok) return
    send.mutate({ templateId: t.id, values, clientIds: [...picked], sendAt: schedule ? toIso(later) : null }, {
      onSuccess: () => { setPicked(new Set()); setValues({}); setTemplateId(""); onSent() },
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
      {/* Template + blanks + when */}
      <section className="flex flex-col gap-4 p-5 max-lg:p-4 rounded-surface bg-surface-sunken lg:sticky lg:top-4">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Shablon</span>
          <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setValues({}) }} className={`${INPUT} max-lg:h-12 bg-surface max-lg:border-transparent`}>
            <option value="">{templates.length ? "Tasdiqlangan shablonni tanlang…" : "Tasdiqlangan shablon yo'q"}</option>
            {(["reminder", "promo"] as const).map((k) => {
              const list = templates.filter((x) => x.kind === k)
              return list.length > 0 && <optgroup key={k} label={KIND_LABEL[k]}>{list.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</optgroup>
            })}
          </select>
        </label>
        <button type="button" onClick={onTemplates} className="self-start -mt-2 text-sm text-ink-muted underline underline-offset-2 hover:text-ink">Yangi shablon yozish</button>

        {keys.map((k) => (
          <label key={k} className="flex flex-col gap-1.5">
            <span className={LABEL}>{k}</span>
            <input value={values[k] ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })} className={`${INPUT} max-lg:h-12 bg-surface max-lg:border-transparent`} />
          </label>
        ))}

        {t && (
          <div className="rounded-control bg-surface px-3 py-2.5">
            <p className="text-base text-ink whitespace-pre-wrap break-words">{preview}</p>
            <p className="mt-1.5 text-xs text-ink-faint tabular-nums">
              {KIND_LABEL[t.kind!]} · {preview.length} belgi · {parts} SMS{t.kind === "promo" ? " · reklamadan voz kechganlarga bormaydi" : ""}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Qachon" className="inline-flex gap-1 p-1 rounded-full bg-surface">
            {([[false, "Hozir"], [true, "Vaqtini tanlash"]] as const).map(([v, label]) => (
              <button key={label} type="button" role="radio" aria-checked={schedule === v} onClick={() => setSchedule(v)}
                className={`h-7 px-3 rounded-full text-sm font-medium whitespace-nowrap ${schedule === v ? "bg-accent text-ink-on-accent" : "text-ink-muted hover:text-ink"}`}>{label}</button>
            ))}
          </div>
          {schedule && <input type="datetime-local" value={later} onChange={(e) => setLater(e.target.value)} aria-label="Yuborish vaqti"
            className="h-9 px-3 rounded-control bg-surface border border-line text-sm text-ink" />}
        </div>

        <button onClick={submit} disabled={!ready}
          className={`${pill} max-lg:hidden flex items-center justify-center gap-2 bg-accent text-ink-on-accent hover:bg-accent-hover disabled:opacity-40 disabled:pointer-events-none`}>
          <PaperPlaneTilt size={16} />{sendLabel}
        </button>
        <p className="max-lg:hidden text-sm text-ink-faint -mt-2">SMS 9:00–21:00 oralig'ida ketadi; kechroq yuborilgani ertalab 9:00 da jo'naydi.</p>
      </section>

      {/* Recipients */}
      <section className="flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap items-center gap-3 max-lg:flex-col max-lg:items-stretch max-lg:gap-2">
          <div role="radiogroup" aria-label="Kimlar" className="inline-flex gap-1 p-1 rounded-control bg-surface-sunken max-lg:grid max-lg:grid-cols-3 max-lg:rounded-full max-lg:bg-fill">
            {SEGMENTS.map(([id, label]) => (
              <button key={id} role="radio" aria-checked={segment === id} onClick={() => setSegment(id)} className={seg(segment === id)}>{label}</button>
            ))}
          </div>
          <select aria-label="Voronka" value={pipelineId ?? ""} onChange={(e) => { setPipelineId(e.target.value || null); setStageId(null) }} className={SELECT}>
            <option value="">Barcha voronkalar</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {pipelineId && (
            <select aria-label="Bosqich" value={stageId ?? ""} onChange={(e) => setStageId(e.target.value || null)} className={SELECT}>
              <option value="">Barcha bosqichlar</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <select aria-label="Tadbir" value={eventId ?? ""} onChange={(e) => setEventId(e.target.value || null)} className={SELECT}>
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
          <button onClick={toggleAll} disabled={visible.length === 0} className="ml-auto h-8 max-lg:h-9 px-3 rounded-full bg-surface-sunken text-ink font-medium disabled:opacity-40 whitespace-nowrap">
            {allVisible ? "Olib tashlash" : `Hammasini tanlash (${visible.length})`}
          </button>
        </div>

        <div className="lg:hidden rounded-surface bg-surface-sunken overflow-hidden">
          {isLoading ? <p className="py-10 text-center text-base text-ink-muted">Yuklanmoqda…</p>
            : pageItems.length === 0 ? <p className="py-10 text-center text-base text-ink-muted">Raqami bor mijoz topilmadi</p>
            : pageItems.map((p) => {
              const on = picked.has(p.id)
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)} role="checkbox" aria-checked={on}
                  className="w-full min-h-16 px-4 py-3 flex items-center gap-3 text-left border-b border-line last:border-0 active:bg-surface-sunken-hover">
                  <span className={`size-7 shrink-0 rounded-full flex items-center justify-center ${on ? "bg-accent text-ink-on-accent" : "border border-line bg-surface"}`}>{on && <Check size={16} weight="bold" />}</span>
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
                <th className={`${tbl.th} w-10`}><input type="checkbox" aria-label="Hammasini tanlash" checked={allVisible} onChange={toggleAll} className="size-4 accent-[var(--ds-color-bg-inverted)]" /></th>
                <th className={tbl.th}>Ism</th><th className={tbl.th}>Telefon</th><th className={tbl.th}>Turi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={4} className={tbl.empty}>Yuklanmoqda…</td></tr>
                : pageItems.length === 0 ? <tr><td colSpan={4} className={tbl.empty}>Raqami bor mijoz topilmadi</td></tr>
                : pageItems.map((p) => {
                  const sel = picked.has(p.id) ? tbl.tdSelected : ""
                  return (
                    <tr key={p.id} className={`${tbl.tr} cursor-pointer`} onClick={() => toggle(p.id)}>
                      <td className={`${tbl.td} ${sel}`}><input type="checkbox" aria-label={p.full_name} checked={picked.has(p.id)} onChange={() => toggle(p.id)} onClick={(e) => e.stopPropagation()} className="size-4 accent-[var(--ds-color-bg-inverted)]" /></td>
                      <td className={`${tbl.td} ${sel}`}>{p.full_name}{p.sms_opt_out && <span className="ml-2 text-sm text-ink-faint">reklama rad etgan</span>}</td>
                      <td className={`${tbl.td} tabular-nums whitespace-nowrap ${sel}`}>{formatPhone(p.phone)}</td>
                      <td className={`${tbl.td} text-ink-muted ${sel}`}>{p.is_customer ? "Mijoz" : "Lid"}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageCount={pageCount} total={visible.length} onPage={setPage} />
      </section>

      <div className="lg:hidden fixed inset-x-0 bottom-[var(--tabbar-h)] z-30 bg-surface border-t border-line px-4 py-3">
        <button onClick={submit} disabled={!ready}
          className="w-full h-12 rounded-full bg-accent text-ink-on-accent text-base font-semibold flex items-center justify-center gap-2 active:opacity-80 disabled:bg-fill disabled:text-ink-muted">
          <PaperPlaneTilt size={18} />{sendLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Shablonlar ──────────────────────────────────────────────────────────────

function Templates() {
  const { data: list = [], isLoading } = useSmsTemplates()
  const sync = useSyncSmsTemplates()
  const submit = useSubmitSmsTemplate()
  const hide = useHideSmsTemplate()
  const del = useDeleteSmsTemplate()
  const [editing, setEditing] = useState<SmsTemplate | "new" | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  // Opening the tab asks amo-sync for Eskiz's latest states once
  const synced = useRef(false)
  useEffect(() => { if (!synced.current) { synced.current = true; sync.mutate(undefined) } }, [sync])

  const rows = list.filter((t) => showHidden || !t.hidden)
  const hiddenCount = list.filter((t) => t.hidden).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setEditing("new")} className={`${pill} inline-flex items-center gap-2 bg-accent text-ink-on-accent hover:bg-accent-hover`}><Plus size={16} />Yangi shablon</button>
        <button type="button" onClick={() => sync.mutate(undefined)} disabled={sync.isPending}
          className={`${pill} inline-flex items-center gap-2 bg-surface-sunken text-ink hover:bg-surface-sunken-hover disabled:opacity-40`}>
          <ArrowClockwise size={16} className={sync.isPending ? "animate-spin" : ""} />Eskiz'dan yangilash
        </button>
        {hiddenCount > 0 && <button type="button" onClick={() => setShowHidden(!showHidden)} className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink">{showHidden ? "Yashirinlarni berkitish" : `Yashirinlar (${hiddenCount})`}</button>}
      </div>
      <p className="text-sm text-ink-muted">Shablon yozing — u Eskiz'ga tasdiqlashga ketadi. Tasdiqlangach, yuborishda tanlash mumkin. <code className="text-ink">{"{ism}"}</code> o'rniga mijoz ismi qo'yiladi; boshqa bo'sh joylarni <code className="text-ink">{"{sana}"}</code> kabi yozing — yuborishda to'ldiriladi.</p>

      {isLoading ? <p className={tbl.empty}>Yuklanmoqda…</p>
        : rows.length === 0 ? <p className={tbl.empty}>Hali shablon yo'q</p>
        : (
          <ul className="flex flex-col gap-3">
            {rows.map((t) => (
              <li key={t.id} className={`rounded-surface bg-surface-sunken p-4 flex flex-col gap-2 ${t.hidden ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-ink">{t.title}</span>
                  <span className={`h-6 px-2 inline-flex items-center rounded-full text-xs font-medium whitespace-nowrap ${TEMPLATE_STATUS[t.status].cls}`}>{TEMPLATE_STATUS[t.status].label}</span>
                  {t.kind && <span className="h-6 px-2 inline-flex items-center rounded-full bg-surface text-xs font-medium text-ink whitespace-nowrap">{KIND_LABEL[t.kind]}</span>}
                </div>
                <p className="text-base text-ink whitespace-pre-wrap break-words">{t.text}</p>
                <div className="flex flex-wrap gap-2">
                  {t.status === "draft" && <button type="button" onClick={() => submit.mutate(t.id)} className="h-8 px-3 rounded-full bg-accent text-ink-on-accent text-sm font-medium">Eskiz'ga yuborish</button>}
                  {t.status !== "moderation" && <button type="button" onClick={() => setEditing(t)} className="h-8 px-3 rounded-full bg-surface text-ink text-sm font-medium hover:bg-mute-ghost-hover">Tahrirlash</button>}
                  {t.status === "approved" && <button type="button" onClick={() => hide.mutate({ id: t.id, hidden: !t.hidden })} className="h-8 px-3 rounded-full bg-surface text-ink text-sm font-medium hover:bg-mute-ghost-hover">{t.hidden ? "Ko'rsatish" : "Yashirish"}</button>}
                  {(t.status === "draft" || t.status === "rejected") && (
                    <button type="button" onClick={async () => { if (await confirmAction({ title: "Shablon o'chirilsinmi?", message: t.title })) del.mutate(t.id) }}
                      className="h-8 px-3 rounded-full bg-surface text-danger-text text-sm font-medium hover:bg-mute-ghost-hover">O'chirish</button>
                  )}
                </div>
                {t.status === "approved" && <p className="text-xs text-ink-faint">Matnni o'zgartirsangiz, shablon qayta Eskiz tekshiruviga ketadi.</p>}
              </li>
            ))}
          </ul>
        )}
      {editing && <TemplateEditor template={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function TemplateEditor({ template, onClose }: { template: SmsTemplate | null; onClose: () => void }) {
  const [title, setTitle] = useState(template?.title ?? "")
  const [text, setText] = useState(template?.text ?? "")
  const save = useSaveSmsTemplate()
  const area = useRef<HTMLTextAreaElement>(null)
  const { parts } = smsParts(fillTemplate(text, {}, "Abdurahmon"))
  const ok = !!title.trim() && !!text.trim() && !save.isPending
  const insertName = () => {
    const el = area.current
    const at = el?.selectionStart ?? text.length
    setText(text.slice(0, at) + "{ism}" + text.slice(el?.selectionEnd ?? at))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + 5, at + 5) })
  }
  const run = (submit: boolean) => save.mutate({ id: template?.id, title: title.trim(), text, submit }, { onSuccess: onClose })
  return (
    <Sheet open onClose={onClose} title={template ? "Shablonni tahrirlash" : "Yangi shablon"} className="sm:max-w-lg"
      footer={
        <div className="flex gap-2">
          <button type="button" disabled={!ok} onClick={() => run(false)} className="h-12 flex-1 rounded-full bg-surface-sunken text-ink text-base font-semibold disabled:opacity-40">Qoralama</button>
          <button type="button" disabled={!ok} onClick={() => run(true)} className="h-12 flex-1 rounded-full bg-accent text-ink-on-accent text-base font-semibold disabled:opacity-40">Eskiz'ga yuborish</button>
        </div>
      }>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Nomi (faqat sizga ko'rinadi)</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tadbir eslatmasi" className={`${INPUT} max-sm:h-12`} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Matn</span>
          <textarea ref={area} rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Assalomu alaykum, {ism}! {sana} kuni kutib qolamiz." className={`${INPUT} resize-y`} />
        </label>
        <div className="flex items-center justify-between gap-2 text-sm text-ink-muted">
          <button type="button" onClick={insertName} className="h-8 px-3 rounded-full bg-surface-sunken text-ink hover:bg-mute-ghost-hover">+ {"{ism}"}</button>
          <span className="tabular-nums">{text.length} belgi · {parts} SMS{blanks(text).length ? ` · bo'sh joylar: ${blanks(text).join(", ")}` : ""}</span>
        </div>
      </div>
    </Sheet>
  )
}

// ─── Tarix ───────────────────────────────────────────────────────────────────

function History() {
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const { data, isLoading } = useSmsCampaigns(page)
  const cancel = useCancelSmsCampaign()
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const later = (c: { send_at: string; queued: number }) => c.queued > 0 && new Date(c.send_at) > new Date()
  const cancelBtn = (c: { id: string }) => (
    <button type="button" onClick={async (e) => { e.stopPropagation(); if (await confirmAction({ title: "Rejalashtirilgan SMS bekor qilinsinmi?", message: "Hali ketmagan xabarlar yuborilmaydi." })) cancel.mutate(c.id) }}
      className="h-7 px-3 rounded-full bg-surface text-danger-text text-xs font-medium hover:bg-mute-ghost-hover whitespace-nowrap">Bekor qilish</button>
  )
  return (
    <div className="flex flex-col">
      <div className="lg:hidden rounded-surface bg-surface-sunken overflow-hidden">
        {isLoading ? <p className="py-10 text-center text-base text-ink-muted">Yuklanmoqda…</p>
          : rows.length === 0 ? <p className="py-10 text-center text-base text-ink-muted">Hali SMS yuborilmagan</p>
          : rows.map((c) => (
            <div key={c.id} className="border-b border-line last:border-0">
              <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}
                className="w-full px-4 py-3 flex items-start gap-3 text-left active:bg-surface-sunken-hover">
                <span className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <span className="text-base font-medium text-ink line-clamp-2 break-words">{c.template_title ?? c.text}</span>
                  <span className="text-sm text-ink-muted truncate tabular-nums">{when(c.created_at)} · {c.author ?? "—"}{later(c) ? ` · ${when(c.send_at)} da ketadi` : ""}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
                    <span className="h-6 px-2 rounded-full bg-surface text-xs font-medium text-ink flex items-center">{KIND_LABEL[c.kind]}</span>
                    <span><span className="text-success">{c.delivered}</span><span className="text-ink-muted"> / {c.total} yetdi</span></span>
                    {c.sent + c.queued > 0 && <span className="text-ink-muted">{c.sent + c.queued} yo'lda</span>}
                    {c.failed > 0 && <span className="text-danger">{c.failed} xato</span>}
                    {c.cancelled > 0 && <span className="text-ink-faint">{c.cancelled} bekor</span>}
                  </span>
                </span>
                <CaretDown size={16} className={`mt-1 shrink-0 text-ink-faint transition-transform ${open === c.id ? "rotate-180" : ""}`} />
              </button>
              {later(c) && <div className="px-4 pb-3 -mt-1">{cancelBtn(c)}</div>}
              {open === c.id && <div className="px-4 pb-3"><CampaignMessages campaignId={c.id} /></div>}
            </div>
          ))}
      </div>
      <div className={`${tbl.scroll} max-lg:hidden`}>
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={tbl.th}>Vaqt</th><th className={tbl.th}>Turi</th><th className={tbl.th}>Shablon / matn</th>
              <th className={tbl.th}>Kim</th><th className={`${tbl.th} text-right`}>Holat</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={5} className={tbl.empty}>Yuklanmoqda…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={5} className={tbl.empty}>Hali SMS yuborilmagan</td></tr>
              : rows.map((c) => (
                <Fragment key={c.id}>
                  <tr className={`${tbl.tr} cursor-pointer`} onClick={() => setOpen(open === c.id ? null : c.id)}>
                    <td className={`${tbl.td} whitespace-nowrap tabular-nums`}>
                      {when(c.created_at)}
                      {later(c) && <span className="block text-sm text-warning-text">{when(c.send_at)} da ketadi</span>}
                    </td>
                    <td className={tbl.td}>{KIND_LABEL[c.kind]}</td>
                    <td className={`${tbl.td} max-w-md`}>
                      {c.template_title && <span className="block text-sm font-medium text-ink">{c.template_title}</span>}
                      <span className="block truncate text-ink-muted" title={c.text}>{c.text}</span>
                    </td>
                    <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{c.author ?? "—"}</td>
                    <td className={`${tbl.td} text-right whitespace-nowrap tabular-nums text-sm`}>
                      <span className="text-success">{c.delivered}</span>
                      {c.sent + c.queued > 0 && <span className="text-ink-muted"> · {c.sent + c.queued} yo'lda</span>}
                      {c.failed > 0 && <span className="text-danger"> · {c.failed} xato</span>}
                      {c.cancelled > 0 && <span className="text-ink-faint"> · {c.cancelled} bekor</span>}
                      <span className="text-ink-faint"> / {c.total}</span>
                      {later(c) && <span className="block mt-1">{cancelBtn(c)}</span>}
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
