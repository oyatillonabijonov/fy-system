import { Draggable, type DroppableProvided } from "@hello-pangea/dnd"
import { Plus } from "@phosphor-icons/react"
import type { Lead, StageConfig } from "@/lib/mock-data/sotuv"
import { getTotalAmount } from "@/lib/mock-data/sotuv"
import { formatNumber } from "@/lib/format"
import { KanbanCard } from "./KanbanCard"

interface PipelineColumnProps {
  config: StageConfig
  leads: Lead[]
  onLeadClick?: (lead: Lead) => void
  droppableProvided?: DroppableProvided
  isDragOver?: boolean
}

export function PipelineColumn({
  config,
  leads,
  onLeadClick,
  droppableProvided,
  isDragOver,
}: PipelineColumnProps) {
  const total = getTotalAmount(leads)
  const isLost = config.color === "text-red-600"
  const isWon = config.color === "text-emerald-700"
  const showAddButton = !isLost && !isWon

  return (
    <div
      className="flex flex-col w-[280px] shrink-0"
      style={{ height: "calc(100vh - 260px)" }}
    >
      {/* Column header — sticky, no scroll */}
      <div className="flex flex-col gap-1 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${config.dot}`} />
            <span className="text-[13px] font-bold text-[#141414]" style={{ letterSpacing: "-0.4px" }}>
              {config.label}
            </span>
          </div>
          <span className="inline-flex px-1.5 py-0.5 rounded-[4px] text-[11px] font-bold bg-[#f5f5f5] text-[#666]">
            {leads.length}
          </span>
        </div>
        {total > 0 && (
          <span className="text-[11px] text-[#999] font-medium pl-4">
            {formatNumber(total)} so'm
          </span>
        )}
      </div>

      {/* Cards area — scrollable with bottom fade */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={droppableProvided?.innerRef}
          {...droppableProvided?.droppableProps}
          className={`flex flex-col gap-2 h-full overflow-y-auto py-1 px-1 transition-colors rounded-[8px] ${
            isDragOver ? "bg-[#f0f7ff]" : ""
          }`}
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "#e0e0e0 transparent",
          }}
        >
          {leads.map((lead, index) =>
            droppableProvided ? (
              <Draggable key={lead.id} draggableId={lead.id} index={index}>
                {(dragProvided) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                  >
                    <KanbanCard lead={lead} isLost={isLost} onClick={onLeadClick} />
                  </div>
                )}
              </Draggable>
            ) : (
              <KanbanCard key={lead.id} lead={lead} isLost={isLost} onClick={onLeadClick} />
            )
          )}

          {droppableProvided?.placeholder}

          {/* Add card button */}
          {showAddButton && (
            <button className="flex items-center justify-center gap-1.5 py-3 border border-dashed border-[#D0D0D0] rounded-[10px] text-[12px] font-medium text-[#999] hover:border-[#999] hover:text-[#666] transition-colors shrink-0">
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
  )
}
