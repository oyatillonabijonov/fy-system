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
import { useParticipants, useDeleteParticipant } from "@/hooks/useEvents"
import { useUsers } from "@/hooks/useUsers"
import { EventBanner } from "@/components/events/EventBanner"
import { EnrollParticipantModal } from "@/components/events/EnrollParticipantModal"
import { eventTint } from "@/lib/eventTint"
import { formatDate, formatPhone } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"
import { tbl } from "@/components/ui/table"

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
  const deleteParticipant = useDeleteParticipant(event.id)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
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
        <EventBanner name={event.name} coverImage={event.cover_image} className="h-[160px] rounded-surface">
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 p-5 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-white leading-tight line-clamp-2 drop-shadow">{event.name}</h2>
              <div className="flex items-center gap-1.5 shrink-0">
                <IconBtn onClick={onEdit} title="Tahrirlash"><PencilSimple size={15} /></IconBtn>
                <IconBtn onClick={onDelete} title="O'chirish" danger><Trash size={15} /></IconBtn>
                <IconBtn onClick={() => setBannerOpen(false)} title="Yig'ish" expanded={bannerOpen}><CaretUp size={15} /></IconBtn>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <MetaChip icon={<CalendarBlank size={13} />}>{dateLabel}</MetaChip>
              {event.location && <MetaChip icon={<MapPin size={13} />}>{event.location}</MetaChip>}
              {manager && (
                <MetaChip>
                  <span className="inline-flex items-center gap-1.5">
                    {manager.avatar_url ? (
                      <img src={manager.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-white/30 text-white text-xs font-bold flex items-center justify-center">
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
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-surface border border-line bg-surface">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-3.5 h-3.5 rounded-checkbox shrink-0" style={{ backgroundColor: eventTint(event.name) }} />
            <span className="text-base font-bold text-ink truncate">{event.name}</span>
            <span className="text-sm text-ink-muted whitespace-nowrap hidden sm:inline">· {dateLabel}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <CompactBtn onClick={onEdit} title="Tahrirlash"><PencilSimple size={15} /></CompactBtn>
            <CompactBtn onClick={onDelete} title="O'chirish" danger><Trash size={15} /></CompactBtn>
            <CompactBtn onClick={() => setBannerOpen(true)} title="Ochish" expanded={bannerOpen}><CaretDown size={15} /></CompactBtn>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="bg-surface border border-line rounded-surface p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-ink-muted">
            <UsersThree size={15} /> Ro'yxatdan o'tish
          </span>
          <span className="text-md font-bold text-ink tabular-nums">{participants.length}</span>
        </div>
        <div className="h-[110px]">
          {regData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-ink-faint">Hali ishtirokchi yo'q</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--ds-color-border-default)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--ds-color-text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--ds-color-text-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "var(--ds-color-surface-sunken)" }} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--ds-color-border-default)" }} />
                <Bar dataKey="count" name="Ro'yxat" fill="var(--ds-color-accent-default)" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Participants table */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-base font-bold text-ink">Ishtirokchilar ({participants.length})</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportBooklet}
              disabled={exporting || participants.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-control text-sm font-semibold border border-line text-ink-muted hover:bg-mute-ghost-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Export size={14} />
              {exporting ? "Tayyorlanmoqda..." : "Booklet export"}
            </button>
            <button
              onClick={() => { setEnrollKey((k) => k + 1); setEnrollOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-control text-sm font-bold bg-accent text-ink-on-accent hover:bg-accent-hover transition-colors"
            >
              <Plus size={14} />
              Ishtirokchi qo'shish
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <ThinkingOrb state="searching" size={20} theme="light" />
          </div>
        ) : participants.length === 0 ? (
          <div className="py-10 text-center text-base text-ink-muted">Hali ishtirokchi qo'shilmagan</div>
        ) : (
          <div className={tbl.scroll}>
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th className={tbl.th}>Mijoz</th>
                  <th className={tbl.th}>Telefon</th>
                  <th className={`${tbl.th} text-right`}>Amal</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id} className={tbl.tr}>
                    <td className={tbl.td}>
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-full overflow-hidden flex-shrink-0 bg-mute-soft flex items-center justify-center">
                          {p.photo_url ? (
                            <img src={p.photo_url} alt="" className="w-full h-full object-cover object-top" />
                          ) : (
                            <span className="text-sm font-medium text-ink-muted">{initials(p.full_name)}</span>
                          )}
                        </div>
                        <span className="font-medium whitespace-nowrap">{p.full_name}</span>
                      </div>
                    </td>
                    <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{formatPhone(p.phone)}</td>
                    <td className={`${tbl.td} text-right whitespace-nowrap`}>
                      {confirmingId === p.id ? (
                        <span className="inline-flex items-center gap-2">
                          {p.paid > 0 && (
                            <span className="text-xs font-bold text-danger-text">To'lovlar ham o'chadi!</span>
                          )}
                          <button
                            onClick={() => { deleteParticipant.mutate(p.id); setConfirmingId(null) }}
                            disabled={deleteParticipant.isPending}
                            className="text-xs font-bold text-danger-text hover:text-danger-dark disabled:opacity-50"
                          >
                            O'chirish
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="text-xs font-medium text-ink-muted hover:text-ink"
                          >
                            Bekor
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmingId(p.id)}
                          title="O'chirish"
                          aria-label="O'chirish"
                          className="text-ink-faint hover:text-danger-text transition-colors"
                        >
                          <Trash size={15} />
                        </button>
                      )}
                    </td>
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

function IconBtn({
  children,
  onClick,
  title,
  danger,
  expanded,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
  expanded?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-expanded={expanded}
      className={`p-1.5 rounded-item bg-surface-raised/90 hover:bg-surface-raised transition-colors ${danger ? "text-danger-text" : "text-ink"}`}
    >
      {children}
    </button>
  )
}

function CompactBtn({
  children,
  onClick,
  title,
  danger,
  expanded,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
  expanded?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-expanded={expanded}
      className={`p-1.5 rounded-item hover:bg-mute-ghost-hover transition-colors ${danger ? "text-danger-text" : "text-ink-muted"}`}
    >
      {children}
    </button>
  )
}

function MetaChip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-item bg-white/20 backdrop-blur-sm text-xs font-medium text-white">
      {icon}
      {children}
    </span>
  )
}
