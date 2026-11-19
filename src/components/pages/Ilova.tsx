// Ilova — the FY members' app from the ERP side (105/106; variant A "Boshqaruv markazi", chosen 2026-11-19):
// four numbers, the app's sign-ups over 30 days, every event with its show/hide switch and push status,
// and the announcements sent. Sign-ups come from the app through amo-sync (/hooks/fy/overview).
import { useMemo, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Megaphone, Plus, DeviceMobile, CaretRight } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useEvents, EVENTS_KEY } from "@/hooks/useEvents"
import { updateEvent, type Event } from "@/lib/supabase/queries/events"
import { getFyAnnouncements, getFyOverview, getFyPushes, type FyPush, type FyRegistration } from "@/lib/supabase/queries/fyApp"
import { AnnounceSheet, RegistrationsSheet, FY_PUSH_KEY, FY_ANN_KEY, FY_OVERVIEW_KEY } from "@/components/events/FyApp"
import { CreateEventDrawer } from "@/components/events/CreateEventDrawer"
import { Card, Empty } from "@/components/dashboard/pieces"
import { EChartsLineChart, type ChartConfig } from "@/components/evilcharts/charts/echarts-line-chart"
import { Switch } from "@/components/ui/Switch"
import { Sheet } from "@/components/ui/Sheet"
import { Fab } from "@/components/ui/Fab"
import { confirmAction } from "@/lib/confirm"
import { toast } from "@/lib/toast"
import { formatDate, formatNumber } from "@/lib/format"

const DAYS = 30
const SERIES: ChartConfig = {
  registered: { label: "Yozilgan", colors: { light: ["#059669"], dark: ["#34d399"] } },
  applied: { label: "Ariza", colors: { light: ["#4f46e5"], dark: ["#818cf8"] } },
}

/** Tashkent calendar day of a timestamp */
const tDay = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(0, 10)
const isPast = (e: Event, today: string) => (e.end_date ?? e.date ?? "9999").slice(0, 10) < today

const pill = "flex items-center gap-1.5 px-4 h-control-md rounded-full whitespace-nowrap shrink-0 text-base font-medium transition-colors"

function Kpi({ label, value, note }: { label: string; value: ReactNode; note: ReactNode }) {
  return (
    <div className="bg-surface-sunken rounded-surface p-4 sm:p-5 flex flex-col gap-1 min-w-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-2xl font-semibold text-ink tabular-nums">{value}</span>
      <span className="text-sm text-ink-muted line-clamp-2">{note}</span>
    </div>
  )
}

function PushTag({ e, push }: { e: Event; push: FyPush | undefined }) {
  if (!e.show_in_app) return <span className="px-2 h-6 inline-flex items-center rounded-full text-xs bg-surface text-ink-muted whitespace-nowrap">Yashirin</span>
  if (push?.status === "failed") return <span title={push.response ?? ""} className="px-2 h-6 inline-flex items-center rounded-full text-xs bg-danger-soft text-danger-text whitespace-nowrap">Yuborilmadi</span>
  if (push?.status === "sent") return <span className="px-2 h-6 inline-flex items-center rounded-full text-xs bg-success-soft text-success-text whitespace-nowrap">Ilovada</span>
  return <span className="px-2 h-6 inline-flex items-center rounded-full text-xs bg-warning-soft text-warning-text whitespace-nowrap">Yuborilmoqda</span>
}

