import { useState } from "react"
import {
  CalendarBlank,
  MapPin,
  PencilSimple,
  Trash,
  UsersThree,
  UserCircle,
  Plus,
  Export,
  CaretDown,
  BookOpen,
  IdentificationBadge,
  Signpost,
  DotsThree,
  Phone,
} from "@phosphor-icons/react"
import { type Event, type Participant } from "@/lib/supabase/queries/events"
import { useParticipants, useDeleteParticipant } from "@/hooks/useEvents"
import { useUsers } from "@/hooks/useUsers"
import { EnrollParticipantModal } from "@/components/events/EnrollParticipantModal"
import { StickerExportModal } from "@/components/events/StickerExportModal"
import { SignExportModal } from "@/components/events/SignExportModal"
import { Popover } from "@/components/vazifalar/pickers"
import { formatDate, formatPhone } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"
import { Pager, usePaged } from "@/components/ui/Pager"
import { toast } from "@/lib/toast"
import { Sheet } from "@/components/ui/Sheet"
import { Fab } from "@/components/ui/Fab"
import { confirmAction } from "@/lib/confirm"

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
}

interface EventOverviewProps {
  event: Event
  onEdit: () => void
  onDelete: () => void
}

export function EventOverview({ event, onEdit, onDelete }: EventOverviewProps) {
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [enrollKey, setEnrollKey] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [stickersOpen, setStickersOpen] = useState(false)
  const [signsOpen, setSignsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [rowFor, setRowFor] = useState<Participant | null>(null)

  const { data: participants = [], isLoading } = useParticipants(event.id)
  const deleteParticipant = useDeleteParticipant(event.id)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const { data: users = [] } = useUsers()
  const manager = users.find((u) => u.id === event.manager_id) ?? null

  const paged = usePaged(participants)
  const existingContactIds = new Set(participants.map((p) => p.contact_id).filter((id): id is string => !!id))
  // Friendly early stop; the DB (migration 053) refuses the delete anyway.
  const hasPayments = participants.some((p) => p.paid > 0)
  function handleDelete() {
    if (hasPayments) {
      toast.error("Tadbirni o'chirib bo'lmaydi", "Bu tadbirda to'lovlar bor — to'lovlar Moliya orqali bekor qilinadi")
      return
    }
    onDelete()
  }


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

  const manage = (fn: () => void) => { setMenuOpen(false); fn() }
  const menuRow = "w-full min-h-14 px-4 flex items-center gap-3 text-left text-base text-ink border-b border-line last:border-0 active:bg-mute-ghost-hover disabled:opacity-40"
  const circle = "size-10 shrink-0 rounded-full bg-surface flex items-center justify-center"

  return (
    <div className="flex flex-col gap-5">
      {/* Phones and tablets: header card, grouped participant list, Fab */}
      <div className="lg:hidden flex flex-col gap-5">
        <div className="rounded-surface bg-surface-sunken p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink leading-snug pt-1.5">{event.name}</h2>
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Tadbir amallari" aria-haspopup="dialog"
              className="size-10 -mr-1 -mt-1 shrink-0 rounded-full bg-surface flex items-center justify-center text-ink">
              <DotsThree size={22} weight="bold" />
            </button>
          </div>
          <div className="flex flex-col gap-2 text-base text-ink">
            <span className="flex items-center gap-2.5"><CalendarBlank size={18} className="text-ink-muted shrink-0" /><span className="tabular-nums">{dateLabel}</span></span>
            <span className="flex items-center gap-2.5 min-w-0"><MapPin size={18} className="text-ink-muted shrink-0" /><span className="truncate">{event.location || "—"}</span></span>
            <span className="flex items-center gap-2.5 min-w-0">
              <UserCircle size={18} className="text-ink-muted shrink-0" />
              {manager ? <span className="truncate">{manager.full_name}</span> : "—"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink-muted px-1">Ishtirokchilar · {participants.length}</h3>
          {isLoading ? (
            <div className="py-10 flex items-center justify-center"><ThinkingOrb state="searching" size={20} theme="light" /></div>
          ) : participants.length === 0 ? (
            <div className="rounded-surface bg-surface-sunken py-10 flex flex-col items-center gap-2 text-ink-muted">
              <UsersThree size={32} weight="thin" />
              <span className="text-base">Hali ishtirokchi qo'shilmagan</span>
            </div>
          ) : (
            <>
              <div className="rounded-surface bg-surface-sunken overflow-hidden">
                {paged.pageItems.map((p) => (
                  <div key={p.id} className="relative flex items-center border-b border-line last:border-0">
                    <button type="button" onClick={() => setRowFor(p)}
                      className="flex-1 min-w-0 min-h-16 pl-4 py-3 flex items-center gap-3 text-left active:bg-mute-ghost-hover">
                      <span className="size-10 rounded-full overflow-hidden shrink-0 bg-surface flex items-center justify-center">
                        {p.photo_url
                          ? <img src={p.photo_url} alt="" className="w-full h-full object-cover object-top" />
                          : <span className="text-sm font-medium text-ink-muted">{initials(p.full_name)}</span>}
                      </span>
                      <span className="flex-1 min-w-0 flex flex-col">
                        <span className="text-base font-medium text-ink truncate">{p.full_name}</span>
                        <span className="text-sm text-ink-muted truncate">{p.tariff_name ?? "Individual"} · {p.seller_name ?? "—"}</span>
                      </span>
                    </button>
                    {p.phone
                      ? <a href={`tel:${p.phone}`} aria-label={`${p.full_name}: ${formatPhone(p.phone)}`} className={`${circle} mx-3 text-ink`}><Phone size={18} /></a>
                      : <span className="size-10 mx-3 shrink-0" />}
                  </div>
                ))}
              </div>
              <Pager page={paged.page} pageCount={paged.pageCount} total={participants.length} onPage={paged.setPage} />
            </>
          )}
        </div>

        <Fab icon={<Plus size={20} weight="bold" />} label="Ishtirokchi" onClick={() => { setEnrollKey((k) => k + 1); setEnrollOpen(true) }} />

        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Tadbir">
          <div className="flex flex-col gap-4">
            <div className="rounded-surface bg-surface-sunken overflow-hidden">
              <button type="button" disabled={participants.length === 0 || exporting} onClick={() => manage(() => void handleExportBooklet())} className={menuRow}>
                <span className={circle}><BookOpen size={18} /></span>{exporting ? "Tayyorlanmoqda..." : "Booklet export"}
              </button>
              <button type="button" onClick={() => manage(() => setStickersOpen(true))} className={menuRow}>
                <span className={circle}><IdentificationBadge size={18} /></span>Sticker export
              </button>
              <button type="button" onClick={() => manage(() => setSignsOpen(true))} className={menuRow}>
                <span className={circle}><Signpost size={18} /></span>Navigatsiya
              </button>
            </div>
            <div className="rounded-surface bg-surface-sunken overflow-hidden">
              <button type="button" onClick={() => manage(onEdit)} className={menuRow}>
                <span className={circle}><PencilSimple size={18} /></span>Tahrirlash
              </button>
              <button type="button" onClick={() => manage(handleDelete)} className={`${menuRow} text-danger-text`}>
                <span className={`${circle} text-danger-text`}><Trash size={18} /></span>Tadbirni o'chirish
              </button>
            </div>
          </div>
        </Sheet>

        <Sheet open={!!rowFor} onClose={() => setRowFor(null)} title={rowFor?.full_name ?? ""}>
          {rowFor && (
            <div className="flex flex-col gap-4">
              <div className="rounded-surface bg-surface-sunken overflow-hidden">
                <div className="min-h-14 px-4 py-2 flex items-center justify-between gap-4 border-b border-line">
                  <span className="text-sm text-ink-muted">Tarif</span>
                  <span className="text-base text-ink truncate">{rowFor.tariff_name ?? "Individual"}</span>
                </div>
                <div className="min-h-14 px-4 py-2 flex items-center justify-between gap-4">
                  <span className="text-sm text-ink-muted">Sotuvchi</span>
                  <span className="text-base text-ink truncate">{rowFor.seller_name ?? "—"}</span>
                </div>
              </div>
              {rowFor.phone && (
                <a href={`tel:${rowFor.phone}`} className="h-12 rounded-full bg-accent text-ink-on-accent text-base font-semibold flex items-center justify-center gap-2">
                  <Phone size={18} /> {formatPhone(rowFor.phone)}
                </a>
              )}
              <button type="button" disabled={rowFor.paid > 0}
                onClick={async () => {
                  const p = rowFor
                  if (await confirmAction({ title: "Ishtirokchini o'chirish", message: `${p.full_name} tadbirdan o'chirilsinmi?`, confirmLabel: "O'chirish", danger: true })) {
                    deleteParticipant.mutate(p.id)
                    setRowFor(null)
                  }
                }}
                className="h-12 rounded-full bg-danger-soft text-danger-text text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
                <Trash size={18} /> O'chirish
              </button>
              {rowFor.paid > 0 && <p className="text-sm text-ink-muted text-center -mt-2">To'lovi bor — Moliya orqali bekor qilinadi</p>}
            </div>
          )}
        </Sheet>
      </div>

      <div className="hidden lg:contents">
      {/* Event header: name + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 px-1">
        <h2 className="text-lg font-semibold text-ink leading-tight">{event.name}</h2>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 h-control-md rounded-full whitespace-nowrap text-base font-medium text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors"
          >
            <PencilSimple size={16} /> Tahrirlash
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 h-control-md rounded-full whitespace-nowrap text-base font-medium text-danger-text bg-danger-soft hover:bg-danger-soft-hover transition-colors"
          >
            <Trash size={16} /> O'chirish
          </button>
        </div>
      </div>

      {/* Event facts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoCard label="Jami ishtirokchi" icon={<UsersThree size={16} />}>
          <span className="text-2xl font-semibold tabular-nums">{participants.length}</span>
        </InfoCard>
        <InfoCard label="Sana" icon={<CalendarBlank size={16} />}>
          <span className="tabular-nums">{dateLabel}</span>
        </InfoCard>
        <InfoCard label="Joy" icon={<MapPin size={16} />}>{event.location || "—"}</InfoCard>
        <InfoCard label="Mas'ul" icon={<UserCircle size={16} />}>
          {manager ? (
            <span className="flex items-center gap-2 min-w-0">
              {manager.avatar_url ? (
                <img src={manager.avatar_url} alt="" className="size-6 rounded-full object-cover shrink-0" />
              ) : (
                <span className="size-6 rounded-full bg-mute-soft text-ink-muted text-xs font-medium flex items-center justify-center shrink-0">
                  {initials(manager.full_name)}
                </span>
              )}
              <span className="sm:truncate">{manager.full_name}</span>
            </span>
          ) : (
            "—"
          )}
        </InfoCard>
      </div>

      {/* Participants table */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-1">
          <span className="text-base font-bold text-ink whitespace-nowrap">Ishtirokchilar ({participants.length})</span>
          <div className="flex flex-wrap items-center gap-2">
            <Popover width={220} trigger={(open, toggle) => (
              <button onClick={toggle} aria-haspopup="menu" aria-expanded={open} disabled={exporting}
                className="flex items-center gap-2 px-3.5 h-control-md rounded-full whitespace-nowrap bg-mute-soft text-base font-medium text-ink hover:bg-mute-soft-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Export size={16} />
                {exporting ? "Tayyorlanmoqda..." : "Dizayn materiallar"}
                <CaretDown size={12} weight="bold" />
              </button>
            )}>
              {(close) => (
                <div role="menu" className="flex flex-col">
                  <button role="menuitem" disabled={participants.length === 0} onClick={() => { close(); void handleExportBooklet() }}
                    className="flex items-center gap-2.5 h-9 px-2.5 rounded-item text-base text-ink hover:bg-mute-ghost-hover disabled:opacity-40 disabled:pointer-events-none">
                    <BookOpen size={16} /> Booklet export
                  </button>
                  <button role="menuitem" onClick={() => { close(); setStickersOpen(true) }}
                    className="flex items-center gap-2.5 h-9 px-2.5 rounded-item text-base text-ink hover:bg-mute-ghost-hover">
                    <IdentificationBadge size={16} /> Sticker export
                  </button>
                  <button role="menuitem" onClick={() => { close(); setSignsOpen(true) }}
                    className="flex items-center gap-2.5 h-9 px-2.5 rounded-item text-base text-ink hover:bg-mute-ghost-hover">
                    <Signpost size={16} /> Navigatsiya
                  </button>
                </div>
              )}
            </Popover>
            <button
              onClick={() => { setEnrollKey((k) => k + 1); setEnrollOpen(true) }}
              className="flex items-center gap-2 px-4 h-control-md rounded-full whitespace-nowrap bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover transition-colors"
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
          <>
            {/* Two-column list, filled column by column (1–10 left, 11–20 right); no header row */}
            <ul className="xl:columns-2 gap-x-8">
              {paged.pageItems.map((p) => (
                <li key={p.id} className="break-inside-avoid flex items-center gap-2.5 min-h-12 py-1.5 sm:py-0 sm:h-12 border-b border-line text-base">
                  <span className="size-6 rounded-full overflow-hidden shrink-0 bg-mute-soft flex items-center justify-center">
                    {p.photo_url ? (
                      <img src={p.photo_url} alt="" className="w-full h-full object-cover object-top" />
                    ) : (
                      <span className="text-xs font-medium text-ink-muted">{initials(p.full_name)}</span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col sm:contents">
                    <span className="flex-1 min-w-0 truncate text-ink">{p.full_name}</span>
                    <span className="sm:shrink-0 sm:max-w-[40%] min-w-0 truncate text-sm text-ink-muted" title="Tarif · Sotuvchi">
                      {p.tariff_name ?? "Individual"} · {p.seller_name ?? "—"}
                    </span>
                  </span>
                  {confirmingId === p.id ? (
                    <span className="flex items-center gap-2 shrink-0 text-sm">
                      <button
                        onClick={() => { deleteParticipant.mutate(p.id); setConfirmingId(null) }}
                        disabled={deleteParticipant.isPending}
                        className="font-medium text-danger-text hover:text-danger-dark disabled:opacity-50"
                      >
                        O'chirish
                      </button>
                      <button onClick={() => setConfirmingId(null)} className="text-ink-muted hover:text-ink">
                        Bekor
                      </button>
                    </span>
                  ) : (
                    <>
                      <span className="shrink-0 text-sm text-ink-muted tabular-nums">{formatPhone(p.phone)}</span>
                      <button
                        onClick={() => setConfirmingId(p.id)}
                        disabled={p.paid > 0}
                        title={p.paid > 0 ? "To'lovi bor — Moliya orqali bekor qilinadi" : "O'chirish"}
                        aria-label={p.paid > 0 ? `${p.full_name}: to'lovi bor — o'chirib bo'lmaydi` : `${p.full_name}ni o'chirish`}
                        className="shrink-0 size-9 sm:size-7 flex items-center justify-center rounded-full text-ink-faint hover:text-danger-text hover:bg-danger-soft transition-colors disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <Trash size={16} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <Pager page={paged.page} pageCount={paged.pageCount} total={participants.length} onPage={paged.setPage} />
          </>
        )}
      </div>

      </div>

      {signsOpen && <SignExportModal event={event} onClose={() => setSignsOpen(false)} />}
      {stickersOpen && <StickerExportModal event={event} participants={participants} onClose={() => setStickersOpen(false)} />}
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

function InfoCard({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-surface-sunken rounded-surface p-4 sm:p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm sm:text-base font-medium text-ink-muted">{label}</span>
        <span className="size-8 rounded-control-sm bg-surface flex items-center justify-center text-ink shrink-0">{icon}</span>
      </div>
      <div className="min-h-9 flex items-end text-md font-medium text-ink min-w-0 break-words sm:truncate">{children}</div>
    </div>
  )
}
