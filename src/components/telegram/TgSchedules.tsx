// Voronka sozlamalari → Rejalashtirilgan xabarlar (102): "N days before the voronka's event at HH:MM send
// template X to its bitimlar". amo-sync sends them at that time; each bitim gets a rule's message once.
import { useState } from "react"
import { CalendarBlank, Plus, Trash } from "@phosphor-icons/react"
import { Switch } from "@/components/ui/Switch"
import { useDeleteTgSchedule, useSaveTgSchedule, useTgSchedules, useTgTemplates } from "@/hooks/useTelegram"
import type { Stage } from "@/lib/supabase/queries/sotuv"
import { confirmAction } from "@/lib/confirm"

const FIELD = "h-control-md px-3 rounded-control border border-line bg-surface text-base text-ink focus:outline-none focus:border-line-focus"

export function TgSchedules({ pipelineId, stages }: { pipelineId: string; stages: Stage[] }) {
  const { data: rules = [] } = useTgSchedules(pipelineId)
  const { data: all = [] } = useTgTemplates()
  const templates = all.filter((t) => !t.pipeline_id || t.pipeline_id === pipelineId)
  const save = useSaveTgSchedule()
  const del = useDeleteTgSchedule()
  const [adding, setAdding] = useState(false)
  const [tpl, setTpl] = useState("")
  const [days, setDays] = useState(1)
  const [time, setTime] = useState("10:00")
  const [picked, setPicked] = useState<string[]>([])
  const name = (id: string) => all.find((t) => t.id === id)?.title ?? "—"
  const stageNames = (ids: string[]) => ids.length ? ids.map((id) => stages.find((s) => s.id === id)?.name).filter(Boolean).join(", ") : "ochiq bitimlar"
  const when = (d: number, t: string) => `${d === 0 ? "Tadbir kuni" : `Tadbirdan ${d} kun oldin`} · ${t}`

  function add() {
    if (!tpl) return
    save.mutate({ pipeline_id: pipelineId, template_id: tpl, days_before: days, at_time: time, stage_ids: picked, enabled: true }, {
      onSuccess: () => { setAdding(false); setTpl(""); setPicked([]) },
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink-muted">Rejalashtirilgan Telegram xabarlari</span>
      <p className="text-xs text-ink-faint -mt-1">Belgilangan vaqtda shablon voronkaning bitimlariga o'zi ketadi — har bir bitimga bir marta.</p>
      {rules.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-control bg-surface-sunken">
          <CalendarBlank size={20} className="shrink-0 text-[#2AABEE]" />
          <span className="flex-1 min-w-0 flex flex-col">
            <span className="text-base text-ink truncate">«{name(r.template_id)}»</span>
            <span className="text-sm text-ink-muted truncate">{when(r.days_before, r.at_time)} · {stageNames(r.stage_ids)}{(r.sent || r.failed) ? ` · ✓ ${r.sent}${r.failed ? ` · ketmadi ${r.failed}` : ""}` : ""}</span>
          </span>
          <Switch on={r.enabled} label="Yoqilgan" onChange={(v) => save.mutate({ ...r, enabled: v })} />
          <button type="button" aria-label="O'chirish" onClick={async () => { if (await confirmAction({ title: "Rejalashtirilgan xabarni o'chirish", message: `«${name(r.template_id)}» — ${when(r.days_before, r.at_time)}`, confirmLabel: "O'chirish", danger: true })) del.mutate(r.id) }}
            className="p-1.5 rounded-full text-ink-muted hover:text-danger-text hover:bg-mute-ghost-hover"><Trash size={16} /></button>
        </div>
      ))}
      {adding ? (
        <div className="flex flex-col gap-3 p-3 rounded-control bg-surface-sunken">
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} aria-label="Shablon" className={FIELD}>
            <option value="">Shablonni tanlang</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-2 text-base text-ink">
            Tadbirdan
            <input type="number" min={0} max={60} value={days} onChange={(e) => setDays(Math.max(0, Math.min(60, Number(e.target.value) || 0)))} aria-label="Necha kun oldin" className={`${FIELD} w-20`} />
            kun oldin, soat
            <input type="time" value={time} onChange={(e) => setTime(e.target.value || "10:00")} aria-label="Soat" className={FIELD} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-muted">Kimga: {picked.length ? "tanlangan bosqichlar" : "barcha ochiq bitimlar"}</span>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((s) => (
                <button key={s.id} type="button" aria-pressed={picked.includes(s.id)} onClick={() => setPicked(picked.includes(s.id) ? picked.filter((x) => x !== s.id) : [...picked, s.id])}
                  className={`h-8 px-3 rounded-full text-sm whitespace-nowrap ${picked.includes(s.id) ? "bg-[#2AABEE] text-white" : "bg-surface text-ink-muted hover:text-ink"}`}>{s.name}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)} className="h-10 px-4 rounded-full bg-surface text-base text-ink hover:bg-mute-ghost-hover">Bekor qilish</button>
            <button type="button" onClick={add} disabled={!tpl || save.isPending} className="flex-1 h-10 px-4 rounded-full bg-accent text-ink-on-accent text-base font-medium whitespace-nowrap hover:bg-accent-hover disabled:opacity-40">Qo'shish</button>
          </div>
          {templates.length === 0 && <p className="text-sm text-warning-text">Avval shablon qo'shing: Sotuv → Telegram → ⚡</p>}
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="self-start h-9 px-3.5 inline-flex items-center gap-1.5 rounded-full bg-mute-soft text-sm font-medium text-ink hover:bg-mute-soft-hover"><Plus size={16} />Rejalashtirilgan xabar</button>
      )}
    </div>
  )
}
