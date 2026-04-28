import {
    MagnifyingGlassIcon,
    HomeIcon,
    UsersIcon,
    CreditCardIcon,
    PhoneIcon,
    CalendarDaysIcon,
    CheckCircleIcon,
    PresentationChartLineIcon,
    BellIcon,
    ArrowTrendingUpIcon,
    WalletIcon,
    Cog6ToothIcon,
    ArrowLeftOnRectangleIcon,
    UserIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronDownIcon,
    ChartBarIcon,
PaperAirplaneIcon,
    ChatBubbleLeftEllipsisIcon,
    EnvelopeIcon,
    DevicePhoneMobileIcon,
    PhotoIcon,
    MicrophoneIcon,
    Squares2X2Icon,
    CommandLineIcon
} from "@heroicons/react/24/solid"
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { useTheme } from "@/context/ThemeContext"
import { DASHBOARD_KEY } from "@/hooks/useDashboard"
import { CLIENTS_KEY } from "@/hooks/useClients"
import { EVENTS_KEY } from "@/hooks/useEvents"

const navigationSections = [
    {
        title: "Asosiy",
        items: [
            { name: "Dashboard", icon: HomeIcon, active: true },
            { name: "Mijozlar", icon: UsersIcon, active: false },
            {
                name: "Sotuv bo'limi",
                icon: CreditCardIcon,
                active: false,
                subItems: [
                    { name: "AmoCRM", icon: ChartBarIcon },
                    { name: "CRM-N", icon: Squares2X2Icon }
                ]
            },
            { name: "IP Telefoniya", icon: PhoneIcon, active: false },
            { name: "Tadbirlar", icon: CalendarDaysIcon, active: false },
            { name: "Vazifalar", icon: CheckCircleIcon, active: false },
            { name: "Analitika", icon: PresentationChartLineIcon, active: false },
            { name: "Podkast", icon: MicrophoneIcon, active: false },
            {
                name: "Bildirishnomalar",
                icon: BellIcon,
                active: false,
                subItems: [
                    { name: "Barchasi", icon: Squares2X2Icon },
                    { name: "Telegram Bot", icon: PaperAirplaneIcon },
                    { name: "SMS", icon: ChatBubbleLeftEllipsisIcon },
                    { name: "Email", icon: EnvelopeIcon },
                    { name: "Ilova", icon: DevicePhoneMobileIcon }
                ]
            },
        ]
    },
    {
        title: "Moliya",
        items: [
            { name: "Cash Flow", icon: ArrowTrendingUpIcon, active: false },
            { name: "To'lovlar", icon: WalletIcon, active: false },
        ]
    },
    {
        title: "Boshqaruv",
        items: [
            { name: "Hodimlar", icon: UsersIcon, active: false },
            {
                name: "Sozlamalar",
                icon: Cog6ToothIcon,
                active: false,
                subItems: [
                    { name: "API", icon: CommandLineIcon }
                ]
            },
        ]
    }
]

interface SidebarProps {
    activeItem: string;
    onNavigate: (item: string) => void;
}

const prefetchMap: Record<string, { key: readonly string[]; fn: () => Promise<unknown> }> = {
    Dashboard: { key: [...DASHBOARD_KEY], fn: () => import("@/lib/amocrm/analytics").then(m => m.getDashboardAnalytics()) },
    Mijozlar: { key: [...CLIENTS_KEY], fn: () => import("@/lib/supabase/queries/clients").then(m => m.getClients()) },
    Tadbirlar: { key: [...EVENTS_KEY], fn: () => import("@/lib/supabase/queries/events").then(m => m.getEvents()) },
}

