import { useMemo, useState, type ReactNode } from "react"
import {
    Coins,
    Handshake,
    UserPlus,
    Kanban,
    Receipt,
    Timer,
    Hourglass,
    Warning,
    ClipboardText,
    ArrowSquareOut,
    ArrowUp,
    ArrowDown,
    CheckCircle,
} from "@phosphor-icons/react"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { useAmoDashboard } from "@/hooks/useAmoDashboard"
import type { AmoDashboard } from "@/lib/supabase/queries/amoDashboard"
import { Skeleton } from "@/components/ui/Skeleton"
import { tbl } from "@/components/ui/table"
import { formatMoney, formatNumber } from "@/lib/format"

// ─── Period (Asia/Tashkent calendar, UTC+5, no DST) ─────────────────────────

const TZ_OFFSET = 5 * 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

const PERIODS = [
    { id: "today", label: "Bugun" },
    { id: "7d", label: "7 kun" },
    { id: "30d", label: "30 kun" },
    { id: "month", label: "Bu oy" },
    { id: "prev-month", label: "O'tgan oy" },
] as const
type PeriodId = (typeof PERIODS)[number]["id"]

/** [from, to) as ISO; boundaries are whole Tashkent days, so the query key is stable within a day */
function periodRange(id: PeriodId): { from: string; to: string } {
    const wall = new Date(Date.now() + TZ_OFFSET)
    const y = wall.getUTCFullYear()
    const m = wall.getUTCMonth()
    const dayStart = Date.UTC(y, m, wall.getUTCDate()) - TZ_OFFSET
    const iso = (ms: number) => new Date(ms).toISOString()
    switch (id) {
        case "today": return { from: iso(dayStart), to: iso(dayStart + DAY) }
        case "7d": return { from: iso(dayStart - 6 * DAY), to: iso(dayStart + DAY) }
        case "30d": return { from: iso(dayStart - 29 * DAY), to: iso(dayStart + DAY) }
        case "month": return { from: iso(Date.UTC(y, m, 1) - TZ_OFFSET), to: iso(Date.UTC(y, m + 1, 1) - TZ_OFFSET) }
        case "prev-month": return { from: iso(Date.UTC(y, m - 1, 1) - TZ_OFFSET), to: iso(Date.UTC(y, m, 1) - TZ_OFFSET) }
    }
}

// A % change from a tiny base is noise ("3 → 30 = +900%"), so small bases show no delta.
function delta(cur: number, prev: number): number | null {
    return prev >= 5 ? ((cur - prev) / prev) * 100 : null
}

function ago(min: number | null): string {
    if (min === null) return "hali sinxronlanmagan"
    if (min < 1) return "hozirgina yangilandi"
    if (min < 60) return `${min} daqiqa oldin yangilandi`
    const h = Math.round(min / 60)
    return h < 24 ? `${h} soat oldin yangilandi` : `${Math.round(h / 24)} kun oldin yangilandi`
}

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—")

// ─── Page ────────────────────────────────────────────────────────────────────

