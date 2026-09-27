import {
    Users,
    Ticket,
    TrendUp,
} from "@phosphor-icons/react"
import { motion } from "framer-motion"
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
} from 'recharts';
import { useDashboardAnalytics } from "@/hooks/useDashboard"
import { Skeleton } from "@/components/ui/Skeleton"

export function Dashboard() {
    const { data: analytics, isLoading: loading } = useDashboardAnalytics()

    const stats = [
        {
            title: "Kecha tushgan lidlar",
            value: analytics ? String(analytics.leadsYesterday) : "—",
            icon: TrendUp,
            suffix: "ta",
        },
        {
            title: "Jami aktiv lidlar",
            value: analytics ? String(analytics.activeLeads) : "—",
            icon: Users,
            suffix: "ta",
        },
        {
            title: "Bugun tushgan lidlar",
            value: analytics ? String(analytics.leadsToday) : "—",
            icon: Ticket,
            suffix: "ta",
        },
        {
            title: "Konversiya",
            value: analytics ? analytics.conversionRate.toFixed(1) : "—",
            icon: TrendUp,
            suffix: "%",
        },
    ]

    const chartData = analytics?.monthlyLeads ?? []

    const card = "bg-surface-sunken rounded-surface p-5 flex flex-col gap-5"
    const axisTick = { fontSize: 12, fill: 'var(--ds-color-text-muted)', fontFamily: 'var(--ds-font-body)' }
    const tooltipStyle = {
        borderRadius: 'var(--ds-radius-menu)',
        background: 'var(--ds-color-surface-raised)',
        color: 'var(--ds-color-text-default)',
        border: '1px solid var(--ds-color-border-default)',
        fontFamily: 'var(--ds-font-body)',
        fontSize: 12,
    }

    return (
        <div className="flex flex-col gap-4 pb-10">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04, duration: 0.18, ease: [0.2, 0, 0, 1] }}
                        className="bg-surface-sunken rounded-surface p-5 flex flex-col gap-4"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-base font-medium text-ink-muted">{stat.title}</span>
                            <div className="size-8 rounded-control-sm bg-surface flex items-center justify-center text-ink">
                                <stat.icon size={16} />
                            </div>
                        </div>
                        {loading ? (
                            <Skeleton className="w-20 h-8" />
                        ) : (
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-semibold tabular-nums text-ink">{stat.value}</span>
                                {stat.suffix && (
                                    <span className="text-base font-medium text-ink-muted">{stat.suffix}</span>
                                )}
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Area Chart */}
                <div className={`lg:col-span-2 ${card}`}>
                    <div className="flex flex-col gap-0.5">
                        <h3 className="text-md font-semibold text-ink">Lidlar statistikasi</h3>
                        <p className="text-sm text-ink-muted">Oxirgi 7 oylik ko'rsatkichlar</p>
                    </div>
                    <div className="h-[300px] w-full">
                        {loading ? (
                            <div className="w-full h-full flex items-end gap-3 px-4 pb-4">
                                {[55, 72, 41, 88, 63, 35, 79].map((h, i) => (
                                    <Skeleton
                                        key={i}
                                        className="flex-1"
                                        style={{ height: `${h}%` } as React.CSSProperties}
                                    />
                                ))}
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData ?? []}>
                                    <defs>
                                        <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--ds-color-accent-default)" stopOpacity={0.12} />
                                            <stop offset="95%" stopColor="var(--ds-color-accent-default)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} stroke="var(--ds-color-border-default)" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={axisTick} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={axisTick} />
                                    <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--ds-color-border-strong)' }} />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        name="Lidlar"
                                        stroke="var(--ds-color-accent-default)"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorLeads)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Summary Card */}
                <div className={card}>
                    <div className="flex flex-col gap-0.5">
                        <h3 className="text-md font-semibold text-ink">Umumiy ko'rsatkichlar</h3>
                        <p className="text-sm text-ink-muted">Asosiy statistika</p>
                    </div>
                    <div className="flex flex-col rounded-control bg-surface px-4">
                        {[
                            { label: "Bugun tushgan", value: analytics ? String(analytics.leadsToday) : "—", suffix: "ta" },
                            { label: "Kecha tushgan", value: analytics ? String(analytics.leadsYesterday) : "—", suffix: "ta" },
                            { label: "Aktiv lidlar", value: analytics ? String(analytics.activeLeads) : "—", suffix: "ta" },
                            { label: "Konversiya", value: analytics ? analytics.conversionRate.toFixed(1) : "—", suffix: "%" },
                        ].map((item, index) => (
                            <div key={index} className="flex items-center justify-between py-3.5 border-b border-line last:border-0">
                                <span className="text-base text-ink-muted">{item.label}</span>
                                {loading ? (
                                    <Skeleton className="w-12 h-5" />
                                ) : (
                                    <span className="text-base font-medium tabular-nums text-ink">
                                        {item.value} {item.suffix}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Kecha obrabotka bo'lgan lidlar */}
                <div className={card}>
                    <div className="flex flex-col gap-0.5">
                        <h3 className="text-md font-semibold text-ink">Kecha obrabotka bo'lgan lidlar</h3>
                        <p className="text-sm text-ink-muted">Kecha yangilangan lidlar soni</p>
                    </div>
                    <div className="flex items-center justify-center py-8">
                        {loading ? (
                            <Skeleton className="w-24 h-12" />
                        ) : (
                            <span className="flex items-baseline gap-2">
                                <span className="text-3xl font-semibold tabular-nums text-ink">
                                    {analytics?.processedYesterday ?? 0}
                                </span>
                                <span className="text-lg font-medium text-ink-muted">ta</span>
                            </span>
                        )}
                    </div>
                </div>

                {/* Growth Bar Chart */}
                <div className={card}>
                    <div className="flex flex-col gap-0.5">
                        <h3 className="text-md font-semibold text-ink">Lidlar o'sishi</h3>
                        <p className="text-sm text-ink-muted">Oylik yangi lidlar soni</p>
                    </div>
                    <div className="h-[240px] w-full">
                        {loading ? (
                            <div className="w-full h-full flex items-end gap-3 px-4 pb-4">
                                {[35, 60, 78, 45, 82, 50, 70].map((h, i) => (
                                    <Skeleton
                                        key={i}
                                        className="flex-1"
                                        style={{ height: `${h}%` } as React.CSSProperties}
                                    />
                                ))}
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData ?? []}>
                                    <CartesianGrid vertical={false} stroke="var(--ds-color-border-default)" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={axisTick} />
                                    <YAxis axisLine={false} tickLine={false} tick={axisTick} />
                                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--ds-color-mute-ghost-hover)' }} />
                                    <Bar dataKey="count" name="Lidlar" fill="var(--ds-color-accent-default)" radius={[4, 4, 0, 0]} barSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
