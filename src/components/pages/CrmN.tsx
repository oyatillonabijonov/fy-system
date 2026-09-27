import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { formatNumber } from "@/lib/format"
import type { DropResult } from "@hello-pangea/dnd"
import {
  ArrowsClockwise,
  Plus,
  CaretDown,
  Gear,
} from "@phosphor-icons/react"
import {
  subscribeToCrmLeads,
  type CrmLeadWithContact,
} from "@/lib/supabase/queries/crm"
import { useQueryClient } from "@tanstack/react-query"
import {
  useCrmPipelines,
  useCrmUsers,
  useCrmStages,
  useCrmLeads,
  useUpdateCrmLeadStage,
  CRM_PIPELINES_KEY,
  CRM_STAGES_KEY,
  CRM_LEADS_KEY,
} from "@/hooks/useCrmN"
import { CrmNBoard } from "@/components/crm-n/CrmNBoard"
import { CrmNLeadsList } from "@/components/crm-n/CrmNLeadsList"
import { CrmNLeadDrawer } from "@/components/crm-n/CrmNLeadDrawer"
import { CreateCrmLeadModal } from "@/components/crm-n/CreateCrmLeadModal"
import { PipelineSettingsModal } from "@/components/crm-n/PipelineSettingsModal"
import { CreatePipelineModal } from "@/components/crm-n/CreatePipelineModal"
import { Button } from "@/components/ui/button"
import { ThinkingOrb } from "thinking-orbs"

const LAST_CRM_PIPELINE_KEY = "fy_last_crm_pipeline_id"

type CrmNTab = "lidlar" | "pipeline"

