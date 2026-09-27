import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { Plus } from "@phosphor-icons/react"
import type { CrmStage, CrmLeadWithContact } from "@/lib/supabase/queries/crm"
import { CrmNCard } from "./CrmNCard"
import { formatNumber } from "@/lib/format"

interface CrmNBoardProps {
  leads: CrmLeadWithContact[]
  stages: CrmStage[]
  pipelineName: string
  onLeadClick?: (lead: CrmLeadWithContact) => void
  onDragEnd?: (result: DropResult) => void
  onAddLead?: () => void
}


export function CrmNBoard({
  leads,
  stages,
  pipelineName,
  onLeadClick,
  onDragEnd,
  onAddLead,
}: CrmNBoardProps) {
  const totalLeads = leads.length
  const totalAmount = leads.reduce((sum, l) => sum + l.price, 0)

  function handleDragEnd(result: DropResult) {
    onDragEnd?.(result)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-4">
        <span className="text-base font-bold text-ink" style={{ letterSpacing: "-0.4px" }}>
          {pipelineName}
        </span>

        <div className="flex items-center gap-3 text-sm text-ink-muted font-medium">
          <span>
            <span className="font-bold text-ink">{totalLeads}</span> ta lid
          </span>
          <span style={{ color: "var(--ds-color-border-default)" }}>|</span>
          <span>
            <span className="font-bold text-ink">
              {formatNumber(totalAmount)}
            </span>{" "}
            so'm
          </span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5 text-sm text-ink-muted font-medium">
          <div className="w-2 h-2 rounded-full bg-accent" />
          CRM-N
        </div>
      </div>

      {/* Kanban columns with drag & drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div
          className="flex gap-3 overflow-x-auto pb-4"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "var(--ds-color-border-default) transparent",
          }}
        >
          {stages.map((stage) => {
            const stageLeads = leads.filter((l) => l.stage_id === stage.id)
            const stageTotal = stageLeads.reduce((s, l) => s + l.price, 0)
            const isLost = stage.is_lost
            const isWon = stage.is_won

            return (
              <Droppable key={stage.id} droppableId={stage.id}>
                {(provided, snapshot) => (
                  <div
                    className="flex flex-col w-[280px] shrink-0"
                    style={{ height: "calc(100vh - 260px)" }}
                  >
                    {/* Column header */}
                    <div className="flex flex-col gap-1 pb-3 shrink-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: stage.color }}
                          />
                          <span className="text-base font-bold text-ink" style={{ letterSpacing: "-0.4px" }}>
                            {stage.name}
                          </span>
                        </div>
                        <span className="inline-flex px-1.5 py-0.5 rounded-tag text-xs font-bold bg-surface-sunken text-ink-muted">
                          {stageLeads.length}
                        </span>
                      </div>
                      {stageTotal > 0 && (
                        <span className="text-xs text-ink-muted font-medium pl-4">
                          {formatNumber(stageTotal)} so'm
                        </span>
                      )}
                    </div>

                    {/* Cards area */}
                    <div className="relative flex-1 min-h-0">
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex flex-col gap-2 h-full overflow-y-auto py-1 px-1 transition-colors rounded-surface ${
                          snapshot.isDraggingOver ? "bg-info-soft" : ""
                        }`}
                        style={{
                          scrollbarWidth: "thin",
                          scrollbarColor: "var(--ds-color-border-default) transparent",
                        }}
                      >
                        {stageLeads.map((lead, index) => (
                          <Draggable key={lead.id} draggableId={lead.id} index={index}>
                            {(dragProvided) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                              >
                                <CrmNCard lead={lead} isLost={isLost} onClick={onLeadClick} />
                              </div>
                            )}
                          </Draggable>
                        ))}

                        {provided.placeholder}

                        {/* Add card button */}
                        {!isLost && !isWon && (
                          <button
                            onClick={onAddLead}
                            className="flex items-center justify-center gap-1.5 py-3 border border-dashed border-line rounded-surface text-sm font-medium text-ink-muted hover:bg-mute-ghost-hover hover:text-ink transition-colors shrink-0"
                          >
                            <Plus size={14} />
                            Lid qo'shish
                          </button>
                        )}
                      </div>

                      {/* Bottom fade gradient */}
                      <div
                        className="absolute bottom-0 left-0 right-0 h-[60px] pointer-events-none z-[1]"
                        style={{
                          background: "linear-gradient(to bottom, transparent, var(--ds-color-surface-default))",
                        }}
                      />
                    </div>
                  </div>
                )}
              </Droppable>
            )
          })}
        </div>
      </DragDropContext>
    </div>
  )
}