export function Ilova() {
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const { data: events = [] } = useEvents()
  const { data: overview, isLoading: loadingOverview, error: overviewError } = useQuery({ queryKey: FY_OVERVIEW_KEY, queryFn: getFyOverview, refetchOnMount: true })
  const { data: pushes = {} } = useQuery({
    queryKey: [...FY_PUSH_KEY, "all"], queryFn: getFyPushes,
    refetchInterval: (q) => (Object.values(q.state.data ?? {}).some((p) => p.status === "pending") ? 10_000 : false),
  })
  const { data: announcements = [] } = useQuery({ queryKey: FY_ANN_KEY, queryFn: getFyAnnouncements })

  const [listFor, setListFor] = useState<Event | null>(null)
  const [announceOpen, setAnnounceOpen] = useState(false)
  const [pickOpen, setPickOpen] = useState(false)
  const [editing, setEditing] = useState<{ event: Event; forApp: boolean } | null>(null)

  // the page's "now", fixed when it opens (render stays pure)
  const [now] = useState(() => Date.now())
  const today = tDay(new Date(now).toISOString())
  const shown = events.filter((e) => e.show_in_app)
  const regs: FyRegistration[] = useMemo(() => Object.values(overview?.registrations ?? {}).flatMap((r) => r ?? []), [overview])
  const registered = regs.filter((r) => r.status === "registered").length
  const applied = regs.length - registered
  const week = regs.filter((r) => now - new Date(r.createdAt).getTime() < 7 * 86_400_000).length

  const daily = useMemo(() => {
    const rows = Array.from({ length: DAYS }, (_, i) => {
      const day = tDay(new Date(now - (DAYS - 1 - i) * 86_400_000).toISOString())
      return { day, x: `${day.slice(8, 10)}.${day.slice(5, 7)}`, registered: 0, applied: 0 }
    })
    const at = new Map(rows.map((r) => [r.day, r]))
    for (const r of regs) { const row = at.get(tDay(r.createdAt)); if (row) row[r.status]++ }
    return rows
  }, [regs, now])

  // Upcoming first (soonest on top), then the past ones, latest first
  const list = [
    ...events.filter((e) => !isPast(e, today)).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
    ...events.filter((e) => isPast(e, today)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
  ]
  const hiddenUpcoming = list.filter((e) => !e.show_in_app && !isPast(e, today))

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: EVENTS_KEY })
    void qc.invalidateQueries({ queryKey: FY_PUSH_KEY })
    void qc.invalidateQueries({ queryKey: FY_OVERVIEW_KEY })
  }

  // Showing needs a start hour; without one the form opens with the switch already on
  async function toggle(e: Event, on: boolean) {
    if (on && !e.start_time) {
      toast.info("Boshlanish vaqtini kiriting", "Ilova tadbirning soatini ko'rsatadi")
      setEditing({ event: e, forApp: true })
      return
    }
    const ok = await confirmAction(on
      ? { title: "Ilovaga chiqarish", message: `«${e.name}» ilovadagi barcha a'zolarga ko'rinadi. Chiqarilsinmi?`, confirmLabel: "Chiqarish" }
      : { title: "Ilovadan olish", message: `«${e.name}» ilovadan olinadi. Yozilganlar saqlanib qoladi.`, confirmLabel: "Olib tashlash", danger: true })
    if (!ok) return
    try {
      await updateEvent(e.id, { show_in_app: on })
      toast.success(on ? "Ilovaga yuborildi" : "Ilovadan olindi")
      refresh()
    } catch (err) {
      toast.error("Saqlanmadi", err instanceof Error ? err.message : undefined)
    }
  }

  const counts = (id: string) => {
    const r = overview?.registrations[id]
    return r ? { registered: r.filter((x) => x.status === "registered").length, applied: r.filter((x) => x.status === "applied").length } : null
  }

  return (
    <div className="flex flex-col gap-4 pb-10 max-lg:pb-24">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {isAdmin && (
          <button type="button" onClick={() => setAnnounceOpen(true)} className={`${pill} bg-mute-soft text-ink hover:bg-mute-soft-hover`}>
            <Megaphone size={16} /> E'lon
          </button>
        )}
        <button type="button" onClick={() => setPickOpen(true)} className={`${pill} bg-accent text-ink-on-accent hover:bg-accent-hover max-lg:hidden`}>
          <Plus size={16} /> Tadbir chiqarish
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="A'zolar" value={overview?.stats ? formatNumber(overview.stats.members) : "—"}
          note={overview?.stats ? `+${formatNumber(overview.stats.newMembers7d)} oxirgi 7 kunda` : "Ilova statistikasi hali ulanmagan"} />
        <Kpi label="Ilovadagi tadbirlar" value={shown.filter((e) => !isPast(e, today)).length}
          note={hiddenUpcoming.length ? `${hiddenUpcoming.length} ta kelgusi tadbir yashirin` : "Kelgusi tadbirlarning hammasi ilovada"} />
        <Kpi label="Arizalar" value={loadingOverview ? "…" : applied} note="To'lov kutilmoqda" />
        <Kpi label="Yozilganlar" value={loadingOverview ? "…" : registered} note={`${week} ta yangi yozuv oxirgi 7 kunda`} />
      </div>

      <Card title="Ilovadan yozilishlar" aside={`${DAYS} kun · Toshkent vaqti`}>
        {overviewError ? <Empty text={overviewError instanceof Error ? overviewError.message : "Ilova javob bermadi"} />
          : regs.length === 0 && !loadingOverview ? <Empty text="Ilovada hali hech kim yozilmagan" /> : (
          <div style={{ height: 240 }} className="[--background:var(--ds-color-surface-sunken)]">
            <EChartsLineChart data={daily} config={SERIES} xDataKey="x" curveType="monotone" isLoading={loadingOverview} className="h-full w-full">
              <EChartsLineChart.Grid />
              <EChartsLineChart.XAxis />
              <EChartsLineChart.YAxis />
              <EChartsLineChart.Tooltip />
              <EChartsLineChart.Legend align="left" verticalAlign="top" />
              <EChartsLineChart.Line dataKey="registered" />
              <EChartsLineChart.Line dataKey="applied" strokeVariant="dashed" />
            </EChartsLineChart>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3 items-start">
        <Card title="Tadbirlar" aside="Yozilgan / sig'im · ariza">
          {list.length === 0 ? <Empty text="Hali tadbir yo'q" /> : (
            <div className="flex flex-col -my-1">
              {list.map((e) => {
                const c = counts(e.id)
                const past = isPast(e, today)
                return (
                  <div key={e.id} className={`flex items-center gap-3 py-2.5 border-b border-line last:border-0 ${past ? "opacity-60" : ""}`}>
                    <Switch on={e.show_in_app} label={`${e.name}: ilovada ko'rsatish`} onChange={(on) => void toggle(e, on)} />
                    <button type="button" onClick={() => (e.show_in_app ? setListFor(e) : setEditing({ event: e, forApp: false }))} className="flex-1 min-w-0 flex flex-col text-left">
                      <span className="text-base text-ink truncate">{e.name}</span>
                      <span className="text-sm text-ink-muted truncate">
                        {e.date ? formatDate(e.date, "long") : "Sana yo'q"}{e.start_time ? `, ${e.start_time.slice(0, 5)}` : ""}{e.app_category ? ` · ${e.app_category}` : ""}
                      </span>
                    </button>
                    {e.show_in_app && (
                      <span className="text-sm text-ink tabular-nums whitespace-nowrap shrink-0 max-sm:hidden">
                        {c ? <>{c.registered}{e.app_capacity ? ` / ${e.app_capacity}` : ""}<span className="text-ink-muted"> · {c.applied}</span></> : "—"}
                      </span>
                    )}
                    <PushTag e={e} push={pushes[e.id]} />
                    <CaretRight size={16} className="text-ink-faint shrink-0 max-sm:hidden" />
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="So'nggi e'lonlar" aside={isAdmin ? <button type="button" onClick={() => setAnnounceOpen(true)} className="text-sm font-medium text-ink hover:underline">Yangi e'lon</button> : undefined}>
          {announcements.length === 0 ? <Empty text="Hali e'lon yuborilmagan" /> : (
            <div className="flex flex-col -my-1">
              {announcements.map((a) => (
                <div key={a.id} className="py-2.5 border-b border-line last:border-0 flex flex-col gap-0.5">
                  <span className="text-base text-ink line-clamp-2">{a.text}</span>
                  <span className="text-sm text-ink-muted">
                    {formatNumber(a.sent)} kishiga · {formatDate(a.created_at, "long")}{a.author ? ` · ${a.author.full_name}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Fab icon={<Plus size={20} weight="bold" />} label="Chiqarish" onClick={() => setPickOpen(true)} />

      {listFor && <RegistrationsSheet event={listFor} open={!!listFor} onClose={() => setListFor(null)} />}
      <AnnounceSheet open={announceOpen} onClose={() => setAnnounceOpen(false)} />

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title="Qaysi tadbirni chiqaramiz?">
        {hiddenUpcoming.length === 0 ? <Empty text="Kelgusi tadbirlarning hammasi ilovada" /> : (
          <div className="rounded-surface bg-surface-sunken overflow-hidden">
            {hiddenUpcoming.map((e) => (
              <button key={e.id} type="button" onClick={() => { setPickOpen(false); setEditing({ event: e, forApp: true }) }}
                className="w-full min-h-14 px-4 py-2 flex items-center gap-3 text-left border-b border-line last:border-0 hover:bg-mute-ghost-hover">
                <DeviceMobile size={20} className="text-ink-muted shrink-0" />
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-base text-ink truncate">{e.name}</span>
                  <span className="text-sm text-ink-muted">{e.date ? formatDate(e.date, "long") : "Sana yo'q"}</span>
                </span>
                <CaretRight size={16} className="text-ink-faint shrink-0" />
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <CreateEventDrawer isOpen={!!editing} editEvent={editing?.event ?? null} forApp={editing?.forApp} onClose={() => setEditing(null)} onCreated={refresh} />
    </div>
  )
}
