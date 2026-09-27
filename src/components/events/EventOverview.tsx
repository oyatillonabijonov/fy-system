import { useMemo, useState } from "react"
import {
  CalendarBlank,
  MapPin,
  PencilSimple,
  Trash,
  UsersThree,
  UserPlus,
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

  const { todayCount, weekCount } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    let t = 0
    let w = 0
    for (const p of participants) {
      if (!p.created_at) continue
      if (p.created_at.slice(0, 10) === today) t++
      if (new Date(p.created_at).getTime() >= weekAgo) w++
    }
    return { todayCount: t, weekCount: w }
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
        <EventBanner name={event.name} coverImage={event.cover_image} className="h-[184px] rounded-surface">
          {/* Bottom scrim keeps text legible on photos; barely visible on generated covers */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
          <div className="absolute top-4 right-4 flex items-center gap-1.5">
            <IconBtn onClick={onEdit} title="Tahrirlash"><PencilSimple size={16} /></IconBtn>
            <IconBtn onClick={onDelete} title="O'chirish" danger><Trash size={16} /></IconBtn>
            <IconBtn onClick={() => setBannerOpen(false)} title="Yig'ish" expanded={bannerOpen}><CaretUp size={16} /></IconBtn>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-6 flex flex-col gap-2.5">
            <h2 className="text-xl font-semibold text-white leading-tight line-clamp-2 pr-32">{event.name}</h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-base text-white/80">
              <MetaItem icon={<CalendarBlank size={16} />}>{dateLabel}</MetaItem>
              {event.location && <MetaItem icon={<MapPin size={16} />}>{event.location}</MetaItem>}
              {manager && (
                <MetaItem
                  icon={
                    manager.avatar_url ? (
                      <img src={manager.avatar_url} alt="" className="size-5 rounded-full object-cover" />
                    ) : (
                      <span className="size-5 rounded-full bg-white/20 text-white text-xs font-medium flex items-center justify-center">
                        {initials(manager.full_name)}
                      </span>
                    )
                  }
                >
                  {manager.full_name}
                </MetaItem>
              )}
            </div>
          </div>
        </EventBanner>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-surface border border-line bg-surface">
          <div className="flex items-center gap-2 min-w-0">
            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: eventTint(event.name) }} />
            <span className="text-base font-semibold text-ink truncate">{event.name}</span>
            <span className="text-sm text-ink-muted whitespace-nowrap hidden sm:inline">· {dateLabel}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <CompactBtn onClick={onEdit} title="Tahrirlash"><PencilSimple size={16} /></CompactBtn>
            <CompactBtn onClick={onDelete} title="O'chirish" danger><Trash size={16} /></CompactBtn>
            <CompactBtn onClick={() => setBannerOpen(true)} title="Ochish" expanded={bannerOpen}><CaretDown size={16} /></CompactBtn>
          </div>
        </div>
      )}

      {/* Registration KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Jami ishtirokchi" value={String(participants.length)} icon={<UsersThree size={16} />} />
        <KpiCard label="Bugun" value={`+${todayCount}`} icon={<UserPlus size={16} />} />
        <KpiCard label="Oxirgi 7 kun" value={`+${weekCount}`} icon={<CalendarBlank size={16} />} />
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
              <Export size={16} />
              {exporting ? "Tayyorlanmoqda..." : "Booklet export"}
            </button>
            <button
              onClick={() => { setEnrollKey((k) => k + 1); setEnrollOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-control text-sm font-bold bg-accent text-ink-on-accent hover:bg-accent-hover transition-colors"
            >
              <Plus size={16} />
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
                          <Trash size={16} />
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
      className={`size-8 flex items-center justify-center rounded-full bg-white/15 backdrop-blur-md text-white transition-colors ${danger ? "hover:bg-danger" : "hover:bg-white/25"}`}
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

function MetaItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {icon}
      {children}
    </span>
  )
}

function KpiCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-surface-sunken rounded-surface p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-base font-medium text-ink-muted">{label}</span>
        <span className="size-8 rounded-control-sm bg-surface flex items-center justify-center text-ink">{icon}</span>
      </div>
      <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
    </div>
  )
}
