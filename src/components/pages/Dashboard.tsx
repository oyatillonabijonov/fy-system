import {
    Users,
    Ticket,
    TrendUp,
    DotsThree,
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

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {stats.map((stat, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white border border-[#F0F0F0] rounded-[8px] p-5 flex flex-col gap-4 group hover:border-[#141414] transition-all cursor-default"
                    >
                        <div className="flex items-center justify-between">
                            <div className="w-10 h-10 rounded-[8px] bg-[#F5F5F5] flex items-center justify-center">
                                <stat.icon size={20} className="text-[#141414]" weight="bold" />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[13px] font-medium text-[#999999]">{stat.title}</span>
                            {loading ? (
                                <Skeleton className="w-20 h-7" />
                            ) : (
                                <div className="flex items-baseline gap-1">
                                    <span className="text-[22px] font-bold text-[#141414]">{stat.value}</span>
                                    {stat.suffix && (
                                        <span className="text-[12px] font-bold text-[#999999]">{stat.suffix}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Area Chart */}
                <div className="lg:col-span-2 bg-white border border-[#F0F0F0] rounded-[8px] p-6 flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-[16px] font-bold text-[#141414]">Lidlar statistikasi</h3>
                            <p className="text-[12px] text-[#999999]">Oxirgi 7 oylik ko'rsatkichlar</p>
                        </div>
                        <button className="p-2 hover:bg-[#F5F5F5] rounded-[8px] transition-colors">
                            <DotsThree size={20} className="text-[#999999]" weight="bold" />
                        </button>
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
                                            <stop offset="5%" stopColor="#141414" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#141414" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                                    <XAxis
                                        dataKey="month"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 12, fill: '#999999', fontFamily: "'Geist Variable', sans-serif" }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 12, fill: '#999999', fontFamily: "'Geist Variable', sans-serif" }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '8px',
                                            border: '1px solid #F0F0F0',
                                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                            fontFamily: "'Geist Variable', sans-serif"
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        name="Lidlar"
                                        stroke="#141414"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorLeads)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Summary Card (Pie chart o'rniga) */}
                <div className="bg-white border border-[#F0F0F0] rounded-[8px] p-6 flex flex-col gap-6">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-[16px] font-bold text-[#141414]">Umumiy ko'rsatkichlar</h3>
                        <p className="text-[12px] text-[#999999]">Asosiy statistika</p>
                    </div>
                    <div className="flex flex-col gap-0">
                        {[
                            { label: "Bugun tushgan", value: analytics ? String(analytics.leadsToday) : "—", suffix: "ta" },
                            { label: "Kecha tushgan", value: analytics ? String(analytics.leadsYesterday) : "—", suffix: "ta" },
                            { label: "Aktiv lidlar", value: analytics ? String(analytics.activeLeads) : "—", suffix: "ta" },
                            { label: "Konversiya", value: analytics ? analytics.conversionRate.toFixed(1) : "—", suffix: "%" },
                        ].map((item, index) => (
                            <div key={index} className="flex items-center justify-between py-4 border-b border-[#F0F0F0] last:border-0">
                                <span className="text-[13px] text-[#666666]">{item.label}</span>
                                {loading ? (
                                    <Skeleton className="w-12 h-5" />
                                ) : (
                                    <span className="text-[15px] font-bold text-[#141414]">
                                        {item.value} {item.suffix}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Kecha obrabotka bo'lgan lidlar (Oxirgi sotuvlar o'rniga) */}
                <div className="bg-white border border-[#F0F0F0] rounded-[8px] p-6 flex flex-col gap-6">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-[16px] font-bold text-[#141414]">Kecha obrabotka bo'lgan lidlar</h3>
                        <p className="text-[12px] text-[#999999]">updated_at kecha bo'lgan</p>
                    </div>
                    <div className="flex items-center justify-center py-8">
                        {loading ? (
                            <Skeleton className="w-24 h-14" />
                        ) : (
                            <span className="text-[48px] font-bold text-[#141414]">
                                {analytics?.processedYesterday ?? 0}
                                <span className="text-[20px] font-medium text-[#999999] ml-2">ta</span>
                            </span>
                        )}
                    </div>
                </div>

                {/* Growth Bar Chart */}
                <div className="bg-white border border-[#F0F0F0] rounded-[8px] p-6 flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-[16px] font-bold text-[#141414]">Lidlar o'sishi</h3>
                            <p className="text-[12px] text-[#999999]">Oylik yangi lidlar soni</p>
                        </div>
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
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                                    <XAxis
                                        dataKey="month"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 12, fill: '#999999', fontFamily: "'Geist Variable', sans-serif" }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 12, fill: '#999999', fontFamily: "'Geist Variable', sans-serif" }}
                                    />
                                    <Tooltip />
                                    <Bar dataKey="count" name="Lidlar" fill="#141414" radius={[4, 4, 0, 0]} barSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
