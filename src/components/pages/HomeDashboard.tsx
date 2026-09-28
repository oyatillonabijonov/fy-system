import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { CalendarBlank, MapPin, Users, UserPlus, ArrowRight } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useEvents, useParticipantCounts } from "@/hooks/useEvents"
import { useClients } from "@/hooks/useClients"
import { formatDate, formatNumber } from "@/lib/format"

/**
 * Dashboard for staff without the `dashboard` module (no AmoCRM sales, no money):
 * upcoming events and client numbers, each shown only with that module's access.
 */
export function HomeDashboard() {
  const { user, hasAccess } = useAuth()
  const events = hasAccess("tadbirlar")
  const clients = hasAccess("mijozlar")

  return (
    <div className="flex flex-col gap-8 pb-10">
      <div className="flex flex-col gap-0.5 px-1">
        <h2 className="text-xl font-semibold text-ink">Salom, {user?.full_name.split(" ")[0]}</h2>
        <p className="text-base text-ink-muted capitalize">{formatDate(new Date(), "long")}</p>
      </div>

      {events && <UpcomingEvents />}
      {clients && <ClientStats />}

      {!events && !clients && (
        <div className="bg-surface-sunken rounded-surface px-6 py-12 text-center">
          <p className="text-base font-semibold text-ink mb-1">Sizga hali bo'limlar ochilmagan</p>
          <p className="text-base text-ink-muted">Kerakli bo'limlarga kirish uchun administratorga murojaat qiling.</p>
        </div>
      )}
    </div>
  )
}

// ─── Upcoming events ────────────────────────────────────────────────────────

const DAY = 86_400_000

function daysLeft(iso: string): string {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const n = Math.round((d.getTime() - today.getTime()) / DAY)
  return n === 0 ? "Bugun" : n === 1 ? "Ertaga" : `${n} kun qoldi`
}

function UpcomingEvents() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useEvents()

  const upcoming = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return data
      .filter((e) => e.date && new Date(e.end_date ?? e.date) >= today)
      .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
      .slice(0, 6)
  }, [data])
  const { data: counts } = useParticipantCounts(upcoming.map((e) => e.id))

  function open(id: string) {
    // Boshqaruv opens the event remembered by useEventTab
    try { localStorage.setItem("fy_last_event_tab", id) } catch { /* private browsing */ }
    navigate("/tadbirlar/boshqaruv")
  }

  return (
    <Section title="Yaqin tadbirlar" desc="Oldinda turgan tadbirlar va ro'yxatdan o'tganlar">
      {isLoading ? (
        <Empty text="Yuklanmoqda…" />
      ) : upcoming.length === 0 ? (
        <Empty text="Rejalashtirilgan tadbir yo'q" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {upcoming.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => open(e.id)}
              className="group text-left bg-surface-sunken hover:bg-surface-sunken-hover rounded-surface p-5 flex flex-col gap-3 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-base font-semibold text-ink line-clamp-2">{e.name}</span>
                <span className="flex-shrink-0 px-2 py-0.5 rounded-item bg-surface text-sm font-medium text-ink whitespace-nowrap">
                  {daysLeft(e.date!)}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
                <span className="flex items-center gap-2"><CalendarBlank size={16} />{formatDate(e.date, "long")}</span>
                {e.location && <span className="flex items-center gap-2 min-w-0"><MapPin size={16} className="flex-shrink-0" /><span className="truncate">{e.location}</span></span>}
                <span className="flex items-center gap-2"><Users size={16} />{counts ? `${formatNumber(counts[e.id] ?? 0)} ta ishtirokchi` : "…"}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Section>
  )
}

// ─── Clients ────────────────────────────────────────────────────────────────

function ClientStats() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useClients()

  const { thisMonth, lastMonth, recent } = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
    const t = (c: { created_at: string }) => new Date(c.created_at).getTime()
    return {
      thisMonth: data.filter((c) => t(c) >= monthStart).length,
      lastMonth: data.filter((c) => t(c) >= prevStart && t(c) < monthStart).length,
      recent: [...data].sort((a, b) => t(b) - t(a)).slice(0, 5),
    }
  }, [data])

  return (
    <Section title="Mijozlar" desc="Klub bazasi va yangi qo'shilganlar">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
          <Stat icon={<Users size={16} />} label="Jami mijozlar" value={isLoading ? "…" : formatNumber(data.length)} />
          <Stat
            icon={<UserPlus size={16} />}
            label="Shu oy qo'shildi"
            value={isLoading ? "…" : formatNumber(thisMonth)}
            hint={isLoading ? undefined : `O'tgan oy: ${formatNumber(lastMonth)}`}
          />
        </div>
        <div className="lg:col-span-2 bg-surface-sunken rounded-surface p-5 flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-ink">Oxirgi qo'shilganlar</h3>
            <button type="button" onClick={() => navigate("/mijozlar")} className="flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors">
              Barchasi <ArrowRight size={16} />
            </button>
          </div>
          {isLoading || recent.length === 0 ? (
            <p className="py-6 text-center text-base text-ink-muted">{isLoading ? "Yuklanmoqda…" : "Hali mijoz yo'q"}</p>
          ) : (
            <div className="flex flex-col">
              {recent.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-line last:border-0 min-w-0">
                  <span className="size-8 rounded-full flex-shrink-0 overflow-hidden bg-surface flex items-center justify-center text-xs font-semibold text-ink-muted">
                    {c.image
                      ? <img src={c.image} alt="" className="w-full h-full object-cover object-top" />
                      : c.full_name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-base text-ink truncate">{c.full_name}</span>
                    {c.activity && <span className="block text-sm text-ink-muted truncate">{c.activity}</span>}
                  </span>
                  <span className="text-sm text-ink-faint tabular-nums flex-shrink-0">{formatDate(c.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}

// ─── Pieces (same look as the AmoCRM Dashboard) ─────────────────────────────

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5 px-1">
        <h2 className="text-md font-semibold text-ink">{title}</h2>
        <p className="text-sm text-ink-muted">{desc}</p>
      </div>
      {children}
    </section>
  )
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface-sunken rounded-surface px-5 py-4 flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-ink-muted">{icon}{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
      {hint && <span className="text-sm text-ink-faint">{hint}</span>}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="bg-surface-sunken rounded-surface py-10 text-center text-base text-ink-muted">{text}</div>
}
