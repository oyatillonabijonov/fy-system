import { useState } from "react"
import {
  MagnifyingGlass,
  ClockCounterClockwise,
  User,
  ChartLine,
} from "@phosphor-icons/react"
import { formatDate } from "@/lib/format"
import { useActivityLogs, useActivityStats } from "@/hooks/useActivity"
import { useUsers } from "@/hooks/useUsers"
import type {
  ActivityLog,
  ActivityFilters,
  ActivityAction,
  ActivityEntityType,
} from "@/lib/supabase/queries/activity"
import type { StatusVariant } from "@/lib/constants/theme"
import { StatusBadge } from "@/components/ui/StatusBadge"

const ENTITY_LABELS: Record<ActivityEntityType, string> = {
  client: "Mijoz",
  event: "Tadbir",
  participant: "Ishtirokchi",
  profile: "Hodim",
  permission: "Ruxsat",
  kpi: "KPI",
  cashback: "Cashback",
}

const ENTITY_COLORS: Record<ActivityEntityType, string> = {
  client: "#3B82F6",
  event: "#EC4899",
  participant: "#8B5CF6",
  profile: "#10B981",
  permission: "#F59E0B",
  kpi: "#06B6D4",
  cashback: "#10B981",
}

const ACTION_LABELS: Record<ActivityAction, string> = {
  created: "yaratdi",
  updated: "tahrirladi",
  deleted: "o'chirdi",
}

const ACTION_VARIANTS: Record<ActivityAction, StatusVariant> = {
  created: 'success',
  updated: 'info',
  deleted: 'danger',
}

const PAGE_LIMIT = 50