export function CrmN() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<CrmNTab>("pipeline")

  const [explicitPipelineId, setExplicitPipelineId] = useState<string | null>(
    () => {
      try { return localStorage.getItem(LAST_CRM_PIPELINE_KEY) } catch { return null }
    }
  )

  const [selectedLead, setSelectedLead] = useState<CrmLeadWithContact | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCreatePipeline, setShowCreatePipeline] = useState(false)

  // ── TanStack Query hooks ──
  const { data: pipelines = [], isLoading: pipelinesLoading } = useCrmPipelines()
  const { data: users = [] } = useCrmUsers()

  // Derived selected id: explicit choice → existing pipeline; otherwise first available.
  // Computing during render avoids the setState-in-effect cascade.
  const selectedPipelineId: string | null =
    (explicitPipelineId && pipelines.find((p) => p.id === explicitPipelineId)?.id) ??
    pipelines[0]?.id ??
    null

  const { data: stages = [], isLoading: stagesLoading } = useCrmStages(selectedPipelineId)
  const { data: leads = [], isLoading: leadsLoading, error: leadsError } = useCrmLeads(selectedPipelineId)
  const updateStageMutation = useUpdateCrmLeadStage(selectedPipelineId)

  const loading = stagesLoading || leadsLoading
  const error = leadsError ? (leadsError instanceof Error ? leadsError.message : "Xatolik yuz berdi") : null

  // ── Realtime ──
  useEffect(() => {
    if (!selectedPipelineId) return

    const unsubscribe = subscribeToCrmLeads(selectedPipelineId, () => {
      qc.invalidateQueries({ queryKey: [...CRM_LEADS_KEY, selectedPipelineId] })
      qc.invalidateQueries({ queryKey: [...CRM_STAGES_KEY, selectedPipelineId] })
    })

    return unsubscribe
  }, [selectedPipelineId, qc])

  // ── Invalidate helpers ──
  function invalidateAll() {
    qc.invalidateQueries({ queryKey: CRM_LEADS_KEY })
    qc.invalidateQueries({ queryKey: CRM_STAGES_KEY })
  }

  function persistPipelineChoice(pipelineId: string | null) {
    try {
      if (pipelineId) localStorage.setItem(LAST_CRM_PIPELINE_KEY, pipelineId)
      else localStorage.removeItem(LAST_CRM_PIPELINE_KEY)
    } catch { /* private mode */ }
    setExplicitPipelineId(pipelineId)
  }

  function handlePipelineChange(pipelineId: string) {
    persistPipelineChoice(pipelineId)
  }

  function handlePipelineCreated(pipelineId: string) {
    qc.invalidateQueries({ queryKey: CRM_PIPELINES_KEY })
    persistPipelineChoice(pipelineId)
  }

  function handlePipelineDeleted() {
    persistPipelineChoice(null)
    qc.invalidateQueries({ queryKey: CRM_PIPELINES_KEY })
  }

  // ── Drag & drop ──
  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    if (result.destination.droppableId === result.source.droppableId) return

    const leadId = result.draggableId
    const newStageId = result.destination.droppableId

    updateStageMutation.mutate({ leadId, stageId: newStageId })
  }

  // ── Stats ──
  const totalLeads = leads.length
  const totalAmount = leads.reduce((s, l) => s + l.price, 0)
  const newLeads = stages.length > 0
    ? leads.filter((l) => l.stage_id === stages[0]?.id).length
    : 0
  const inProgress = stages.length > 2
    ? leads.filter((l) => {
        const idx = stages.findIndex((s) => s.id === l.stage_id)
        return idx > 0 && idx < stages.length - 2
      }).length
    : 0

  const stats = [
    { title: "Jami lidlar", value: String(totalLeads), sub: `${stages.length} bosqichda` },
    { title: "Yangi", value: String(newLeads), sub: "Birinchi bosqich" },
    { title: "Jarayonda", value: String(inProgress), sub: "O'rta bosqichlar" },
    { title: "Umumiy summa", value: formatNumber(totalAmount), sub: "Barcha lidlar", isMoney: true },
  ]

  const [statsOpen, setStatsOpen] = useState(false)
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId)

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-ink">Sotuv bo'limi</h1>

          {/* Pipeline selector */}
          {pipelinesLoading ? (
            <ThinkingOrb state="connecting" size={20} theme="light" />
          ) : pipelines.length > 0 ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={selectedPipelineId ?? ""}
                  onChange={(e) => handlePipelineChange(e.target.value)}
                  className="appearance-none bg-surface border border-line rounded-control py-1.5 pl-3 pr-8 text-base font-medium text-ink focus:outline-none focus:border-line-focus transition-colors cursor-pointer"
                >
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <CaretDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              </div>

              {/* Settings button */}
              {selectedPipelineId && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="p-1.5 rounded-control-sm hover:bg-mute-ghost-hover transition-colors"
                  title="Sozlamalar"
                  aria-label="Sozlamalar"
                >
                  <Gear size={16} className="text-ink-muted" />
                </button>
              )}

              {/* Add pipeline button */}
              <button
                onClick={() => setShowCreatePipeline(true)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-control text-sm font-medium text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors"
              >
                <Plus size={14} />
                Voronka
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreatePipeline(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-control text-sm font-bold text-ink border border-line hover:bg-mute-ghost-hover transition-colors"
            >
              <Plus size={14} />
              Voronka yaratish
            </button>
          )}

          <div className="flex items-center gap-1.5 text-sm text-ink-muted font-medium">
            <div className="w-2 h-2 rounded-full bg-accent" />
            Sotuv bo'limi
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => invalidateAll()}>
            <ArrowsClockwise size={14} className={loading ? "animate-spin" : ""} />
            Yangilash
          </Button>
          <Button size="sm" onClick={() => setShowCreateModal(true)} disabled={!selectedPipelineId}>
            <Plus size={14} />
            Yangi lid
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-line">
        <button
          onClick={() => setActiveTab("lidlar")}
          className={`px-4 py-2.5 text-base font-bold transition-colors relative ${
            activeTab === "lidlar" ? "text-ink" : "text-ink-muted hover:text-ink"
          }`}
        >
          Lidlar ro'yxati
          {activeTab === "lidlar" && (
            <motion.div
              layoutId="crm-n-tab"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab("pipeline")}
          className={`px-4 py-2.5 text-base font-bold transition-colors relative ${
            activeTab === "pipeline" ? "text-ink" : "text-ink-muted hover:text-ink"
          }`}
        >
          Pipeline
          {activeTab === "pipeline" && (
            <motion.div
              layoutId="crm-n-tab"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent"
            />
          )}
        </button>
      </div>

      {/* Stats Toggle */}
      <div className="flex flex-col gap-0">
        <button
          onClick={() => setStatsOpen((v) => !v)}
          className="flex items-center justify-between w-full h-9 px-4 border border-line rounded-control hover:bg-mute-ghost-hover transition-colors cursor-pointer"
        >
          <span className="text-sm font-semibold text-ink-muted uppercase">Statistika</span>
          <motion.div animate={{ rotate: statsOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <CaretDown size={14} className="text-ink-muted" />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {statsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 pt-4">
                {stats.map((stat, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-surface border border-line rounded-surface p-5 flex flex-col gap-3 group transition-all cursor-default"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-base font-medium text-ink-muted">{stat.title}</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-ink">{stat.value}</span>
                        {stat.isMoney && (
                          <span className="text-sm font-bold text-ink-muted">so'm</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-ink-muted">{stat.sub}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Loading / Error / Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <ThinkingOrb state="searching" size={64} theme="light" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <span className="text-base text-danger-text font-medium">{error}</span>
          <button onClick={() => invalidateAll()} className="text-base text-ink font-bold underline">
            Qayta urinish
          </button>
        </div>
      ) : pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="text-base text-ink-muted font-medium">Pipeline topilmadi</span>
          <button
            onClick={() => setShowCreatePipeline(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-control text-base font-bold text-ink-on-accent bg-accent hover:bg-accent-hover transition-colors"
          >
            <Plus size={16} />
            Birinchi voronkani yarating
          </button>
        </div>
      ) : activeTab === "lidlar" ? (
        <CrmNLeadsList
          leads={leads}
          stages={stages}
          users={users}
          onLeadClick={setSelectedLead}
          onDataChanged={() => invalidateAll()}
        />
      ) : (
        <CrmNBoard
          leads={leads}
          stages={stages}
          pipelineName={selectedPipeline?.name ?? ""}
          onLeadClick={setSelectedLead}
          onDragEnd={handleDragEnd}
          onAddLead={() => setShowCreateModal(true)}
        />
      )}

      {/* Drawer */}
      <CrmNLeadDrawer
        lead={selectedLead}
        isOpen={selectedLead !== null}
        onClose={() => setSelectedLead(null)}
        stages={stages}
        pipelineName={selectedPipeline?.name ?? ""}
        users={users}
        onLeadUpdated={() => invalidateAll()}
      />

      {/* Create Lead Modal */}
      {selectedPipelineId && (
        <CreateCrmLeadModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          stages={stages}
          pipelineId={selectedPipelineId}
          users={users}
          onLeadCreated={() => invalidateAll()}
        />
      )}

      {/* Pipeline Settings Modal */}
      {selectedPipelineId && (
        <PipelineSettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          pipelineId={selectedPipelineId}
          pipelineName={selectedPipeline?.name ?? ""}
          stages={stages}
          onUpdated={() => { qc.invalidateQueries({ queryKey: CRM_PIPELINES_KEY }); invalidateAll() }}
          onPipelineDeleted={handlePipelineDeleted}
        />
      )}

      {/* Create Pipeline Modal */}
      <CreatePipelineModal
        isOpen={showCreatePipeline}
        onClose={() => setShowCreatePipeline(false)}
        onCreated={handlePipelineCreated}
      />
    </div>
  )
}