export function Sidebar({ activeItem, onNavigate }: SidebarProps) {
    const [isCollapsed, setIsCollapsed] = useState(() => {
        try {
            return localStorage.getItem('fy_sidebar_collapsed') === 'true'
        } catch { return false }
    })
    useEffect(() => {
        try { localStorage.setItem('fy_sidebar_collapsed', String(isCollapsed)) } catch { /* private browsing */ }
    }, [isCollapsed])

    const { themeId } = useTheme()
    const queryClient = useQueryClient()
    const handlePrefetch = (name: string) => {
        const entry = prefetchMap[name]
        if (entry) {
            queryClient.prefetchQuery({ queryKey: entry.key, queryFn: entry.fn, staleTime: 1000 * 60 * 2 })
        }
    }

    const [searchQuery, setSearchQuery] = useState("")
    const [expandedItems, setExpandedItems] = useState<string[]>(["Sotuv bo'limi"])
    const [profileImage, setProfileImage] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setProfileImage(reader.result as string)
            }
            reader.readAsDataURL(file)
        }
    }

    const toggleExpand = (name: string) => {
        setExpandedItems(prev =>
            prev.includes(name)
                ? prev.filter(i => i !== name)
                : [...prev, name]
        )
    }

    const filteredSections = navigationSections.map(section => ({
        ...section,
        items: section.items.filter(item =>
            item.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
    })).filter(section => section.items.length > 0)

    return (
        <motion.aside
            initial={false}
            animate={{ width: isCollapsed ? 80 : 340 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="h-screen flex flex-col overflow-hidden relative sticky top-0 flex-shrink-0 transition-colors duration-300"
            style={{
                background: 'var(--sidebar-bg)',
                padding: "20px 20px",
            }}
        >
            {/* Top: Logo + Collapse button */}
            <div className="flex items-center justify-between h-8 mb-[20px] px-1">
                <AnimatePresence mode="wait">
                    {!isCollapsed ? (
                        <motion.img
                            key="logo"
                            src={themeId === 'black-orange' ? "/Sidebar/Logo-white.svg" : "/Sidebar/Logo.svg"}
                            alt="Biznes Klub Logo"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="w-auto h-8"
                        />
                    ) : (
                        <div key="spacer" className="w-0 h-8" />
                    )}
                </AnimatePresence>
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-2 rounded-[8px] transition-colors flex items-center justify-center flex-shrink-0"
                    style={{ color: 'var(--sidebar-muted)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-collapse-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                    {isCollapsed ? (
                        <ChevronRightIcon className="w-5 h-5" strokeWidth={2} />
                    ) : (
                        <ChevronLeftIcon className="w-5 h-5" strokeWidth={2} />
                    )}
                </button>
            </div>

            {/* Search */}
            <AnimatePresence>
                {!isCollapsed && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="relative mb-[20px]"
                    >
                        <input
                            type="text"
                            placeholder="Qidiruv..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-[52px] apple-sq-12 pl-4 pr-12 text-[16px] outline-none transition-colors"
                            style={{
                                background: 'var(--sidebar-search-bg)',
                                border: '1px solid var(--sidebar-search-border)',
                                color: 'var(--sidebar-fg)',
                            }}
                        />
                        <MagnifyingGlassIcon
                            className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5"
                            strokeWidth={2}
                            style={{ color: 'var(--sidebar-muted)' }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Nav */}
            <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden -mx-4 px-4">
                <nav className="flex-1 flex flex-col gap-[12px] overflow-y-hidden hover:overflow-y-auto no-scrollbar transition-all pt-2 pb-[100px]">
                    {filteredSections.map((section, index) => (
                        <motion.div key={section.title} layout className="flex flex-col gap-[12px]">
                            <div className="flex flex-col gap-[8px]">
                                <AnimatePresence>
                                    {!isCollapsed && (
                                        <motion.h3
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            className="text-[12px] font-medium uppercase tracking-wider px-4"
                                            style={{ color: 'var(--sidebar-section-label)' }}
                                        >
                                            {section.title}
                                        </motion.h3>
                                    )}
                                </AnimatePresence>
                                <div className="flex flex-col gap-1">
                                    {section.items.map((item) => {
                                        const isActive = activeItem === item.name || item.subItems?.some(sub => activeItem === sub.name)
                                        const hasSubItems = item.subItems && item.subItems.length > 0
                                        const isExpanded = expandedItems.includes(item.name)

                                        return (
                                            <div key={item.name} className="flex flex-col">
                                                <motion.div
                                                    onClick={() => {
                                                        if (hasSubItems && !isCollapsed) {
                                                            toggleExpand(item.name)
                                                        } else {
                                                            onNavigate(item.name)
                                                        }
                                                    }}
                                                    layout
                                                    className={`flex items-center apple-sq-12 cursor-pointer transition-all duration-200 group relative overflow-hidden ${isCollapsed ? "w-11 h-11" : "px-4 py-2 w-full"}`}
                                                    style={{
                                                        background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                                                        border: isActive ? '1px solid var(--sidebar-active-border)' : '1px solid transparent',
                                                        color: isActive ? 'var(--sidebar-fg)' : 'var(--sidebar-muted)',
                                                    }}
                                                    onMouseEnter={e => {
                                                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover-bg)'
                                                        handlePrefetch(item.name)
                                                    }}
                                                    onMouseLeave={e => {
                                                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                                                    }}
                                                    title={isCollapsed ? item.name : ""}
                                                >
                                                    <div className={`flex-shrink-0 flex items-center justify-center ${isCollapsed ? "w-11 h-11" : "w-5 h-5 mr-3"}`}>
                                                        <item.icon className="w-5 h-5 transition-all" />
                                                    </div>
                                                    <AnimatePresence>
                                                        {!isCollapsed && (
                                                            <motion.div
                                                                initial={{ opacity: 0, x: -5 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                exit={{ opacity: 0, x: -5 }}
                                                                className="flex-1 flex items-center justify-between"
                                                            >
                                                                <span className="text-[16px] font-normal whitespace-nowrap">
                                                                    {item.name}
                                                                </span>
                                                                {hasSubItems && (
                                                                    <motion.div
                                                                        animate={{ rotate: isExpanded ? 180 : 0 }}
                                                                        transition={{ duration: 0.2 }}
                                                                    >
                                                                        <ChevronDownIcon className="w-4 h-4" style={{ color: 'var(--sidebar-muted)' }} />
                                                                    </motion.div>
                                                                )}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                    {isActive && !isCollapsed && (
                                                        <motion.div
                                                            layoutId="active-indicator"
                                                            className="absolute left-0 w-1 h-6 rounded-r-full"
                                                            style={{ background: 'var(--sidebar-indicator)' }}
                                                        />
                                                    )}
                                                </motion.div>

                                                <AnimatePresence>
                                                    {hasSubItems && isExpanded && !isCollapsed && (
                                                        <motion.div
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: "auto" }}
                                                            exit={{ opacity: 0, height: 0 }}
                                                            className="overflow-hidden flex flex-col mt-1"
                                                        >
                                                            {item.subItems?.map((subItem) => {
                                                                const isSubActive = activeItem === subItem.name
                                                                return (
                                                                    <motion.div
                                                                        key={subItem.name}
                                                                        onClick={() => onNavigate(subItem.name)}
                                                                        className="flex items-center pl-12 pr-4 py-2 cursor-pointer transition-all duration-200 apple-sq-10 group"
                                                                        style={{
                                                                            color: isSubActive ? 'var(--sidebar-fg)' : 'var(--sidebar-muted)',
                                                                            fontWeight: isSubActive ? 500 : 400,
                                                                        }}
                                                                        onMouseEnter={e => {
                                                                            if (!isSubActive) (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-fg)'
                                                                        }}
                                                                        onMouseLeave={e => {
                                                                            if (!isSubActive) (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-muted)'
                                                                        }}
                                                                    >
                                                                        <subItem.icon className="w-4 h-4 mr-3 transition-colors" />
                                                                        <span className="flex-1 truncate">{subItem.name}</span>
                                                                        {(subItem.name === "Sotuv bo'limi" || subItem.name === "To'lovlar") && (
                                                                            <span className="w-1.5 h-1.5 bg-[#FF3B30] rounded-full shadow-[0_0_8px_rgba(255,59,48,0.4)] flex-shrink-0" />
                                                                        )}
                                                                    </motion.div>
                                                                )
                                                            })}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                            {index < filteredSections.length - 1 && (
                                <div 
                                    className="mx-4 h-[1px]" 
                                    style={{ 
                                        backgroundImage: `linear-gradient(to right, var(--sidebar-divider) 0%, var(--sidebar-divider) 50%, transparent 50%, transparent 100%)`,
                                        backgroundSize: '14px 1px',
                                        backgroundRepeat: 'repeat-x'
                                    }} 
                                />
                            )}
                        </motion.div>
                    ))}
                </nav>
                {/* Scroll blurs */}
                <div className="absolute top-0 left-0 right-0 h-4 pointer-events-none z-10"
                    style={{ background: 'linear-gradient(to bottom, var(--sidebar-bg), transparent)' }} />
                <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none z-10"
                    style={{ background: 'linear-gradient(to top, var(--sidebar-bg) 30%, transparent)' }} />
            </div>

            {/* Profile */}
            <motion.div
                layout
                className={`mt-auto w-full transition-all duration-300 ${isCollapsed ? "bg-transparent border-none p-0 h-auto flex flex-col items-center" : "h-[60px] apple-sq-12 px-4 py-[10px] flex items-center gap-3"}`}
                style={isCollapsed ? {} : {
                    background: 'var(--sidebar-profile-bg)',
                    border: '1px solid var(--sidebar-profile-border)',
                }}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                />
                <motion.div
                    layout
                    onClick={() => fileInputRef.current?.click()}
                    className={`rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer overflow-hidden group/avatar relative ${isCollapsed ? "w-11 h-11" : "w-10 h-10"}`}
                    style={{ background: 'var(--sidebar-avatar-bg)' }}
                >
                    {profileImage ? (
                        <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <UserIcon className="w-5 h-5 text-white" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
                        <PhotoIcon className="w-4 h-4 text-white" />
                    </div>
                </motion.div>
                <AnimatePresence>
                    {!isCollapsed && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="flex flex-col gap-0 min-w-0"
                        >
                            <span className="text-[16px] font-semibold truncate leading-tight" style={{ color: 'var(--sidebar-fg)' }}>Ali Valiev</span>
                            <span className="text-[14px] truncate leading-tight" style={{ color: 'var(--sidebar-muted)' }}>Administrator</span>
                        </motion.div>
                    )}
                </AnimatePresence>
                {!isCollapsed && (
                    <ArrowLeftOnRectangleIcon
                        className="ml-auto w-5 h-5 cursor-pointer flex-shrink-0 transition-colors"
                        strokeWidth={2}
                        style={{ color: 'var(--sidebar-muted)' }}
                    />
                )}
            </motion.div>
        </motion.aside>
    )
}
