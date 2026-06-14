import {
  DragDropContext,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd"
import {
  filterLeadsByStage,
  getTotalAmount,
  type Lead,
  type StageConfig,
} from "@/lib/mock-data/sotuv"
import { formatNumber } from "@/lib/format"
import { PipelineColumn } from "./PipelineColumn"

interface PipelineBoardProps {
  leads: Lead[]
  stageConfigs: Record<string, StageConfig>
  stageOrder: string[]
  pipelineName: string
  onLeadClick?: (lead: Lead) => void
  onDragEnd?: (result: DropResult) => void
}

export function PipelineBoard({
  leads,
  stageConfigs,
  stageOrder,
  pipelineName,
  onLeadClick,
  onDragEnd,
}: PipelineBoardProps) {
  const totalLeads = leads.length
  const totalAmount = getTotalAmount(leads)

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

        <div className="flex items-center gap-2 text-[12px] text-[#999] font-medium">
          <div className="w-2 h-2 rounded-full bg-[#141414]" />
          AmoCRM sinxron
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
          {stageOrder.map((stageId) => {
            const config = stageConfigs[stageId]
            if (!config) return null
            return (
              <Droppable key={stageId} droppableId={stageId}>
                {(provided, snapshot) => (
                  <PipelineColumn
                    config={config}
                    leads={filterLeadsByStage(leads, stageId)}
                    onLeadClick={onLeadClick}
                    droppableProvided={provided}
                    isDragOver={snapshot.isDraggingOver}
                  />
                )}
              </Droppable>
            )
          })}
        </div>
      </DragDropContext>
    </div>
  )
}
