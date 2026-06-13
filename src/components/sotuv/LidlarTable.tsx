import { useState, useMemo } from "react"
import {
  MagnifyingGlass,
  CaretDown,
  ListBullets,
  Columns,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react"
import type { Lead, StageConfig } from "@/lib/mock-data/sotuv"
import { LidCard } from "./LidCard"

interface LidlarTableProps {
  leads: Lead[]
  stageConfigs: Record<string, StageConfig>
  stageOrder: string[]
  onSwitchToPipeline: () => void
  onLeadClick?: (lead: Lead) => void
}

const ITEMS_PER_PAGE = 20

export function LidlarTable({
  leads: allLeads,
  stageConfigs,
  stageOrder,
  onSwitchToPipeline,
  onLeadClick,
}: LidlarTableProps) {
  const [search, setSearch] = useState("")
  const [stageFilter, setStageFilter] = useState<string>("all")
  const [managerFilter, setManagerFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [currentPage, setCurrentPage] = useState(1)

  // Get unique managers
  const managers = useMemo(() => {
    const unique = new Map<string, string>()
    allLeads.forEach((lead) => {
      unique.set(lead.responsible.name, lead.responsible.name)
    })
    return Array.from(unique.values())
  }, [allLeads])

  // Filter leads
  const filteredLeads = useMemo(() => {
    return allLeads.filter((lead) => {
      const matchesSearch =
        search === "" ||
        lead.name.toLowerCase().includes(search.toLowerCase()) ||
        (lead.company?.toLowerCase().includes(search.toLowerCase()) ?? false)

      const matchesStage =
        stageFilter === "all" || lead.stage === stageFilter

      const matchesManager =
        managerFilter === "all" || lead.responsible.name === managerFilter

      const matchesSource =
        sourceFilter === "all" || lead.source === sourceFilter

      return matchesSearch && matchesStage && matchesManager && matchesSource
    })
  }, [allLeads, search, stageFilter, managerFilter, sourceFilter])

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / ITEMS_PER_PAGE))
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const handleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleSelectAll = () => {
    if (selectedIds.length === paginatedLeads.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(paginatedLeads.map((l) => l.id))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative w-[260px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999999]" weight="bold" />
          <input
            type="text"
            placeholder="Ism, kompaniya, telefon..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="w-full bg-white border border-[#E0E0E0] rounded-[8px] py-2 pl-9 pr-3 text-[13px] text-[#141414] placeholder:text-[#999999] focus:outline-none focus:border-[#141414] transition-colors"
          />
        </div>

        {/* Stage filter */}
        <div className="relative">
          <select
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="appearance-none bg-white border border-[#E0E0E0] rounded-[8px] py-2 pl-3 pr-8 text-[13px] font-medium text-[#141414] focus:outline-none focus:border-[#141414] transition-colors cursor-pointer"
          >
            <option value="all">Barcha bosqichlar</option>
            {stageOrder.map((stageId) => {
              const config = stageConfigs[stageId]
              if (!config) return null
              return (
                <option key={stageId} value={stageId}>
                  {config.label}
                </option>
              )
            })}
          </select>
          <CaretDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#999999] pointer-events-none" weight="bold" />
        </div>

        {/* Manager filter */}
        <div className="relative">
          <select
            value={managerFilter}
            onChange={(e) => {
              setManagerFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="appearance-none bg-white border border-[#E0E0E0] rounded-[8px] py-2 pl-3 pr-8 text-[13px] font-medium text-[#141414] focus:outline-none focus:border-[#141414] transition-colors cursor-pointer"
          >
            <option value="all">Barcha menejerlar</option>
            {managers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <CaretDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#999999] pointer-events-none" weight="bold" />
        </div>

        {/* Source filter */}
        <div className="relative">
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="appearance-none bg-white border border-[#E0E0E0] rounded-[8px] py-2 pl-3 pr-8 text-[13px] font-medium text-[#141414] focus:outline-none focus:border-[#141414] transition-colors cursor-pointer"
          >
            <option value="all">Barcha manbalar</option>
            <option value="amocrm">AmoCRM</option>
            <option value="manual">Qo'lda</option>
            <option value="telegram">Telegram bot</option>
          </select>
          <CaretDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#999999] pointer-events-none" weight="bold" />
        </div>

        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex items-center border border-[#E0E0E0] rounded-[8px] overflow-hidden">
          <button className="p-2 bg-[#141414] text-white">
            <ListBullets size={16} weight="bold" />
          </button>
          <button
            onClick={onSwitchToPipeline}
            className="p-2 bg-white text-[#999999] hover:text-[#141414] transition-colors"
          >
            <Columns size={16} weight="bold" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#F0F0F0] rounded-[8px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#FBFBFB] border-b border-[#F0F0F0]">
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={
                      paginatedLeads.length > 0 &&
                      selectedIds.length === paginatedLeads.length
                    }
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded-[4px] border-[#D0D0D0] text-[#141414] focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-bold text-[#999999] uppercase">
                  Ism / Kompaniya
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-bold text-[#999999] uppercase">
                  Bosqich
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-bold text-[#999999] uppercase">
                  Javobgar
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-bold text-[#999999] uppercase">
                  Summa
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-bold text-[#999999] uppercase">
                  Oxirgi qo'ng'iroq
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-bold text-[#999999] uppercase">
                  Manba
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-bold text-[#999999] uppercase">
                  Sana
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedLeads.map((lead) => (
                <LidCard
                  key={lead.id}
                  lead={lead}
                  isSelected={selectedIds.includes(lead.id)}
                  onSelect={handleSelect}
                  stageConfigs={stageConfigs}
                  onClick={onLeadClick}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#F0F0F0]">
          <span className="text-[12px] text-[#999999]">
            {filteredLeads.length} ta liddan{" "}
            {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredLeads.length)}–
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredLeads.length)}{" "}
            ko'rsatilmoqda
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <CaretLeft size={16} className="text-[#141414]" weight="bold" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`min-w-[28px] h-7 rounded-[6px] text-[12px] font-bold transition-colors ${
                  page === currentPage
                    ? "bg-[#141414] text-white"
                    : "text-[#666666] hover:bg-[#F5F5F5]"
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <CaretRight size={16} className="text-[#141414]" weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
