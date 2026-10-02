import { useId, useState } from "react"
import { motion } from "framer-motion"
import { X, Trash, ArrowUp, ArrowDown, Plus } from "@phosphor-icons/react"
import { useDialog } from "@/hooks/useDialog"
import { useRenamePipeline, useDeletePipeline, useSaveStage, useDeleteStage } from "@/hooks/useSotuv"
import type { Pipeline, Stage } from "@/lib/supabase/queries/sotuv"
import { INPUT } from "@/components/moliya/PaymentActionModals"
import { Popover } from "@/components/vazifalar/pickers"
import { confirmAction } from "@/lib/confirm"

const COLORS = ["#378ADD", "#BA7517", "#7F77DD", "#D4537E", "#1D9E75", "#E24B4A", "#888780", "#D85A30"]

/** Admin: rename/delete the voronka, add/rename/recolour/reorder/delete its bosqichlar.
 *  Every change saves at once. Won/lost stages stay last and can't be removed. */
export function PipelineSettings({ pipeline, stages, onClose, onDeleted }: {
  pipeline: Pipeline; stages: Stage[]; onClose: () => void; onDeleted: () => void
}) {
  const titleId = useId()
  const panelRef = useDialog<HTMLDivElement>(onClose, true)
  const rename = useRenamePipeline()
  const del = useDeletePipeline()
  const save = useSaveStage()
  const delStage = useDeleteStage()
  const [name, setName] = useState(pipeline.name)
  const [newStage, setNewStage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const onError = (e: Error) => setError(e.message)

  const open = stages.filter((s) => !s.is_won && !s.is_lost)
  const closed = stages.filter((s) => s.is_won || s.is_lost)

  function move(i: number, d: -1 | 1) {
    const a = open[i], b = open[i + d]
    if (!a || !b) return
    save.mutate({ ...a, sort_order: b.sort_order }, { onError })
    save.mutate({ ...b, sort_order: a.sort_order }, { onError })
  }
  function add() {
    const v = newStage.trim()
    if (!v) return
    // New stage goes after the open ones; won/lost shift down by one
    const at = (open.at(-1)?.sort_order ?? -1) + 1
    closed.forEach((s) => save.mutate({ ...s, sort_order: s.sort_order + 1 }, { onError }))
    save.mutate({ pipeline_id: pipeline.id, name: v, color: COLORS[open.length % COLORS.length], sort_order: at }, { onError })
    setNewStage("")
  }
  async function removePipeline() {
    if (!(await confirmAction({ title: "Voronkani o'chirish", message: `"${pipeline.name}" voronkasi o'chirilsinmi?` }))) return
    del.mutate(pipeline.id, { onSuccess: onDeleted, onError })
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[8vh]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-surface-overlay backdrop-blur-sm" />
      <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        initial={{ scale: 0.97, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-md bg-surface-raised rounded-overlay flex flex-col max-h-[84vh]">
        <div className="flex items-center justify-between px-5 h-14 border-b border-line shrink-0">
          <h3 id={titleId} className="text-md font-semibold text-ink">Voronka sozlamalari</h3>
          <button onClick={onClose} aria-label="Yopish" className="p-1.5 rounded-full text-ink-muted hover:bg-mute-ghost-hover transition-colors"><X size={20} /></button>
        </div>
        <div className="p-5 flex flex-col gap-5 overflow-y-auto">
          {error && <div role="alert" className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark">{error}</div>}
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Voronka nomi"
            onBlur={() => { const v = name.trim(); if (v && v !== pipeline.name) rename.mutate({ id: pipeline.id, name: v }, { onError }); else setName(pipeline.name) }}
            className={`${INPUT} text-md font-semibold`} />

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink-muted mb-1">Bosqichlar</span>
            {open.map((s, i) => (
              <StageRow key={s.id} stage={s} onSave={(p) => save.mutate({ ...s, ...p }, { onError })}
                onUp={i > 0 ? () => move(i, -1) : undefined} onDown={i < open.length - 1 ? () => move(i, 1) : undefined}
                onDelete={async () => { if (await confirmAction({ title: "Bosqichni o'chirish", message: `"${s.name}" bosqichi o'chirilsinmi?` })) delStage.mutate(s.id, { onError }) }} />
            ))}
            <div className="flex items-center gap-2 mt-1">
              <input value={newStage} onChange={(e) => setNewStage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add() }}
                placeholder="Yangi bosqich nomi" className={INPUT} />
              <button onClick={add} disabled={!newStage.trim()} aria-label="Bosqich qo'shish"
                className="h-control-md aspect-square shrink-0 flex items-center justify-center rounded-full bg-accent text-ink-on-accent disabled:opacity-40 transition-opacity"><Plus size={16} /></button>
            </div>
            <span className="text-sm font-medium text-ink-muted mt-4 mb-1">Yakuniy bosqichlar</span>
            {closed.map((s) => <StageRow key={s.id} stage={s} onSave={(p) => save.mutate({ ...s, ...p }, { onError })} />)}
          </div>

          <button onClick={removePipeline} className="self-start flex items-center gap-1.5 h-control-md px-3 rounded-full text-base font-medium text-danger-text hover:bg-danger-soft transition-colors">
            <Trash size={16} />Voronkani o'chirish
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function StageRow({ stage, onSave, onUp, onDown, onDelete }: {
  stage: Stage; onSave: (p: Partial<Stage>) => void; onUp?: () => void; onDown?: () => void; onDelete?: () => void
}) {
  const [name, setName] = useState(stage.name)
  const iconBtn = "p-1.5 rounded-full text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors disabled:opacity-30 disabled:pointer-events-none"
  return (
    <div className="flex items-center gap-2 h-11 px-2 rounded-control bg-surface-sunken">
      <Popover width={176} trigger={(_, toggle) => (
        <button type="button" onClick={toggle} aria-label={`${stage.name} rangi`} className="w-4 h-4 rounded-full shrink-0 block" style={{ backgroundColor: stage.color }} />
      )}>
        {(close) => (
          <div className="grid grid-cols-4 gap-2 p-1">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => { onSave({ color: c }); close() }}
                className={`w-8 h-8 rounded-full ${c === stage.color ? "ring-2 ring-offset-2 ring-ink ring-offset-surface-raised" : ""}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        )}
      </Popover>
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Bosqich nomi"
        onBlur={() => { const v = name.trim(); if (v && v !== stage.name) onSave({ name: v }); else setName(stage.name) }}
        className="flex-1 min-w-0 bg-transparent text-base text-ink focus:outline-none" />
      {stage.is_won && <span className="text-sm text-success-text">Yutildi</span>}
      {stage.is_lost && <span className="text-sm text-danger-text">Yutqazildi</span>}
      {(onUp || onDown) && <>
        <button onClick={onUp} disabled={!onUp} aria-label="Yuqoriga" className={iconBtn}><ArrowUp size={16} /></button>
        <button onClick={onDown} disabled={!onDown} aria-label="Pastga" className={iconBtn}><ArrowDown size={16} /></button>
      </>}
      {onDelete && <button onClick={onDelete} aria-label="O'chirish" className={`${iconBtn} hover:text-danger-text`}><Trash size={16} /></button>}
    </div>
  )
}
