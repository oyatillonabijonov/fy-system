import { useState, useMemo } from "react"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
} from "@tanstack/react-table"
import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/solid"
import type { CrmStage, CrmLeadWithContact } from "@/lib/supabase/queries/crm"
import { deleteCrmLead, updateCrmLeadStage, updateCrmLead } from "@/lib/supabase/queries/crm"
import type { CachedUser } from "@/lib/supabase/queries/amocrm"

interface CrmNLeadsListProps {
  leads: CrmLeadWithContact[]
  stages: CrmStage[]
  users: CachedUser[]
  onLeadClick: (lead: CrmLeadWithContact) => void
  onDataChanged: () => void
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("uz-UZ")
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

const columnHelper = createColumnHelper<CrmLeadWithContact>()

export function CrmNLeadsList({
  leads,
  stages,
  users,
  onLeadClick,
  onDataChanged,
}: CrmNLeadsListProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [stageFilter, setStageFilter] = useState<string>("")
  const [responsibleFilter, setResponsibleFilter] = useState<number>(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<string>("")
  const [bulkActionValue, setBulkActionValue] = useState<string>("")
  const [bulkLoading, setBulkLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(50)

  // Filter leads
  const filteredLeads = useMemo(() => {
    let result = leads

    if (stageFilter) {
      result = result.filter((l) => l.stage_id === stageFilter)
    }

    if (responsibleFilter) {
      result = result.filter((l) => l.responsible_user_id === responsibleFilter)
    }

    return result
  }, [leads, stageFilter, responsibleFilter])

  const columns = useMemo(() => [
    columnHelper.display({
      id: "select",
      header: () => {
        const allSelected = filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.has(l.id))
        return (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => {
              if (allSelected) {
                setSelectedIds(new Set())
              } else {
                setSelectedIds(new Set(filteredLeads.map((l) => l.id)))
              }
            }}
            className="w-4 h-4 rounded accent-[#141414] cursor-pointer"
          />
        )
      },
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.original.id)}
          onChange={(e) => {
            e.stopPropagation()
            setSelectedIds((prev) => {
              const next = new Set(prev)
              if (next.has(row.original.id)) next.delete(row.original.id)
              else next.add(row.original.id)
              return next
            })
          }}
          className="w-4 h-4 rounded accent-[#141414] cursor-pointer"
        />
      ),
      size: 40,
    }),
    columnHelper.accessor((row) => row.crm_contacts?.name ?? row.name, {
      id: "contact_name",
      header: "ISM / KOMPANIYA",
      cell: ({ row }) => {
        const contact = row.original.crm_contacts
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-[#141414] truncate">
              {contact?.name ?? row.original.name}
            </span>
            {contact?.company && (
              <span className="text-[11px] text-[#999] truncate">{contact.company}</span>
            )}
          </div>
        )
      },
      size: 200,
    }),
    columnHelper.accessor("stage_id", {
      header: "BOSQICH",
      cell: ({ row }) => {
        const stage = stages.find((s) => s.id === row.original.stage_id)
        if (!stage) return <span className="text-[#999]">—</span>
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-bold bg-[#f5f5f5] text-[#141414]">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
            {stage.name}
          </span>
        )
      },
      size: 150,
    }),
    columnHelper.accessor("responsible_user_id", {
      header: "MAS'UL",
      cell: ({ row }) => {
        const user = users.find((u) => u.id === row.original.responsible_user_id)
        return (
          <span className="text-[12px] text-[#666]">
            {user?.name ?? "—"}
          </span>
        )
      },
      size: 140,
    }),
    columnHelper.accessor("price", {
      header: "SUMMA",
      cell: ({ row }) => (
        <span className="text-[13px] font-semibold text-[#141414]">
          {row.original.price > 0 ? `${formatAmount(row.original.price)} so'm` : "—"}
        </span>
      ),
      size: 130,
    }),
    columnHelper.accessor("source", {
      header: "MANBA",
      cell: ({ row }) => {
        const label = row.original.source === "telegram" ? "Telegram" : row.original.source === "manual" ? "Qo'lda" : row.original.source
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {label}
          </span>
        )
      },
      size: 100,
    }),
    columnHelper.accessor("created_at", {
      header: "SANA",
      cell: ({ row }) => (
        <span className="text-[12px] text-[#999]">
          {formatDate(row.original.created_at)}
        </span>
      ),
      size: 100,
    }),
  ], [filteredLeads, selectedIds, stages, users])

  const table = useReactTable({
    data: filteredLeads.slice(0, visibleCount),
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const search = filterValue.toLowerCase()
      const contact = row.original.crm_contacts
      return (
        (contact?.name ?? "").toLowerCase().includes(search) ||
        (contact?.phone ?? "").toLowerCase().includes(search) ||
        (contact?.company ?? "").toLowerCase().includes(search) ||
        row.original.name.toLowerCase().includes(search)
      )
    },
  })

  async function handleBulkAction() {
    if (selectedIds.size === 0 || !bulkAction) return
    setBulkLoading(true)

    try {
      const ids = Array.from(selectedIds)
      const BATCH = 10
      const tasks: (() => Promise<unknown>)[] = ids.map((id) => {
        if (bulkAction === "delete") return () => deleteCrmLead(id)
        if (bulkAction === "stage" && bulkActionValue) return () => updateCrmLeadStage(id, bulkActionValue)
        if (bulkAction === "responsible" && bulkActionValue) {
          return () => updateCrmLead(id, { responsible_user_id: Number(bulkActionValue) })
        }
        return async () => undefined
      })

      let failed = 0
      const failedIds = new Set<string>()
      for (let i = 0; i < tasks.length; i += BATCH) {
        const slice = tasks.slice(i, i + BATCH)
        const sliceIds = ids.slice(i, i + BATCH)
        const results = await Promise.allSettled(slice.map((fn) => fn()))
        results.forEach((r, idx) => {
          if (r.status === "rejected") {
            failed++
            failedIds.add(sliceIds[idx])
          }
        })
      }

      // Keep failed selections so the user sees what didn't apply.
      setSelectedIds(failedIds)
      setBulkAction("")
      setBulkActionValue("")
      onDataChanged()

      if (failed > 0) {
        console.warn(`[CRM-N] Bulk action: ${failed}/${ids.length} ta yozuv muvaffaqiyatsiz`)
      }
    } catch (err) {
      console.error("Bulk action xatolik:", err)
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: Search + Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Ism, telefon, kompaniya..."
            className="w-full border border-[#E0E0E0] rounded-[8px] py-2 pl-9 pr-3 text-[13px] text-[#141414] placeholder:text-[#CCC] focus:outline-none focus:border-[#141414] transition-colors"
          />
        </div>

        {/* Stage filter */}
        <div className="relative">
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="appearance-none border border-[#E0E0E0] rounded-[8px] py-2 pl-3 pr-8 text-[12px] font-medium text-[#141414] focus:outline-none focus:border-[#141414] cursor-pointer"
          >
            <option value="">Barcha bosqichlar</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#999] pointer-events-none" />
        </div>

        {/* Responsible filter */}
        <div className="relative">
          <select
            value={responsibleFilter}
            onChange={(e) => setResponsibleFilter(Number(e.target.value))}
            className="appearance-none border border-[#E0E0E0] rounded-[8px] py-2 pl-3 pr-8 text-[12px] font-medium text-[#141414] focus:outline-none focus:border-[#141414] cursor-pointer"
          >
            <option value={0}>Barcha mas'ullar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#999] pointer-events-none" />
        </div>

        <span className="text-[12px] text-[#999] font-medium ml-auto">
          {filteredLeads.length} ta lid
        </span>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-[#FBFBFB] rounded-[8px] px-4 py-2.5 border border-[#E0E0E0]">
          <span className="text-[12px] font-bold text-[#141414]">
            {selectedIds.size} ta tanlandi
          </span>

          <select
            value={bulkAction}
            onChange={(e) => { setBulkAction(e.target.value); setBulkActionValue("") }}
            className="border border-[#E0E0E0] rounded-[6px] py-1 px-2 text-[12px] focus:outline-none focus:border-[#141414]"
          >
            <option value="">Amal tanlang</option>
            <option value="stage">Bosqich o'zgartirish</option>
            <option value="responsible">Mas'ul o'zgartirish</option>
            <option value="delete">O'chirish</option>
          </select>

          {bulkAction === "stage" && (
            <select
              value={bulkActionValue}
              onChange={(e) => setBulkActionValue(e.target.value)}
              className="border border-[#E0E0E0] rounded-[6px] py-1 px-2 text-[12px] focus:outline-none focus:border-[#141414]"
            >
              <option value="">Bosqich tanlang</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          {bulkAction === "responsible" && (
            <select
              value={bulkActionValue}
              onChange={(e) => setBulkActionValue(e.target.value)}
              className="border border-[#E0E0E0] rounded-[6px] py-1 px-2 text-[12px] focus:outline-none focus:border-[#141414]"
            >
              <option value="">Mas'ul tanlang</option>
              {users.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
              ))}
            </select>
          )}

          <button
            onClick={handleBulkAction}
            disabled={bulkLoading || !bulkAction || (bulkAction !== "delete" && !bulkActionValue)}
            className={`px-3 py-1 rounded-[6px] text-[11px] font-bold text-white transition-colors disabled:bg-[#CCC] disabled:cursor-not-allowed ${
              bulkAction === "delete" ? "bg-red-500 hover:bg-red-600" : "bg-[#141414] hover:bg-[#333]"
            }`}
          >
            {bulkLoading ? "..." : bulkAction === "delete" ? "O'chirish" : "Qo'llash"}
          </button>

          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-[11px] text-[#999] hover:text-[#666] ml-auto"
          >
            Bekor qilish
          </button>
        </div>
      )}

      {/* Table */}
      {filteredLeads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="text-[14px] text-[#999] font-medium">Hozircha lidlar yo'q</span>
          <span className="text-[12px] text-[#CCC]">Yangi lid qo'shing</span>
        </div>
      ) : (
        <div className="border border-[#F0F0F0] rounded-[8px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="bg-[#FBFBFB] border-b border-[#F0F0F0]">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="text-left px-4 py-3 text-[11px] font-bold text-[#999] uppercase tracking-wider whitespace-nowrap"
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            className={`flex items-center gap-1 ${header.column.getCanSort() ? "cursor-pointer select-none hover:text-[#666]" : ""}`}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === "asc" && (
                              <ChevronUpIcon className="w-3 h-3" />
                            )}
                            {header.column.getIsSorted() === "desc" && (
                              <ChevronDownIcon className="w-3 h-3" />
                            )}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onLeadClick(row.original)}
                    className="border-b border-[#F0F0F0] hover:bg-[#FBFBFB] cursor-pointer transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-3"
                        onClick={cell.column.id === "select" ? (e) => e.stopPropagation() : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {filteredLeads.length > visibleCount && (
            <div className="flex items-center justify-center py-4 border-t border-[#F0F0F0]">
              <button
                onClick={() => setVisibleCount((v) => v + 50)}
                className="text-[13px] font-bold text-[#141414] hover:text-[#666] transition-colors"
              >
                Ko'proq yuklash ({filteredLeads.length - visibleCount} ta qoldi)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
