import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import { TASK_STATUSES, type Task, type TaskStatus } from "@/lib/supabase/queries/tasks"
import { useUpdateTask } from "@/hooks/useTasks"
import { STATUS_VARIANTS } from "@/lib/constants/theme"
import { STATUS_VARIANT, Owner, DueDate, CommentCount, isOverdue } from "./taskUi"

/** One column per status; dropping a card on another column changes its status */
export function TaskKanban({ tasks, today, onOpen }: { tasks: Task[]; today: string; onOpen: (t: Task) => void }) {
  const update = useUpdateTask()

  function onDragEnd(r: DropResult) {
    const to = r.destination?.droppableId as TaskStatus | undefined
    if (!to || to === r.source.droppableId) return
    update.mutate({ id: r.draggableId, patch: { status: to } })
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {TASK_STATUSES.map((s) => {
          const col = tasks.filter((t) => t.status === s.id)
          const v = STATUS_VARIANTS[STATUS_VARIANT[s.id]]
          return (
            <Droppable key={s.id} droppableId={s.id}>
              {(provided, snapshot) => (
                <div className={`flex flex-col rounded-surface p-2 min-h-[240px] transition-colors ${snapshot.isDraggingOver ? "bg-surface-sunken-hover" : "bg-surface-sunken"}`}>
                  <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                    <span className="flex items-center gap-2 text-base font-semibold text-ink">
                      <span className="size-2 rounded-full" style={{ backgroundColor: v.text }} />
                      {s.label}
                    </span>
                    <span className="text-sm text-ink-muted tabular-nums">{col.length}</span>
                  </div>
                  <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-2 flex-1">
                    {col.map((t, i) => (
                      <Draggable key={t.id} draggableId={t.id} index={i}>
                        {(drag) => (
                          // A div, not a button: Space must reach the drag handle (keyboard drag), Enter opens
                          <div
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            {...drag.dragHandleProps}
                            role="button"
                            onClick={() => onOpen(t)}
                            onKeyDown={(e) => { if (e.key === "Enter") onOpen(t) }}
                            className={`text-left bg-surface rounded-control p-3 flex flex-col gap-2 border ${isOverdue(t, today) ? "border-danger-text/40" : "border-transparent"}`}
                          >
                            {t.section && <span className="text-xs font-medium text-ink-muted">{t.section}</span>}
                            <span className="text-base text-ink line-clamp-3">{t.title}</span>
                            <span className="flex items-center justify-between gap-2">
                              <Owner task={t} />
                              <span className="flex items-center gap-2 shrink-0">
                                <CommentCount n={t.comments_count} />
                                <DueDate task={t} today={today} />
                              </span>
                            </span>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          )
        })}
      </div>
    </DragDropContext>
  )
}
