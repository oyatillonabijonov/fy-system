import { useState } from "react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import { Plus } from "@phosphor-icons/react"
import { EdgeScroll } from "@/components/ui/EdgeScroll"
import { TASK_STATUSES, type Task, type TaskStatus } from "@/lib/supabase/queries/tasks"
import { useUpdateTask } from "@/hooks/useTasks"
import { Avatar, DueChip, CommentCount, AttachCount, sectionColor } from "./taskUi"

/** Trello-style board: one column per status; dropping a card on another column changes its status */
export function TaskKanban({
  tasks,
  sections,
  today,
  onOpen,
  onAdd,
}: {
  tasks: Task[]
  sections: string[]
  today: string
  onOpen: (t: Task) => void
  onAdd: (status: TaskStatus) => void
}) {
  const update = useUpdateTask()

  const [dragging, setDragging] = useState(false)

  function onDragEnd(r: DropResult) {
    setDragging(false)
    const to = r.destination?.droppableId as TaskStatus | undefined
    if (!to || to === r.source.droppableId) return
    update.mutate({ id: r.draggableId, patch: { status: to } })
  }

  return (
    <DragDropContext onDragStart={() => setDragging(true)} onDragEnd={onDragEnd}>
      <EdgeScroll dragging={dragging} className="flex gap-3 pb-2 -mx-1 px-1">
        {TASK_STATUSES.map((s) => {
          const col = tasks.filter((t) => t.status === s.id)
          return (
            <div key={s.id} className="w-[280px] shrink-0 flex flex-col rounded-surface bg-surface-sunken p-2">
              <div className="flex items-center justify-between px-2 pt-1 pb-2">
                <span className="text-base font-semibold text-ink">{s.label}</span>
                <span className="text-sm text-ink-muted tabular-nums">{col.length}</span>
              </div>
              <Droppable droppableId={s.id}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}
                    className={`flex flex-col gap-2 min-h-[48px] rounded-control transition-colors ${snapshot.isDraggingOver ? "bg-mute-ghost-hover" : ""}`}>
                    {col.map((t, i) => (
                      <Draggable key={t.id} draggableId={t.id} index={i}>
                        {(drag, dragSnap) => (
                          // A div, not a button: Space must reach the drag handle (keyboard drag), Enter opens
                          <div
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            {...drag.dragHandleProps}
                            role="button"
                            onClick={() => onOpen(t)}
                            onKeyDown={(e) => { if (e.key === "Enter") onOpen(t) }}
                            className={`bg-surface rounded-control border border-line p-3 flex flex-col gap-2.5 cursor-pointer ${dragSnap.isDragging ? "rotate-1" : ""}`}
                          >
                            {t.section && (
                              <span className="flex items-center gap-2">
                                <span className="h-1.5 w-10 rounded-full" style={{ backgroundColor: sectionColor(t.section, sections) }} />
                                <span className="text-xs text-ink-muted truncate">{t.section}</span>
                              </span>
                            )}
                            <span className={`text-base leading-snug line-clamp-3 ${t.status === "done" ? "text-ink-muted" : "text-ink"}`}>{t.title}</span>
                            {(t.due_date || t.comments_count > 0 || t.attachments_count > 0 || t.assignee_id || t.assignee_name) && (
                              <span className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2">
                                  <DueChip task={t} today={today} />
                                  <AttachCount n={t.attachments_count} />
                                  <CommentCount n={t.comments_count} />
                                </span>
                                <Avatar task={t} />
                              </span>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
              <button type="button" onClick={() => onAdd(s.id)}
                className="mt-2 flex items-center gap-1.5 h-8 px-2 rounded-full text-sm font-medium text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors">
                <Plus size={12} weight="bold" />Kartochka qo'shish
              </button>
            </div>
          )
        })}
      </EdgeScroll>
    </DragDropContext>
  )
}
