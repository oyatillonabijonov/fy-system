import { useMemo } from "react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"
import {
  CalendarBlank,
  MapPin,
  ArrowSquareOut,
  PencilSimple,
  Trash,
  UsersThree,
  TrendUp,
} from "@phosphor-icons/react"
import { type Event } from "@/lib/supabase/queries/events"
import { useParticipants } from "@/hooks/useEvents"
import { useUsers } from "@/hooks/useUsers"
import { EventBanner } from "@/components/events/EventBanner"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { formatMoney, formatDate, formatPhone } from "@/lib/format"

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
}

interface EventOverviewProps {
  event: Event
  onOpenFull: () => void
  onEdit: () => void
  onDelete: () => void
}

export function EventOverview({ event, onOpenFull, onEdit, onDelete }: EventOverviewProps) {
  const { data: participants = [], isLoading } = useParticipants(event.id)
  const { data: users = [] } = useUsers()
  const manager = users.find((u) => u.id === event.manager_id) ?? null

  const totalPaid = useMemo(
    () => participants.reduce((sum, p) => sum + (p.paid ?? 0), 0),
    [participants],
  )

  const valuePct = event.total_value > 0 ? Math.round((totalPaid / event.total_value) * 100) : null

  // Registrations grouped by day
  const regData = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const p of participants) {
      const day = (p.created_at ?? "").slice(0, 10)
      if (!day) continue
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, count]) => ({ day: day.slice(5), count }))
  }, [participants])

  const dateLabel = event.date
    ? event.end_date
      ? `${formatDate(event.date)} — ${formatDate(event.end_date)}`
      : formatDate(event.date)
    : "Sana belgilanmagan"

  return (
    <div className="flex flex-col gap-5">
      {/* Banner header */}
      <EventBanner name={event.name} coverImage={event.cover_image} className="h-[160px] rounded-[12px]">
        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-0 p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[20px] font-bold text-white leading-tight line-clamp-2 drop-shadow">
              {event.name}
            </h2>
            <div className="flex items-center gap-1.5 shrink-0">
              <IconBtn onClick={onOpenFull} title="To'liq boshqaruv">
                <ArrowSquareOut size={15} weight="bold" />
              </IconBtn>
              <IconBtn onClick={onEdit} title="Tahrirlash">
                <PencilSimple size={15} weight="bold" />
              </IconBtn>
              <IconBtn onClick={onDelete} title="O'chirish" danger>
                <Trash size={15} weight="bold" />
              </IconBtn>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MetaChip icon={<CalendarBlank size={13} weight="bold" />}>{dateLabel}</MetaChip>
            {event.location && <MetaChip icon={<MapPin size={13} weight="bold" />}>{event.location}</MetaChip>}
            <MetaChip>{`Keshbek: ${event.cashback_percent ?? 0}%`}</MetaChip>
            {manager && (
              <MetaChip>
                <span className="inline-flex items-center gap-1.5">
                  {manager.avatar_url ? (
                    <img src={manager.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-white/30 text-white text-[8px] font-bold flex items-center justify-center">
                      {initials(manager.full_name)}
                    </span>
                  )}
                  {manager.full_name}
                </span>
              </MetaChip>
            )}
          </div>
        </div>
      </EventBanner>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1 — registrations */}
        <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[12px] font-bold text-[#999]">
              <UsersThree size={15} weight="bold" /> Ro'yxatdan o'tish
            </span>
            <span className="text-[18px] font-bold text-[#141414]">{participants.length}</span>
          </div>
          <div className="h-[110px]">
            {regData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[12px] text-[#CCC]">
                Hali ishtirokchi yo'q
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#999" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#999" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "#F5F5F5" }}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #F0F0F0" }}
                  />
                  <Bar dataKey="count" name="Ro'yxat" fill="#141414" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Card 2 — value progress */}
        <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-4 flex flex-col gap-3">
          <span className="flex items-center gap-2 text-[12px] font-bold text-[#999]">
            <TrendUp size={15} weight="bold" /> Qiymat bajarilishi
          </span>
          {valuePct === null ? (
            <div className="flex-1 flex flex-col gap-2 justify-center">
              <span className="text-[15px] font-bold text-[#141414]">{formatMoney(totalPaid)}</span>
              <span className="text-[12px] text-[#999]">Qiymat belgilanmagan</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-end justify-between">
                <span className="text-[28px] font-bold text-[#141414] leading-none">{valuePct}%</span>
                <span className="text-[12px] text-[#999] text-right">
                  {formatMoney(totalPaid)}<br />/ {formatMoney(event.total_value)}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-[#F0F0F0] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#141414]"
                  style={{ width: `${Math.min(valuePct, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Participants table */}
      <div className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#F0F0F0]">
          <span className="text-[13px] font-bold text-[#141414]">Ishtirokchilar ({participants.length})</span>
        </div>
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : participants.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[#999]">Hali ishtirokchi qo'shilmagan</div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] font-bold text-[#999] border-b border-[#F0F0F0]">
                  <th className="px-4 py-2.5 font-bold">Rasmi</th>
                  <th className="px-4 py-2.5 font-bold">Mijoz ismi</th>
                  <th className="px-4 py-2.5 font-bold">Telefon</th>
                  <th className="px-4 py-2.5 font-bold text-right">Jami to'lanishi kerak</th>
                  <th className="px-4 py-2.5 font-bold text-right">Hozirgacha to'langan</th>
                  <th className="px-4 py-2.5 font-bold text-right">Qolayotgan qarzdorlik</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => {
                  const debt = (p.price ?? 0) - (p.paid ?? 0)
                  return (
                    <tr key={p.id} className="border-b border-[#F7F7F7] last:border-0 hover:bg-[#FBFBFB] transition-colors">
                      <td className="px-4 py-2.5">
                        {p.photo_url ? (
                          <img src={p.photo_url} alt={p.full_name} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-[#EBEBEB] text-[#666] text-[11px] font-bold flex items-center justify-center">
                            {initials(p.full_name)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] font-medium text-[#141414]">{p.full_name}</td>
                      <td className="px-4 py-2.5 text-[13px] text-[#666]">{formatPhone(p.phone)}</td>
                      <td className="px-4 py-2.5 text-[13px] text-[#141414] text-right">{formatMoney(p.price)}</td>
                      <td className="px-4 py-2.5 text-[13px] text-[#141414] text-right">{formatMoney(p.paid)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {debt <= 0 ? (
                          <span className="inline-flex justify-end">
                            <StatusBadge label="To'langan" variant="success" dot />
                          </span>
                        ) : (
                          <span className="text-[13px] font-bold" style={{ color: "#D13328" }}>
                            {formatMoney(debt)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-[6px] bg-white/90 hover:bg-white transition-colors ${
        danger ? "text-[#D13328]" : "text-[#141414]"
      }`}
    >
      {children}
    </button>
  )
}

function MetaChip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-white/20 backdrop-blur-sm text-[11px] font-medium text-white">
      {icon}
      {children}
    </span>
  )
}
