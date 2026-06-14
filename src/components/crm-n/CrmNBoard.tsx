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
        <span className="text-[13px] font-bold text-[#141414]" style={{ letterSpacing: "-0.4px" }}>
          {pipelineName}
        </span>

        <div className="flex items-center gap-3 text-[12px] text-[#999] font-medium">
          <span>
            <span className="font-bold text-[#141414]">{totalLeads}</span> ta lid
          </span>
          <span className="text-[#E0E0E0]">|</span>
          <span>
            <span className="font-bold text-[#141414]">
              {formatNumber(totalAmount)}
            </span>{" "}
            so'm
          </span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5 text-[12px] text-[#999999] font-medium">
          <div className="w-2 h-2 rounded-full bg-[#141414]" />
          CRM-N
        </div>
      </div>

      {/* Kanban columns with drag & drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div
          className="flex gap-3 overflow-x-auto pb-4"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "#e0e0e0 transparent",
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
                          <span className="text-[13px] font-bold text-[#141414]" style={{ letterSpacing: "-0.4px" }}>
                            {stage.name}
                          </span>
                        </div>
                        <span className="inline-flex px-1.5 py-0.5 rounded-[4px] text-[11px] font-bold bg-[#f5f5f5] text-[#666]">
                          {stageLeads.length}
                        </span>
                      </div>
                      {stageTotal > 0 && (
                        <span className="text-[11px] text-[#999] font-medium pl-4">
                          {formatNumber(stageTotal)} so'm
                        </span>
                      )}
                    </div>

                    {/* Cards area */}
                    <div className="relative flex-1 min-h-0">
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex flex-col gap-2 h-full overflow-y-auto py-1 px-1 transition-colors rounded-[8px] ${
                          snapshot.isDraggingOver ? "bg-[#f0f7ff]" : ""
                        }`}
                        style={{
                          scrollbarWidth: "thin",
                          scrollbarColor: "#e0e0e0 transparent",
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
                            className="flex items-center justify-center gap-1.5 py-3 border border-dashed border-[#D0D0D0] rounded-[10px] text-[12px] font-medium text-[#999] hover:border-[#999] hover:text-[#666] transition-colors shrink-0"
                          >
                            <Plus size={14} weight="bold" />
                            Lid qo'shish
                          </button>
                        )}
                      </div>

                      {/* Bottom fade gradient */}
                      <div
                        className="absolute bottom-0 left-0 right-0 h-[60px] pointer-events-none z-[1]"
                        style={{
                          background: "linear-gradient(to bottom, transparent, var(--main-bg))",
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
