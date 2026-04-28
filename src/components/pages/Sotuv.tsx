import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { DropResult } from "@hello-pangea/dnd"
import {
  ArrowPathIcon,
  PlusIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/solid"
import {
  formatAmount,
  getTotalAmount,
  buildStageConfigs,
  type Lead,
  type StageConfig,
} from "@/lib/mock-data/sotuv"
import { getAmoLeads } from "@/lib/amocrm/leads"
import { type AmoPipelineInfo } from "@/lib/amocrm/pipelines"
import {
  getCachedLeads,
  getCachedPipelines,
  getCachedUsers,
  subscribeToLeads,
  type CachedLead,
  type CachedPipeline,
  type CachedUser,
} from "@/lib/supabase/queries/amocrm"
import { updateLeadStage } from "@/lib/amocrm/mutations"
import { playNewLeadSound } from "@/lib/sounds/notification"
import { showNewLeadToast, LeadToastContainer } from "@/components/ui/LeadToast"
import { Button } from "@/components/ui/button"
import { LidlarTable } from "@/components/sotuv/LidlarTable"
import { PipelineBoard } from "@/components/sotuv/PipelineBoard"
import { LeadDetailDrawer } from "@/components/sotuv/LeadDetailDrawer"
import { CreateLeadModal } from "@/components/sotuv/CreateLeadModal"

const RESPONSIBLE_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
]

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function mapCachedLeadToLead(cached: CachedLead): Lead {
  const userId = cached.responsible_user_id ?? 0
  const responsibleName = cached.responsible_user_name ?? "—"
  return {
    id: String(cached.id),
    name: cached.contact_name ?? cached.name ?? `Lid #${cached.id}`,
    company: cached.company_name,
    stage: String(cached.status_id),
    responsible: {
      name: responsibleName,
      initials: responsibleName !== "—" ? getInitials(responsibleName) : "—",
      color: RESPONSIBLE_COLORS[userId % RESPONSIBLE_COLORS.length],
    },
    amount: cached.price ?? 0,
    lastCall: { time: "", type: "none" },
    source: "amocrm",
    createdAt: new Date(cached.created_at * 1000).toISOString(),
    amoId: String(cached.id),
    phone: cached.contact_phone ?? undefined,
    contactName: cached.contact_name ?? undefined,
  }
}

function mapCachedPipelineToInfo(cached: CachedPipeline): AmoPipelineInfo {
  const statuses = (cached.statuses ?? [])
    .sort((a, b) => a.sort - b.sort)
    .map((s) => ({
      id: s.id,
      name: s.name,
      sort: s.sort,
      color: s.color,
      type: s.id === 142 ? 142 : s.id === 143 ? 143 : 0,
    }))

  return {
    id: cached.id,
    name: cached.name,
    isMain: false,
    statuses,
  }
}

type SotuvTab = "lidlar" | "pipeline"

interface SotuvProps {
  defaultTab?: SotuvTab
}

const LAST_PIPELINE_KEY = "fy_last_pipeline_id"

// Modul darajasidagi cache — komponent remount bo'lsa ham saqlanadi
const moduleLeadsCache = new Map<number, Lead[]>()
let modulePipelinesCache: AmoPipelineInfo[] | null = null
let moduleUsersCache: CachedUser[] | null = null

