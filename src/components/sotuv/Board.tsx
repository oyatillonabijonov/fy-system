import { useState } from "react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import { Plus } from "@phosphor-icons/react"
import { EdgeScroll } from "@/components/ui/EdgeScroll"
import type { Lead, Stage } from "@/lib/supabase/queries/sotuv"
import { useUpdateLead } from "@/hooks/useSotuv"
import { PersonDot } from "@/components/vazifalar/pickers"
import { formatNumber } from "@/lib/format"
import { TaskChip, NoTaskChip, StageDot, shortMoney } from "./ui"

/** AmoCRM-style board: one column per bosqich; dropping a card moves the deal */
export function Board({ stages, leads, today, onOpen, onAdd }: {
  stages: Stage[]
  leads: Lead[]
  today: string
  onOpen: (l: Lead) => void
  onAdd: (stageId: string) => void
}) {
  const update = useUpdateLead()

  const [dragging, setDragging] = useState(false)

  function onDragEnd(r: DropResult) {
    setDragging(false)
    const to = r.destination?.droppableId
    if (!to || to === r.source.droppableId) return
    update.mutate({ id: r.draggableId, patch: { stage_id: to } })
  }

  return (
    <DragDropContext onDragStart={() => setDragging(true)} onDragEnd={onDragEnd}>
      <EdgeScroll dragging={dragging} className="flex gap-3 pb-2 min-h-[60vh]">
        {stages.map((s) => {
          const col = leads.filter((l) => l.stage_id === s.id)
          const sum = col.reduce((a, l) => a + l.price, 0)
          const open = !s.is_won && !s.is_lost
          return (
            <div key={s.id} className="w-[272px] shrink-0 flex flex-col rounded-surface bg-surface-sunken p-2">
              <div className="px-2 pt-1 pb-2">
                <div className="flex items-center gap-2">
                  <StageDot color={s.color} />
                  <span className="flex-1 text-base font-semibold text-ink truncate">{s.name}</span>
                  <span className="text-sm text-ink-muted tabular-nums">{col.length}</span>
                </div>
                <span className="block mt-0.5 pl-4 text-sm text-ink-muted tabular-nums">{formatNumber(sum)} so'm</span>
              </div>
              <Droppable droppableId={s.id}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}
                    className={`flex-1 flex flex-col gap-2 min-h-[48px] rounded-control transition-colors ${snapshot.isDraggingOver ? "bg-mute-ghost-hover" : ""}`}>
                    {col.map((l, i) => (
                      <Draggable key={l.id} draggableId={l.id} index={i}>
                        {(drag, dragSnap) => (
                          // A div, not a button: Space must reach the drag handle (keyboard drag), Enter opens
                          <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps}
                            role="button" tabIndex={0} onClick={() => onOpen(l)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(l) }}
                            className={`rounded-control bg-surface px-3 py-2.5 flex flex-col gap-1.5 cursor-pointer transition-colors hover:bg-surface-raised ${dragSnap.isDragging ? "ring-1 ring-line" : ""} ${s.is_lost ? "opacity-60" : ""}`}>
                            <span className="text-base font-medium text-ink leading-snug line-clamp-2">{l.client?.full_name ?? l.name}</span>
                            {l.client && l.name !== l.client.full_name && <span className="text-sm text-ink-muted truncate -mt-1">{l.name}</span>}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {open && (l.next_task ? <TaskChip kind={l.next_task.kind} due={l.next_task.due_date} today={today} /> : <NoTaskChip />)}
                              {l.price > 0 && <span className="text-sm text-ink-muted tabular-nums">{shortMoney(l.price)}</span>}
                              <span className="flex-1" />
                              {l.responsible && <PersonDot name={l.responsible.full_name} url={l.responsible.avatar_url} />}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {open && (
                      <button type="button" onClick={() => onAdd(s.id)}
                        className="flex items-center gap-1.5 h-9 px-2 rounded-full text-sm font-medium text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors">
                        <Plus size={12} weight="bold" />Bitim
                      </button>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          )
        })}
      </EdgeScroll>
    </DragDropContext>
  )
}
