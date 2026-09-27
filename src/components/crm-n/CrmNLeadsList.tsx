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
  MagnifyingGlass,
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react"
import type { CrmStage, CrmLeadWithContact } from "@/lib/supabase/queries/crm"
import { deleteCrmLead, updateCrmLeadStage, updateCrmLead } from "@/lib/supabase/queries/crm"
import type { CrmUser } from "@/lib/supabase/queries/crm"
import { formatNumber, formatDate } from "@/lib/format"
import { tbl } from "@/components/ui/table"

interface CrmNLeadsListProps {
  leads: CrmLeadWithContact[]
  stages: CrmStage[]
  users: CrmUser[]
  onLeadClick: (lead: CrmLeadWithContact) => void
  onDataChanged: () => void
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
  const [responsibleFilter, setResponsibleFilter] = useState<string>("")
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
            className="w-4 h-4 rounded cursor-pointer"
            style={{ accentColor: "var(--ds-color-accent-default)" }}
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
          className="w-4 h-4 rounded cursor-pointer"
            style={{ accentColor: "var(--ds-color-accent-default)" }}
        />
      ),
      size: 40,
    }),
    columnHelper.accessor((row) => row.crm_contacts?.name ?? row.name, {
      id: "contact_name",
      header: "Ism / kompaniya",
      cell: ({ row }) => {
        const contact = row.original.crm_contacts
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-medium text-ink truncate">
              {contact?.name ?? row.original.name}
            </span>
            {contact?.company && (
              <span className="text-xs text-ink-muted truncate">{contact.company}</span>
            )}
          </div>
        )
      },
      size: 200,
    }),
    columnHelper.accessor("stage_id", {
      header: "Bosqich",
      cell: ({ row }) => {
        const stage = stages.find((s) => s.id === row.original.stage_id)
        if (!stage) return <span className="text-ink-muted">—</span>
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-tag text-xs font-bold bg-surface-sunken text-ink">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
            {stage.name}
          </span>
        )
      },
      size: 150,
    }),
    columnHelper.accessor("responsible_user_id", {
      header: "Mas'ul",
      cell: ({ row }) => {
        const user = users.find((u) => u.id === row.original.responsible_user_id)
        return (
          <span className="text-sm text-ink-muted">
            {user?.name ?? "—"}
          </span>
        )
      },
      size: 140,
    }),
    columnHelper.accessor("price", {
      header: "Summa",
      cell: ({ row }) => (
        <span className="text-base text-ink tabular-nums">
          {row.original.price > 0 ? `${formatNumber(row.original.price)} so'm` : "—"}
        </span>
      ),
      size: 130,
    }),
    columnHelper.accessor("source", {
      header: "Manba",
      cell: ({ row }) => {
        const label = row.original.source === "telegram" ? "Telegram" : row.original.source === "manual" ? "Qo'lda" : row.original.source
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-sunken text-ink">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            {label}
          </span>
        )
      },
      size: 100,
    }),
    columnHelper.accessor("created_at", {
      header: "Sana",
      cell: ({ row }) => (
        <span className="text-sm text-ink-muted">
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
          return () => updateCrmLead(id, { responsible_user_id: bulkActionValue })
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
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Ism, telefon, kompaniya..."
            className="w-full border border-line rounded-control py-2 pl-9 pr-3 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
          />
        </div>

        {/* Stage filter */}
        <div className="relative">
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="appearance-none border border-line rounded-control py-2 pl-3 pr-8 text-sm font-medium text-ink focus:outline-none focus:border-line-focus cursor-pointer"
          >
            <option value="">Barcha bosqichlar</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <CaretDown size={12} weight="bold" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        </div>

        {/* Responsible filter */}
        <div className="relative">
          <select
            value={responsibleFilter}
            onChange={(e) => setResponsibleFilter(e.target.value)}
            className="appearance-none border border-line rounded-control py-2 pl-3 pr-8 text-sm font-medium text-ink focus:outline-none focus:border-line-focus cursor-pointer"
          >
            <option value="">Barcha mas'ullar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <CaretDown size={12} weight="bold" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        </div>

        <span className="text-sm text-ink-muted font-medium ml-auto">
          {filteredLeads.length} ta lid
        </span>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-surface-sunken rounded-surface px-4 py-2.5 border border-line">
          <span className="text-sm font-bold text-ink">
            {selectedIds.size} ta tanlandi
          </span>

          <select
            value={bulkAction}
            onChange={(e) => { setBulkAction(e.target.value); setBulkActionValue("") }}
            className="border border-line rounded-control-sm py-1 px-2 text-sm focus:outline-none focus:border-line-focus"
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
              className="border border-line rounded-control-sm py-1 px-2 text-sm focus:outline-none focus:border-line-focus"
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
              className="border border-line rounded-control-sm py-1 px-2 text-sm focus:outline-none focus:border-line-focus"
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
            className={`px-3 py-1 rounded-control-sm text-xs font-bold transition-colors disabled:bg-mute-soft disabled:cursor-not-allowed ${
              bulkAction === "delete" ? "bg-danger text-white hover:bg-danger" : "bg-accent text-ink-on-accent hover:bg-accent-hover"
            }`}
          >
            {bulkLoading ? "..." : bulkAction === "delete" ? "O'chirish" : "Qo'llash"}
          </button>

          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-ink-muted hover:text-ink ml-auto"
          >
            Bekor qilish
          </button>
        </div>
      )}

      {/* Table */}
      {filteredLeads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="text-base text-ink-muted font-medium">Hozircha lidlar yo'q</span>
          <span className="text-sm text-ink-faint">Yangi lid qo'shing</span>
        </div>
      ) : (
        <div>
          <div className={tbl.scroll}>
            <table className={tbl.table}>
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={tbl.th}
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            type="button"
                            className="flex items-center gap-1 select-none hover:text-ink"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === "asc" && (
                              <CaretUp size={12} weight="bold" />
                            )}
                            {header.column.getIsSorted() === "desc" && (
                              <CaretDown size={12} weight="bold" />
                            )}
                          </button>
                        ) : (
                          <div className="flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
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
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onLeadClick(row.original)
                      }
                    }}
                    className={`${tbl.tr} cursor-pointer`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={tbl.td}
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
            <div className="flex items-center justify-center pt-3">
              <button
                onClick={() => setVisibleCount((v) => v + 50)}
                className="px-4 h-control-sm rounded-control-sm text-sm font-medium text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors"
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
