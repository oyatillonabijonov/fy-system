import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Plus, Kanban, Rows, CheckSquare, GearSix, MagnifyingGlass, Funnel, Copy } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { usePipelines, useStages, useLeads, useCreatePipeline, useDuplicateLeads, SOTUV_KEY } from "@/hooks/useSotuv"
import { subscribeLeads, sourceLabel, type Lead, type Stage } from "@/lib/supabase/queries/sotuv"
import { tashkentToday } from "@/lib/period"
import { formatDate, formatNumber } from "@/lib/format"
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"
import { PersonDot } from "@/components/vazifalar/pickers"
import { Board } from "@/components/sotuv/Board"
import { LeadCreate } from "@/components/sotuv/LeadCreate"
import { PipelineSettings } from "@/components/sotuv/PipelineSettings"
import { SalesTasks } from "@/components/sotuv/SalesTasks"
import { Duplicates } from "@/components/sotuv/Duplicates"
import { TaskChip, NoTaskChip, StageDot } from "@/components/sotuv/ui"

const LAST_PIPELINE = "fy_last_crm_pipeline_id"
type View = "kanban" | "list" | "tasks"

export function Sotuv() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const view = (params.get("v") as View | null) ?? "kanban"
  const { data: pipelines = [], isLoading } = usePipelines()
  const saved = (() => { try { return localStorage.getItem(LAST_PIPELINE) } catch { return null } })()
  const wanted = params.get("p") ?? saved
  const pipeline = pipelines.find((p) => p.id === wanted) ?? pipelines[0] ?? null
  const pid = pipeline?.id ?? null
  const { data: stages = [] } = useStages(pid)
  const { data: leads = [], isLoading: leadsLoading } = useLeads(pid)
  const createPipeline = useCreatePipeline()
  const [q, setQ] = useState("")
  const [creating, setCreating] = useState<{ stageId: string | null } | null>(null)
  const [settings, setSettings] = useState(false)
  const [dups, setDups] = useState(false)
  const { data: duplicates = [] } = useDuplicateLeads()
  const today = tashkentToday()

  const set = (k: string, v: string | null) => setParams((cur) => { const n = new URLSearchParams(cur); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })
  function pick(id: string) {
    try { localStorage.setItem(LAST_PIPELINE, id) } catch { /* private browsing */ }
    set("p", id)
  }

  // Someone else moves or adds a deal → the board follows
  useEffect(() => {
    if (!pid) return
    return subscribeLeads(pid, () => qc.invalidateQueries({ queryKey: [...SOTUV_KEY, "leads", pid] }))
  }, [pid, qc])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return leads
    const digits = s.replace(/\D/g, "")
    return leads.filter((l) => l.name.toLowerCase().includes(s) || l.client?.full_name.toLowerCase().includes(s)
      || (digits.length >= 3 && l.client?.phone?.includes(digits)))
  }, [leads, q])
  const openLeads = leads.filter((l) => !l.is_won && !l.is_lost)

  function newPipeline() {
    const name = window.prompt("Yangi voronka nomi")?.trim()
    if (name) createPipeline.mutate({ name, sortOrder: pipelines.length }, { onSuccess: (p) => pick(p.id) })
  }
  const open = (l: Lead) => navigate(`/sotuv/bitim/${l.id}`)

  if (!isLoading && pipelines.length === 0) {
    return (
      <div className="bg-surface-sunken rounded-surface py-12 px-6 text-center flex flex-col items-center gap-3">
        <Funnel size={32} weight="thin" className="text-ink-muted" />
        <p className="text-base text-ink-muted">Hali voronka yo'q.</p>
        {isAdmin && <button onClick={newPipeline} className="h-control-md px-4 rounded-full bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover transition-colors">Voronka yaratish</button>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Voronkalar */}
      <div role="tablist" aria-label="Voronkalar" className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {pipelines.map((p) => (
          <button key={p.id} role="tab" aria-selected={p.id === pid} onClick={() => pick(p.id)}
            className={`shrink-0 h-9 px-4 rounded-full text-base font-medium transition-colors ${p.id === pid ? "bg-accent text-ink-on-accent" : "text-ink-muted hover:text-ink hover:bg-mute-ghost-hover"}`}>
            {p.name}
          </button>
        ))}
        {isAdmin && (
          <button onClick={newPipeline} aria-label="Yangi voronka" title="Yangi voronka"
            className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors"><Plus size={16} /></button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {view !== "tasks" && (
          <label className="flex items-center gap-2 h-control-md px-3 rounded-full bg-surface-sunken w-full sm:w-72">
            <MagnifyingGlass size={16} className="text-ink-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism, bitim yoki telefon"
              className="flex-1 min-w-0 bg-transparent text-base text-ink placeholder:text-ink-muted focus:outline-none" />
          </label>
        )}
        {view !== "tasks" && (
          <span className="text-sm text-ink-muted tabular-nums">
            {openLeads.length} ta ochiq · {formatNumber(openLeads.reduce((a, l) => a + l.price, 0))} so'm
          </span>
        )}
        <div className="flex-1" />
        <div role="radiogroup" aria-label="Ko'rinish" className="inline-flex gap-1 p-1 rounded-control bg-surface-sunken">
          {([["kanban", "Kanban", Kanban], ["list", "Ro'yxat", Rows], ["tasks", "Vazifalar", CheckSquare]] as const).map(([id, label, Icon]) => (
            <button key={id} role="radio" aria-checked={view === id} onClick={() => set("v", id === "kanban" ? null : id)}
              className={`h-7 px-3 flex items-center gap-1.5 rounded-item text-sm font-medium transition-colors ${view === id ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}>
              <Icon size={16} />{label}
            </button>
          ))}
        </div>
        {duplicates.length > 0 && (
          <button onClick={() => setDups(true)} title="Bir mijozning bir nechta ochiq bitimi"
            className="h-control-md px-3 flex items-center gap-1.5 rounded-full bg-warning-soft text-warning-dark text-sm font-medium hover:opacity-90 transition-opacity">
            <Copy size={16} />Dublikatlar · {duplicates.length}
          </button>
        )}
        {isAdmin && pipeline && (
          <button onClick={() => setSettings(true)} aria-label="Voronka sozlamalari" title="Voronka sozlamalari"
            className="h-control-md aspect-square flex items-center justify-center rounded-full text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors"><GearSix size={20} /></button>
        )}
        <button onClick={() => setCreating({ stageId: null })} disabled={!pipeline}
          className="h-control-md px-4 flex items-center gap-1.5 rounded-full bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover transition-colors">
          <Plus size={16} />Bitim
        </button>
      </div>

      {view === "tasks" ? (
        <SalesTasks today={today} />
      ) : leadsLoading || !pipeline ? (
        <div className="bg-surface-sunken rounded-surface py-12 text-center text-base text-ink-muted">Yuklanmoqda…</div>
      ) : view === "list" ? (
        <LeadTable leads={shown} stages={stages} today={today} onOpen={open} />
      ) : (
        <Board stages={stages} leads={shown} today={today} onOpen={open} onAdd={(stageId) => setCreating({ stageId })} />
      )}

      {creating && pipeline && (
        <LeadCreate pipelineId={pipeline.id} stages={stages} stageId={creating.stageId}
          onClose={() => setCreating(null)} onCreated={(id) => navigate(`/sotuv/bitim/${id}`)} />
      )}
      {dups && <Duplicates onClose={() => setDups(false)} />}
      {settings && pipeline && (
        <PipelineSettings pipeline={pipeline} stages={stages} onClose={() => setSettings(false)} onDeleted={() => { setSettings(false); set("p", null) }} />
      )}
    </div>
  )
}

function LeadTable({ leads, stages, today, onOpen }: { leads: Lead[]; stages: Stage[]; today: string; onOpen: (l: Lead) => void }) {
  const { page, setPage, pageCount, pageItems } = usePaged(leads)
  const stage = (id: string) => stages.find((s) => s.id === id)
  return (
    <div>
      <div className={tbl.scroll}>
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={tbl.th}>Bitim</th><th className={tbl.th}>Telefon</th><th className={tbl.th}>Bosqich</th>
              <th className={`${tbl.th} text-right`}>Summa</th><th className={tbl.th}>Keyingi vazifa</th>
              <th className={tbl.th}>Mas'ul</th><th className={tbl.th}>Manba</th><th className={tbl.th}>Yaratildi</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && <tr><td colSpan={8} className={tbl.empty}>Bitim topilmadi</td></tr>}
            {pageItems.map((l) => {
              const s = stage(l.stage_id)
              return (
                <tr key={l.id} className={`${tbl.tr} cursor-pointer`} onClick={() => onOpen(l)}>
                  <td className={tbl.td}>
                    <span className="block font-medium">{l.client?.full_name ?? l.name}</span>
                    {l.client && l.name !== l.client.full_name && <span className="block text-sm text-ink-muted">{l.name}</span>}
                  </td>
                  <td className={`${tbl.td} tabular-nums whitespace-nowrap`}>{l.client?.phone ?? "—"}</td>
                  <td className={tbl.td}><span className="inline-flex items-center gap-2 whitespace-nowrap">{s && <StageDot color={s.color} />}{s?.name}</span></td>
                  <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap`}>{formatNumber(l.price)}</td>
                  <td className={tbl.td}>{l.is_won || l.is_lost ? "—" : l.next_task ? <TaskChip kind={l.next_task.kind} due={l.next_task.due_date} today={today} /> : <NoTaskChip />}</td>
                  <td className={tbl.td}>{l.responsible ? <span className="inline-flex items-center gap-2 whitespace-nowrap"><PersonDot name={l.responsible.full_name} url={l.responsible.avatar_url} />{l.responsible.full_name}</span> : "—"}</td>
                  <td className={`${tbl.td} whitespace-nowrap`}>{sourceLabel(l.source)}</td>
                  <td className={`${tbl.td} tabular-nums whitespace-nowrap text-ink-muted`}>{formatDate(l.created_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={pageCount} total={leads.length} onPage={setPage} />
    </div>
  )
}