export function Faollik() {
  const [filters, setFilters] = useState<ActivityFilters>({})
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState("")

  const { data: logsData, isLoading } = useActivityLogs(filters, page, PAGE_LIMIT)
  const { data: stats } = useActivityStats()
  const { data: users = [] } = useUsers()

  const items = logsData?.items ?? []
  const total = logsData?.total ?? 0
  const hasMore = logsData?.has_more ?? false

  const grouped = groupByDate(items)

  function applySearch() {
    setFilters({ ...filters, search: searchInput || undefined })
    setPage(0)
  }

  function clearFilters() {
    setFilters({})
    setSearchInput("")
    setPage(0)
  }

  const hasActiveFilters = Boolean(
    filters.search || filters.actor_id || filters.entity_type || filters.action,
  )

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<ClockCounterClockwise size={18} weight="bold" />}
          label="Bugungi amallar"
          value={stats?.total_today.toString() ?? "—"}
        />
        <StatCard
          icon={<ChartLine size={18} weight="bold" />}
          label="Hafta davomida"
          value={stats?.total_week.toString() ?? "—"}
        />
        <StatCard
          icon={<User size={18} weight="bold" />}
          label="Eng faol hodim"
          value={stats?.most_active_user?.name ?? "—"}
          subtitle={stats?.most_active_user ? `${stats.most_active_user.count} ta amal` : undefined}
        />
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <MagnifyingGlass
            size={14}
            weight="bold"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]"
          />
          <input
            type="text"
            placeholder="Qidiring..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applySearch() }}
            onBlur={applySearch}
            className="w-full pl-9 pr-3 py-2 border border-[#E5E5E5] rounded-[8px] text-[13px] focus:border-[#141414] outline-none transition-colors"
          />
        </div>

        <select
          value={filters.actor_id ?? ""}
          onChange={(e) => {
            setFilters({ ...filters, actor_id: e.target.value || undefined })
            setPage(0)
          }}
          className="px-3 py-2 border border-[#E5E5E5] rounded-[8px] text-[12px] text-[#141414] focus:border-[#141414] outline-none transition-colors"
        >
          <option value="">Barcha hodimlar</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name}</option>
          ))}
        </select>

        <select
          value={filters.entity_type ?? ""}
          onChange={(e) => {
            setFilters({
              ...filters,
              entity_type: (e.target.value || undefined) as ActivityEntityType | undefined,
            })
            setPage(0)
          }}
          className="px-3 py-2 border border-[#E5E5E5] rounded-[8px] text-[12px] text-[#141414] focus:border-[#141414] outline-none transition-colors"
        >
          <option value="">Barcha bo'limlar</option>
          {(Object.keys(ENTITY_LABELS) as ActivityEntityType[]).map((k) => (
            <option key={k} value={k}>{ENTITY_LABELS[k]}</option>
          ))}
        </select>

        <select
          value={filters.action ?? ""}
          onChange={(e) => {
            setFilters({
              ...filters,
              action: (e.target.value || undefined) as ActivityAction | undefined,
            })
            setPage(0)
          }}
          className="px-3 py-2 border border-[#E5E5E5] rounded-[8px] text-[12px] text-[#141414] focus:border-[#141414] outline-none transition-colors"
        >
          <option value="">Barcha amallar</option>
          <option value="created">Yaratish</option>
          <option value="updated">Tahrirlash</option>
          <option value="deleted">O'chirish</option>
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-[12px] text-[#666] hover:text-[#141414] transition-colors"
          >
            Tozalash
          </button>
        )}
      </div>

      {/* Activity feed */}
      <div className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-[13px] text-[#999]">Yuklanmoqda...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <ClockCounterClockwise size={32} weight="bold" className="mx-auto text-[#CCC] mb-3" />
            <p className="text-[14px] font-bold text-[#141414] mb-1">Hech narsa topilmadi</p>
            <p className="text-[12px] text-[#999]">
              Filtrni o'zgartiring yoki keyinroq qaytib keling
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F0F0F0]">
            {grouped.map((group) => (
              <div key={group.date}>
                <div className="px-6 py-3 bg-[#FBFBFB] border-b border-[#F0F0F0]">
                  <p className="text-[11px] font-bold text-[#666] uppercase tracking-wide">
                    {group.label}
                  </p>
                </div>
                {group.items.map((log) => <ActivityRow key={log.id} log={log} />)}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!isLoading && total > 0 && (
          <div className="px-6 py-3 border-t border-[#F0F0F0] flex items-center justify-between flex-wrap gap-2">
            <p className="text-[11px] text-[#999]">
              Jami {total} ta amal · {page * PAGE_LIMIT + 1}-{Math.min((page + 1) * PAGE_LIMIT, total)} ko'rsatilmoqda
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-[12px] border border-[#E5E5E5] rounded-[6px] disabled:opacity-40 hover:bg-[#F9F9F8] transition-colors"
              >
                ← Oldingi
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className="px-3 py-1 text-[12px] border border-[#E5E5E5] rounded-[6px] disabled:opacity-40 hover:bg-[#F9F9F8] transition-colors"
              >
                Keyingi →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtitle?: string
}) {
  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[#666]">{icon}</div>
        <span className="text-[12px] text-[#666] font-medium">{label}</span>
      </div>
      <p className="text-[20px] font-bold text-[#141414] mb-1" style={{ letterSpacing: "-0.4px" }}>
        {value}
      </p>
      {subtitle && <p className="text-[11px] text-[#999]">{subtitle}</p>}
    </div>
  )
}

function ActivityRow({ log }: { log: ActivityLog }) {
  const initials = (log.actor_name ?? "S")
    .split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()

  const time = new Date(log.created_at).toLocaleTimeString("uz-UZ", {
    hour: "2-digit",
    minute: "2-digit",
  })

  const entityColor = ENTITY_COLORS[log.entity_type] ?? "#999"
  const entityLabel = ENTITY_LABELS[log.entity_type] ?? log.entity_type

  return (
    <div className="px-6 py-4 hover:bg-[#FBFBFB] transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-[#141414] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[13px] font-bold text-[#141414]">
              {log.actor_name ?? "Tizim"}
            </span>
            <StatusBadge label={ACTION_LABELS[log.action]} variant={ACTION_VARIANTS[log.action]} />
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ backgroundColor: entityColor + "15", color: entityColor }}
            >
              <span className="w-1 h-1 rounded-full" style={{ backgroundColor: entityColor }} />
              {entityLabel}
            </span>
            <span className="text-[11px] text-[#999] ml-auto">{time}</span>
          </div>

          <p className="text-[13px] text-[#666] leading-snug">
            {log.description ?? `${log.entity_type}: ${log.entity_id}`}
          </p>
        </div>
      </div>
    </div>
  )
}

function groupByDate(logs: ActivityLog[]): { date: string; label: string; items: ActivityLog[] }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const groups = new Map<string, ActivityLog[]>()
  for (const log of logs) {
    const d = new Date(log.created_at)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(log)
  }

  return Array.from(groups.entries()).map(([date, items]) => {
    const d = new Date(date)
    let label: string
    if (d.getTime() === today.getTime()) label = "Bugun"
    else if (d.getTime() === yesterday.getTime()) label = "Kecha"
    else label = formatDate(d, 'long')
    return { date, label, items }
  })
}