export function Sotuv({ defaultTab = "lidlar" }: SotuvProps) {
  const [activeTab, setActiveTab] = useState<SotuvTab>(defaultTab)
  const [leads, setLeads] = useState<Lead[]>(() => {
    const savedId = Number(localStorage.getItem(LAST_PIPELINE_KEY)) || 0
    return moduleLeadsCache.get(savedId) ?? []
  })
  const [loading, setLoading] = useState(() => {
    const savedId = Number(localStorage.getItem(LAST_PIPELINE_KEY)) || 0
    return !moduleLeadsCache.has(savedId)
  })
  const [error, setError] = useState<string | null>(null)

  const [users, setUsers] = useState<CachedUser[]>(moduleUsersCache ?? [])
  const [pipelines, setPipelines] = useState<AmoPipelineInfo[]>(modulePipelinesCache ?? [])
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(() =>
    Number(localStorage.getItem(LAST_PIPELINE_KEY)) || null
  )
  const [pipelinesLoading, setPipelinesLoading] = useState(!modulePipelinesCache)

  // Dynamic stage configs from selected pipeline
  const [stageConfigs, setStageConfigs] = useState<Record<string, StageConfig>>(() => {
    if (modulePipelinesCache) {
      const savedId = Number(localStorage.getItem(LAST_PIPELINE_KEY)) || 0
      const p = modulePipelinesCache.find((pp) => pp.id === savedId) ?? modulePipelinesCache[0]
      if (p) return buildStageConfigs(p.statuses)
    }
    return {}
  })
  const [stageOrder, setStageOrder] = useState<string[]>(() => {
    if (modulePipelinesCache) {
      const savedId = Number(localStorage.getItem(LAST_PIPELINE_KEY)) || 0
      const p = modulePipelinesCache.find((pp) => pp.id === savedId) ?? modulePipelinesCache[0]
      if (p) return p.statuses.map((s) => String(s.id))
    }
    return []
  })

  // leadsCache ref modul cache ga yo'naltirish
  const leadsCache = useRef(moduleLeadsCache)

  useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab])

  // ── PARALLEL FETCH: pipelines + leads bir vaqtda ──
  useEffect(() => {
    // Modul cache da bor bo'lsa — yuklamasdan, faqat background refresh
    if (modulePipelinesCache && moduleLeadsCache.size > 0) {
      // Orqa fonda yangilaymiz
      const targetId = Number(localStorage.getItem(LAST_PIPELINE_KEY)) || null
      if (targetId) {
        getCachedLeads(targetId).then((fresh) => {
          if (fresh.length > 0) {
            const mapped = fresh.map(mapCachedLeadToLead)
            moduleLeadsCache.set(targetId, mapped)
            setLeads(mapped)
          }
        }).catch(() => { /* silent */ })
      }
      return
    }

    let cancelled = false
    const savedPipelineId = Number(localStorage.getItem(LAST_PIPELINE_KEY)) || null

    async function loadAll() {
      try {
        // 1. Pipelines, users va (agar saqlangan ID bor) leads ni PARALLEL yuklash
        const pipelinesPromise = getCachedPipelines()
        const usersPromise = getCachedUsers()
        const leadsPromise = savedPipelineId
          ? getCachedLeads(savedPipelineId)
          : null

        const [cachedPipelines, cachedUsers, cachedLeads] = await Promise.all([
          pipelinesPromise,
          usersPromise,
          leadsPromise,
        ])

        if (cancelled) return

        // 2. Pipelines ni map qilish
        let pipelineData: AmoPipelineInfo[]
        if (cachedPipelines.length > 0) {
          pipelineData = cachedPipelines.map(mapCachedPipelineToInfo)
        } else {
          console.warn("[Sotuv] Pipeline cache bo'sh, API dan olinmoqda")
          const { getAmoPipelines } = await import("@/lib/amocrm/pipelines")
          pipelineData = await getAmoPipelines()
        }

        if (cancelled) return
        modulePipelinesCache = pipelineData
        moduleUsersCache = cachedUsers
        setPipelines(pipelineData)
        setUsers(cachedUsers)
        setPipelinesLoading(false)

        // 3. Pipeline tanlash — saqlangan yoki birinchi
        const targetPipeline = savedPipelineId
          ? pipelineData.find((p) => p.id === savedPipelineId) ?? pipelineData[0]
          : pipelineData.find((p) => p.isMain) ?? pipelineData[0]

        if (!targetPipeline) {
          setLoading(false)
          return
        }

        setSelectedPipelineId(targetPipeline.id)
        setStageConfigs(buildStageConfigs(targetPipeline.statuses))
        setStageOrder(targetPipeline.statuses.map((s) => String(s.id)))
        localStorage.setItem(LAST_PIPELINE_KEY, String(targetPipeline.id))

        // 4. Leads — parallel olingan bo'lsa ishlatamiz, aks holda yuklaymiz
        if (cachedLeads && cachedLeads.length > 0 && targetPipeline.id === savedPipelineId) {
          const mapped = cachedLeads.map(mapCachedLeadToLead)
          leadsCache.current.set(targetPipeline.id, mapped)
          setLeads(mapped)
          setLoading(false)
        } else {
          // Pipeline o'zgardi yoki cache bo'sh — yuklaymiz
          const freshLeads = await getCachedLeads(targetPipeline.id)
          if (cancelled) return

          if (freshLeads.length > 0) {
            const mapped = freshLeads.map(mapCachedLeadToLead)
            leadsCache.current.set(targetPipeline.id, mapped)
            setLeads(mapped)
          } else {
            console.warn("[Sotuv] Leads cache bo'sh, API dan olinmoqda")
            const amoLeads = await getAmoLeads(targetPipeline.id)
            if (cancelled) return
            leadsCache.current.set(targetPipeline.id, amoLeads)
            setLeads(amoLeads)
          }
          setLoading(false)
        }
      } catch (err) {
        if (cancelled) return
        console.error("[Sotuv] Load error:", err)
        setError(err instanceof Error ? err.message : "Ma'lumotlarni yuklashda xatolik")
        setPipelinesLoading(false)
        setLoading(false)
      }
    }

    loadAll()
    return () => { cancelled = true }
  }, [])

  // ── PIPELINE O'ZGARGANDA yoki YANGILASH bosilganda ──
  // forceRefresh=true: cache ni skip qilib Supabase dan yangi ma'lumot oladi
  const fetchLeads = useCallback(async (pipelineId?: number, forceRefresh = false) => {
    const targetId = pipelineId ?? selectedPipelineId
    if (!targetId) {
      setLoading(false)
      return
    }

    // Cache dan ko'rsatish (faqat force bo'lmaganda)
    if (!forceRefresh) {
      const cached = leadsCache.current.get(targetId)
      if (cached) {
        setLeads(cached)
        setLoading(false)
        // Orqa fonda yangilaymiz
        getCachedLeads(targetId).then((fresh) => {
          if (fresh.length > 0) {
            const mapped = fresh.map(mapCachedLeadToLead)
            leadsCache.current.set(targetId, mapped)
            setLeads(mapped)
          }
        }).catch(() => { /* silent refresh */ })
        return
      }
    }

    try {
      setLoading(true)
      setError(null)

      const freshLeads = await getCachedLeads(targetId)

      if (freshLeads.length > 0) {
        const mapped = freshLeads.map(mapCachedLeadToLead)
        leadsCache.current.set(targetId, mapped)
        setLeads(mapped)
      } else {
        console.warn("[Sotuv] Cache bo'sh, API dan olinmoqda")
        const amoLeads = await getAmoLeads(targetId)
        leadsCache.current.set(targetId, amoLeads)
        setLeads(amoLeads)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ma'lumotlarni yuklashda xatolik")
    } finally {
      setLoading(false)
    }
  }, [selectedPipelineId])

  // Realtime subscription — yangilanishlarni avtomatik olish
  useEffect(() => {
    if (!selectedPipelineId) return

    const unsubscribe = subscribeToLeads(
      selectedPipelineId,
      (updatedLeads) => {
        const mapped = updatedLeads.map(mapCachedLeadToLead)
        leadsCache.current.set(selectedPipelineId, mapped)
        setLeads(mapped)
      },
      (newLead) => {
        playNewLeadSound()
        showNewLeadToast(newLead.contact_name ?? newLead.name ?? "Yangi mijoz")
      }
    )

    return unsubscribe
  }, [selectedPipelineId])

  const handlePipelineChange = (pipelineId: number) => {
    setSelectedPipelineId(pipelineId)
    localStorage.setItem(LAST_PIPELINE_KEY, String(pipelineId))
    const pipeline = pipelines.find((p) => p.id === pipelineId)
    if (pipeline) {
      setStageConfigs(buildStageConfigs(pipeline.statuses))
      setStageOrder(pipeline.statuses.map((s) => String(s.id)))
    }
    fetchLeads(pipelineId)
  }

  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) return
    if (result.destination.droppableId === result.source.droppableId) return
    if (!selectedPipelineId) return

    const leadId = Number(result.draggableId)
    const newStatusId = Number(result.destination.droppableId)
    const oldStatusId = Number(result.source.droppableId)

    // Optimistic update
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === String(leadId) ? { ...lead, stage: String(newStatusId) } : lead
      )
    )

    try {
      await updateLeadStage(leadId, newStatusId, selectedPipelineId)
    } catch {
      // Revert on error
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === String(leadId) ? { ...lead, stage: String(oldStatusId) } : lead
        )
      )
    }
  }, [selectedPipelineId])

  const totalLeads = leads.length
  const totalAmount = getTotalAmount(leads)
  // First stage = "new", middle stages = "in progress"
  const firstStage = stageOrder[0]
  const newLeads = firstStage
    ? leads.filter((l) => l.stage === firstStage).length
    : 0
  const inProgress = stageOrder.length > 2
    ? leads.filter((l) => {
        const idx = stageOrder.indexOf(l.stage)
        return idx > 0 && idx < stageOrder.length - 2
      }).length
    : 0

  const stats = [
    {
      title: "Jami lidlar",
      value: totalLeads.toString(),
      sub: `${stageOrder.length} bosqichda`,
      isUp: null,
    },
    {
      title: "Yangi",
      value: newLeads.toString(),
      sub: "Birinchi bosqich",
      isUp: null,
    },
    {
      title: "Jarayonda",
      value: inProgress.toString(),
      sub: "O'rta bosqichlar",
      isUp: null,
    },
    {
      title: "Umumiy summa",
      value: formatAmount(totalAmount),
      sub: "Barcha lidlar",
      isUp: null,
    },
  ]

  const [statsOpen, setStatsOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId)

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      <LeadToastContainer />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-[22px] font-bold text-[#141414]">
            Sotuv bo'limi
          </h1>

          {/* Pipeline selector */}
          {pipelinesLoading ? (
            <div className="w-4 h-4 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
          ) : pipelines.length > 0 ? (
            <div className="relative">
              <select
                value={selectedPipelineId ?? ""}
                onChange={(e) => handlePipelineChange(Number(e.target.value))}
                className="appearance-none bg-white border border-[#E0E0E0] rounded-[8px] py-1.5 pl-3 pr-8 text-[13px] font-medium text-[#141414] focus:outline-none focus:border-[#141414] transition-colors cursor-pointer"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#999999] pointer-events-none" />
            </div>
          ) : null}

          <div className="flex items-center gap-1.5 text-[12px] text-[#999999] font-medium">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            AmoCRM sinxron
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchLeads(undefined, true)}>
            <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Yangilash
          </Button>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <PlusIcon className="w-3.5 h-3.5" />
            Yangi lid
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-[#F0F0F0]">
        <button
          onClick={() => setActiveTab("lidlar")}
          className={`px-4 py-2.5 text-[13px] font-bold transition-colors relative ${
            activeTab === "lidlar"
              ? "text-[#141414]"
              : "text-[#999999] hover:text-[#666666]"
          }`}
        >
          Lidlar ro'yxati
          {activeTab === "lidlar" && (
            <motion.div
              layoutId="sotuv-tab"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#141414]"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab("pipeline")}
          className={`px-4 py-2.5 text-[13px] font-bold transition-colors relative ${
            activeTab === "pipeline"
              ? "text-[#141414]"
              : "text-[#999999] hover:text-[#666666]"
          }`}
        >
          Pipeline
          {activeTab === "pipeline" && (
            <motion.div
              layoutId="sotuv-tab"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#141414]"
            />
          )}
        </button>
      </div>

      {/* Stats Toggle */}
      <div className="flex flex-col gap-0">
        <button
          onClick={() => setStatsOpen((v) => !v)}
          className="flex items-center justify-between w-full h-9 px-4 border border-[#e5e5e5] rounded-[8px] hover:bg-[#f5f5f5] transition-colors cursor-pointer"
        >
          <span className="text-[12px] font-semibold text-[#999] uppercase">
            Statistika
          </span>
          <motion.div
            animate={{ rotate: statsOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDownIcon className="w-3.5 h-3.5 text-[#999]" />
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
                    className="bg-white border border-[#F0F0F0] rounded-[8px] p-5 flex flex-col gap-3 group hover:border-[#141414] transition-all cursor-default"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-[13px] font-medium text-[#999999]">
                        {stat.title}
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[22px] font-bold text-[#141414]">
                          {stat.value}
                        </span>
                        {stat.title === "Umumiy summa" && (
                          <span className="text-[12px] font-bold text-[#999999]">
                            so'm
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {stat.isUp !== null && (
                        <ArrowUpRightIcon className="w-3 h-3 text-green-600" />
                      )}
                      <span
                        className={`text-[11px] font-bold ${stat.isUp !== null ? "text-green-600" : "text-[#999999]"}`}
                      >
                        {stat.sub}
                      </span>
                    </div>
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
          <div className="w-6 h-6 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <span className="text-[14px] text-red-500 font-medium">{error}</span>
          <button
            onClick={() => fetchLeads(undefined, true)}
            className="text-[13px] text-[#141414] font-bold underline"
          >
            Qayta urinish
          </button>
        </div>
      ) : activeTab === "lidlar" ? (
        <LidlarTable
          leads={leads}
          stageConfigs={stageConfigs}
          stageOrder={stageOrder}
          onSwitchToPipeline={() => setActiveTab("pipeline")}
          onLeadClick={setSelectedLead}
        />
      ) : (
        <PipelineBoard
          leads={leads}
          stageConfigs={stageConfigs}
          stageOrder={stageOrder}
          pipelineName={selectedPipeline?.name ?? ""}
          onLeadClick={setSelectedLead}
          onDragEnd={handleDragEnd}
        />
      )}

      {/* Lead Detail Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        isOpen={selectedLead !== null}
        onClose={() => setSelectedLead(null)}
        stageConfigs={stageConfigs}
        pipelineName={selectedPipeline?.name ?? ""}
        pipelineId={selectedPipelineId ?? undefined}
        users={users}
        onLeadUpdated={() => fetchLeads(undefined, true)}
      />

      <CreateLeadModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        pipelines={pipelines}
        selectedPipelineId={selectedPipelineId}
        users={users}
        onLeadCreated={() => fetchLeads(undefined, true)}
      />
    </div>
  )
}
