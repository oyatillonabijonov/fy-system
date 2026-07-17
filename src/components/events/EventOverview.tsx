import { useMemo, useState } from "react"
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
  PencilSimple,
  Trash,
  UsersThree,
  CaretUp,
  CaretDown,
  Plus,
  Export,
} from "@phosphor-icons/react"
import { type Event } from "@/lib/supabase/queries/events"
import { useParticipants } from "@/hooks/useEvents"
import { useUsers } from "@/hooks/useUsers"
import { EventBanner } from "@/components/events/EventBanner"
import { EnrollParticipantModal } from "@/components/events/EnrollParticipantModal"
import { eventTint } from "@/lib/eventTint"
import { formatDate, formatPhone } from "@/lib/format"

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
}

interface EventOverviewProps {
  event: Event
  onEdit: () => void
  onDelete: () => void
}

export function EventOverview({ event, onEdit, onDelete }: EventOverviewProps) {
  const [bannerOpen, setBannerOpen] = useState(true)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [enrollKey, setEnrollKey] = useState(0)
  const [exporting, setExporting] = useState(false)

  const { data: participants = [], isLoading } = useParticipants(event.id)
  const { data: users = [] } = useUsers()
  const manager = users.find((u) => u.id === event.manager_id) ?? null

  const existingContactIds = new Set(participants.map((p) => p.contact_id).filter((id): id is string => !!id))

  const regData = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const p of participants) {
      const day = (p.created_at ?? "").slice(0, 10)
      if (!day) continue
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => ({ day: day.slice(5), count }))
  }, [participants])

  const dateLabel = event.date
    ? event.end_date
      ? `${formatDate(event.date)} — ${formatDate(event.end_date)}`
      : formatDate(event.date)
    : "Sana belgilanmagan"

  async function handleExportBooklet() {
    if (participants.length === 0 || exporting) return
    setExporting(true)
    try {
      const { generateBooklet } = await import("@/lib/booklet/generateBooklet")
      await generateBooklet(event, participants)
    } catch (err) {
      console.error("Booklet export xatolik:", err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Banner header (collapsible) */}
      {bannerOpen ? (
        <EventBanner name={event.name} coverImage={event.cover_image} className="h-[160px] rounded-[12px]">
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 p-5 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[20px] font-bold text-white leading-tight line-clamp-2 drop-shadow">{event.name}</h2>
              <div className="flex items-center gap-1.5 shrink-0">
                <IconBtn onClick={onEdit} title="Tahrirlash"><PencilSimple size={15} weight="bold" /></IconBtn>
                <IconBtn onClick={onDelete} title="O'chirish" danger><Trash size={15} weight="bold" /></IconBtn>
                <IconBtn onClick={() => setBannerOpen(false)} title="Yig'ish"><CaretUp size={15} weight="bold" /></IconBtn>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <MetaChip icon={<CalendarBlank size={13} weight="bold" />}>{dateLabel}</MetaChip>
              {event.location && <MetaChip icon={<MapPin size={13} weight="bold" />}>{event.location}</MetaChip>}
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
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-[12px] border border-[#F0F0F0] bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-3.5 h-3.5 rounded-[4px] shrink-0" style={{ backgroundColor: eventTint(event.name) }} />
            <span className="text-[14px] font-bold text-[#141414] truncate">{event.name}</span>
            <span className="text-[12px] text-[#999] whitespace-nowrap hidden sm:inline">· {dateLabel}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <CompactBtn onClick={onEdit} title="Tahrirlash"><PencilSimple size={15} weight="bold" /></CompactBtn>
            <CompactBtn onClick={onDelete} title="O'chirish" danger><Trash size={15} weight="bold" /></CompactBtn>
            <CompactBtn onClick={() => setBannerOpen(true)} title="Ochish"><CaretDown size={15} weight="bold" /></CompactBtn>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[12px] font-bold text-[#999]">
            <UsersThree size={15} weight="bold" /> Ro'yxatdan o'tish
          </span>
          <span className="text-[18px] font-bold text-[#141414]">{participants.length}</span>
        </div>
        <div className="h-[110px]">
          {regData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12px] text-[#CCC]">Hali ishtirokchi yo'q</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#999" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#999" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#F5F5F5" }} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #F0F0F0" }} />
                <Bar dataKey="count" name="Ro'yxat" fill="#141414" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Participants table */}
      <div className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#F0F0F0]">
          <span className="text-[13px] font-bold text-[#141414]">Ishtirokchilar ({participants.length})</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportBooklet}
              disabled={exporting || participants.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold border border-[#E0E0E0] text-[#666] hover:bg-[#F5F5F5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Export size={14} weight="bold" />
              {exporting ? "Tayyorlanmoqda..." : "Booklet export"}
            </button>
            <button
              onClick={() => { setEnrollKey((k) => k + 1); setEnrollOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-bold bg-[#141414] text-white hover:bg-[#333] transition-colors"
            >
              <Plus size={14} weight="bold" />
              Ishtirokchi qo'shish
            </button>
          </div>
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
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
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
                    <td className="px-4 py-2.5 text-[13px] font-medium text-[#141414] whitespace-nowrap">{p.full_name}</td>
                    <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{formatPhone(p.phone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EnrollParticipantModal
        key={`enroll-${enrollKey}`}
        isOpen={enrollOpen}
        eventId={event.id}
        existingContactIds={existingContactIds}
        onClose={() => setEnrollOpen(false)}
        onAdded={() => setEnrollOpen(false)}
      />
    </div>
  )
}

// ── Banner buttons / chips ──────────────────────────────────────────────────────

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} className={`p-1.5 rounded-[6px] bg-white/90 hover:bg-white transition-colors ${danger ? "text-[#D13328]" : "text-[#141414]"}`}>
      {children}
    </button>
  )
}

function CompactBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} className={`p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors ${danger ? "text-[#D13328]" : "text-[#666]"}`}>
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