export function Dashboard() {
    const [period, setPeriod] = useState<PeriodId>("30d")
    const [pipelineId, setPipelineId] = useState<number | null>(null)
    const { from, to } = useMemo(() => periodRange(period), [period])
    const { data, isLoading, error } = useAmoDashboard(from, to, pipelineId)

    const stale = data && (data.synced_minutes_ago === null || data.synced_minutes_ago > 30)

    return (
        <div className="flex flex-col gap-8 pb-10">
            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                    {PERIODS.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => setPeriod(p.id)}
                            aria-pressed={period === p.id}
                            className={`px-3.5 h-control-md rounded-full text-base font-medium transition-colors ${period === p.id ? "bg-mute-soft text-ink" : "text-ink-muted hover:bg-mute-ghost-hover hover:text-ink"}`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-ink-muted">AmoCRM · {ago(data?.synced_minutes_ago ?? null)}</span>
                    <select
                        value={pipelineId ?? ""}
                        onChange={(e) => setPipelineId(e.target.value ? Number(e.target.value) : null)}
                        aria-label="Voronka"
                        className="h-control-md pl-3 pr-8 rounded-control bg-surface-sunken text-base text-ink border border-transparent outline-none focus:border-line-focus"
                    >
                        <option value="">Barcha voronkalar</option>
                        {data?.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
            </div>

            {error && (
                <div className="px-4 py-3 rounded-surface bg-danger-soft text-danger-dark text-base">
                    Ma'lumotni yuklab bo'lmadi: {error.message}
                </div>
            )}
            {(stale || data?.sync_error) && (
                <div className="px-4 py-3 rounded-surface bg-warning-soft text-warning-dark text-base">
                    AmoCRM sinxronizatsiyasi {data?.synced_at ? "30 daqiqadan beri yangilanmagan" : "hali ishlamagan"} — raqamlar eski bo'lishi mumkin.
                    {data?.sync_error ? ` Oxirgi xato: ${data.sync_error}` : ""}
                </div>
            )}

            {isLoading || !data ? <DashboardSkeleton /> : <DashboardBody d={data} pipelineChosen={pipelineId !== null} />}
        </div>
    )
}

function DashboardBody({ d, pipelineChosen }: { d: AmoDashboard; pipelineChosen: boolean }) {
    const k = d.kpi
    const closed = k.won + k.lost
    const avgCheck = k.payers > 0 ? k.revenue / k.payers : null
    const prevAvgCheck = k.prev_payers > 0 ? k.prev_revenue / k.prev_payers : null

    return (
        <>
            {/* ── 1. Biznes holati ─────────────────────────────────────── */}
            <Section title="Biznes holati" desc="Tanlangan davr, oldingi shuncha davrga nisbatan">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <KpiCard
                        label="Daromad" icon={<Coins size={16} />}
                        value={formatMoney(k.revenue)}
                        sub={`${formatNumber(k.payers)} ta to'lovchi · tizimdagi to'lovlar`}
                        delta={delta(k.revenue, k.prev_revenue)}
                    />
                    <KpiCard
                        label="Sotuvlar" icon={<Handshake size={16} />}
                        value={formatNumber(k.won)} unit="ta"
                        sub={closed > 0 ? `konversiya ${pct(k.won, closed)} · ${formatNumber(k.lost)} ta yo'qotildi` : "davrda yopilgan bitim yo'q"}
                        delta={delta(k.won, k.prev_won)}
                    />
                    <KpiCard
                        label="Yangi lidlar" icon={<UserPlus size={16} />}
                        value={formatNumber(k.new_leads)} unit="ta"
                        sub="davrda yaratilgan"
                        delta={delta(k.new_leads, k.prev_new_leads)}
                    />
                    <KpiCard
                        label="Faol bitimlar" icon={<Kanban size={16} />}
                        value={formatNumber(k.active)} unit="ta"
                        sub="hozir ochiq turgan"
                        delta={null}
                    />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <Tile label="O'rtacha chek" icon={<Receipt size={16} />}
                        value={avgCheck === null ? "—" : formatMoney(Math.round(avgCheck))}
                        delta={avgCheck !== null && prevAvgCheck !== null && k.prev_payers >= 5 ? delta(avgCheck, prevAvgCheck) : null} />
                    <Tile label="Sotuv sikli" icon={<Timer size={16} />}
                        value={k.cycle_days === null ? "—" : k.cycle_days < 1 ? "< 1 kun" : `${Math.round(k.cycle_days)} kun`}
                        hint="liddan sotuvgacha, mediana" />
                    <Tile label="Harakatsiz bitimlar" icon={<Hourglass size={16} />}
                        value={formatNumber(k.stale)} hint="14 kundan beri o'zgarmagan" tone={k.stale > 0 ? "warning" : undefined} />
                    <Tile label="Muddati o'tgan vazifa" icon={<Warning size={16} />}
                        value={formatNumber(d.tasks.overdue)} tone={d.tasks.overdue > 0 ? "danger" : undefined} />
                    <Tile label="Vazifasiz bitimlar" icon={<ClipboardText size={16} />}
                        value={formatNumber(d.tasks.no_task)} hint={`${formatNumber(k.active)} ta ochiq bitimdan`} />
                </div>
                {k.bulk_closed > 0 && (
                    <p className="text-sm text-ink-muted px-1">
                        Davrda {formatNumber(k.bulk_closed)} ta lid ommaviy yopilgan (bir daqiqada 10 tadan ortiq) — ular sotuv va konversiyaga kiritilmadi.
                    </p>
                )}
            </Section>

            {/* ── 2. Voronka va voronkalar kesimi ──────────────────────── */}
            <Section title="Sotuv voronkasi" desc="Ochiq bosqichlar — hozirgi holat; yutildi / yo'qotildi — davr ichida">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <Card className="lg:col-span-2">
                        {pipelineChosen ? <Funnel rows={d.funnel} /> : (
                            <div className="h-full min-h-40 flex items-center justify-center text-base text-ink-muted text-center">
                                Bosqichlarni ko'rish uchun yuqoridan voronkani tanlang
                            </div>
                        )}
                    </Card>
                    <Card title="Voronkalar bo'yicha">
                        {d.by_pipeline.length === 0 ? <Empty text="Davrda harakat yo'q" /> : (
                            <div className="flex flex-col">
                                {d.by_pipeline.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-0">
                                        <span className="text-base text-ink truncate">{p.name}</span>
                                        <span className="flex items-center gap-3 text-sm tabular-nums shrink-0">
                                            <span className="text-ink-muted">{formatNumber(p.new_leads)} lid</span>
                                            <span className="text-success-text">{formatNumber(p.won)} sotuv</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </Section>

            {/* ── 3. Dinamika va jamoa ─────────────────────────────────── */}
            <Section title="Dinamika" desc="Kunlik yangi lidlar va sotuvlar">
                <Card>
                    <DailyChart rows={d.daily} />
                </Card>
            </Section>

            <Section title="Jamoa" desc="Mas'ul menejerlar bo'yicha">
                {d.managers.length === 0 ? <Empty text="Davrda menejerlar faoliyati yo'q" /> : (
                    <div className={tbl.scroll}>
                        <table className={tbl.table}>
                            <thead>
                                <tr>
                                    <th className={tbl.th}>Menejer</th>
                                    <th className={`${tbl.th} text-right`}>Yangi lidlar</th>
                                    <th className={`${tbl.th} text-right`}>Faol</th>
                                    <th className={`${tbl.th} text-right`}>Sotuv</th>
                                    <th className={`${tbl.th} text-right`}>Yo'qotildi</th>
                                    <th className={`${tbl.th} text-right`}>Konversiya</th>
                                    <th className={`${tbl.th} text-right`}>Harakatsiz</th>
                                </tr>
                            </thead>
                            <tbody>
                                {d.managers.map((m) => (
                                    <tr key={m.id ?? m.name} className={tbl.tr}>
                                        <td className={`${tbl.td} font-medium`}>{m.name}</td>
                                        <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(m.new_leads)}</td>
                                        <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(m.active)}</td>
                                        <td className={`${tbl.td} text-right tabular-nums text-success-text`}>{formatNumber(m.won)}</td>
                                        <td className={`${tbl.td} text-right tabular-nums text-ink-muted`}>{formatNumber(m.lost)}</td>
                                        <td className={`${tbl.td} text-right tabular-nums`}>{pct(m.won, m.won + m.lost)}</td>
                                        <td className={`${tbl.td} text-right tabular-nums ${m.stale > 0 ? "text-warning-text" : "text-ink-muted"}`}>{formatNumber(m.stale)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            {/* ── 4. E'tibor talab qiladi ──────────────────────────────── */}
            <Section title="E'tibor talab qiladi" desc="Yo'qotish sabablari va eng uzoq harakatsiz turgan bitimlar">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card title="Yo'qotish sabablari">
                        {d.losses.length === 0 ? <Empty text="Davrda yo'qotilgan bitim yo'q" /> : <Losses rows={d.losses} />}
                    </Card>
                    <Card title="Xavfli bitimlar" aside="14+ kun harakatsiz">
                        {d.risky.length === 0 ? <Empty text="Harakatsiz bitim yo'q" /> : (
                            <div className="flex flex-col">
                                {d.risky.map((r) => (
                                    <div key={r.id} className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-base text-ink truncate">{r.name || `#${r.id}`}</div>
                                            <div className="text-sm text-ink-muted truncate">{r.stage} · {r.manager}{r.has_task ? "" : " · vazifa yo'q"}</div>
                                        </div>
                                        <span className="text-sm text-warning-text tabular-nums shrink-0">{r.idle_days} kun</span>
                                        {d.amo_base_url && (
                                            <a
                                                href={`${d.amo_base_url}/leads/detail/${r.id}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                aria-label="AmoCRM'da ochish"
                                                title="AmoCRM'da ochish"
                                                className="size-8 flex items-center justify-center rounded-control-sm text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors shrink-0"
                                            >
                                                <ArrowSquareOut size={16} />
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </Section>
        </>
    )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Section({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
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

function Card({ title, aside, className = "", children }: { title?: string; aside?: string; className?: string; children: ReactNode }) {
    return (
        <div className={`bg-surface-sunken rounded-surface p-5 flex flex-col gap-4 min-w-0 ${className}`}>
            {title && (
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-ink">{title}</h3>
                    {aside && <span className="text-sm text-ink-muted">{aside}</span>}
                </div>
            )}
            {children}
        </div>
    )
}

function Empty({ text }: { text: string }) {
    return <div className="py-8 text-center text-base text-ink-muted">{text}</div>
}

function DeltaBadge({ value }: { value: number | null }) {
    if (value === null || !Number.isFinite(value)) return null
    const flat = Math.abs(value) < 0.5
    return (
        <span className={`inline-flex items-center gap-0.5 px-1.5 h-6 rounded-tag text-sm font-medium tabular-nums ${flat ? "bg-mute-soft text-mute-dark" : value > 0 ? "bg-success-soft text-success-dark" : "bg-danger-soft text-danger-dark"}`}>
            {!flat && (value > 0 ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />)}
            {Math.abs(value).toFixed(0)}%
        </span>
    )
}

function KpiCard({ label, icon, value, unit, sub, delta: d }: { label: string; icon: ReactNode; value: string; unit?: string; sub: string; delta: number | null }) {
    return (
        <div className="bg-surface-sunken rounded-surface p-5 flex flex-col gap-3 min-w-0">
            <div className="flex items-center justify-between">
                <span className="text-base font-medium text-ink-muted">{label}</span>
                <span className="size-8 rounded-control-sm bg-surface flex items-center justify-center text-ink">{icon}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
                {unit && <span className="text-base text-ink-muted">{unit}</span>}
                <DeltaBadge value={d} />
            </div>
            <span className="text-sm text-ink-muted">{sub}</span>
        </div>
    )
}

function Tile({ label, icon, value, hint, delta: d, tone }: { label: string; icon: ReactNode; value: string; hint?: string; delta?: number | null; tone?: "warning" | "danger" }) {
    const color = tone === "danger" ? "text-danger-text" : tone === "warning" ? "text-warning-text" : "text-ink"
    return (
        <div className="bg-surface-sunken rounded-surface px-4 py-3.5 flex flex-col gap-1.5 min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium text-ink-muted">{icon}{label}</span>
            <div className="flex items-center gap-2">
                <span className={`text-lg font-semibold tabular-nums ${color}`}>{value}</span>
                {d !== undefined && <DeltaBadge value={d} />}
            </div>
            {hint && <span className="text-xs text-ink-faint">{hint}</span>}
        </div>
    )
}

function Funnel({ rows }: { rows: AmoDashboard["funnel"] }) {
    const max = Math.max(1, ...rows.map((r) => r.count))
    return (
        <div className="flex flex-col gap-2">
            {rows.map((r) => (
                <div key={r.id} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3">
                    <span className="text-base text-ink truncate flex items-center gap-2">
                        {r.kind === "won" && <CheckCircle size={16} className="text-success-text shrink-0" />}
                        {r.name}
                    </span>
                    <div className="h-6 rounded-item bg-surface overflow-hidden">
                        <div
                            className={`h-full rounded-item ${r.kind === "won" ? "bg-success" : r.kind === "lost" ? "bg-mute-soft-hover" : "bg-accent"}`}
                            style={{ width: `${Math.max(r.count > 0 ? 2 : 0, (r.count / max) * 100)}%`, opacity: r.kind === "open" ? 0.85 : 1 }}
                        />
                    </div>
                    <span className="text-base font-medium tabular-nums text-ink w-24 text-right">
                        {formatNumber(r.count)}
                        {r.kind === "open" && r.entered > 0 && <span className="text-sm font-normal text-ink-muted"> · +{formatNumber(r.entered)}</span>}
                    </span>
                </div>
            ))}
            <p className="text-sm text-ink-muted pt-1">«+N» — davr ichida bosqichga kirgan lidlar</p>
        </div>
    )
}

function Losses({ rows }: { rows: AmoDashboard["losses"] }) {
    const total = rows.reduce((s, r) => s + r.count, 0)
    return (
        <div className="flex flex-col gap-3">
            {rows.map((r) => (
                <div key={r.reason} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3 text-base">
                        <span className="text-ink truncate">{r.reason}</span>
                        <span className="text-ink-muted tabular-nums shrink-0">{formatNumber(r.count)} · {pct(r.count, total)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                        <div className="h-full rounded-full bg-danger" style={{ width: `${(r.count / total) * 100}%`, opacity: 0.7 }} />
                    </div>
                </div>
            ))}
        </div>
    )
}

function DailyChart({ rows }: { rows: AmoDashboard["daily"] }) {
    const data = rows.map((r) => ({ ...r, label: `${r.day.slice(8, 10)}.${r.day.slice(5, 7)}` }))
    const tick = { fontSize: 12, fill: "var(--ds-color-text-muted)", fontFamily: "var(--ds-font-body)" }
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4 text-sm text-ink-muted">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-mute-soft-hover" />Yangi lidlar</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" />Sotuvlar</span>
            </div>
            <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={2}>
                        <CartesianGrid vertical={false} stroke="var(--ds-color-border-default)" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={tick} minTickGap={16} />
                        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={tick} />
                        <Tooltip
                            cursor={{ fill: "var(--ds-color-mute-ghost-hover)" }}
                            contentStyle={{
                                borderRadius: "var(--ds-radius-menu)",
                                background: "var(--ds-color-surface-raised)",
                                color: "var(--ds-color-text-default)",
                                border: "1px solid var(--ds-color-border-default)",
                                fontFamily: "var(--ds-font-body)",
                                fontSize: 12,
                            }}
                        />
                        <Bar dataKey="new_leads" name="Yangi lidlar" fill="var(--ds-color-mute-soft-hover)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                        <Bar dataKey="won" name="Sotuvlar" fill="var(--ds-color-success-default)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

function DashboardSkeleton() {
    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-surface" />)}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-surface" />)}
            </div>
            <Skeleton className="h-[300px] rounded-surface" />
        </div>
    )
}
