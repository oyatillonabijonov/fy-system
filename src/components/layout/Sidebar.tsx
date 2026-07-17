import {
    MagnifyingGlass,
    House,
    Users,
    CreditCard,
    CalendarBlank,
    Bell,
    Gear,
    SignOut,
    User,
    CaretLeft,
    CaretRight,
    CaretDown,
    PaperPlaneRight,
    ChatTeardropDots,
    Envelope,
    DeviceMobile,
    SquaresFour,
    Coins,
    Terminal,
    Buildings,
    ClockCounterClockwise,
    Newspaper,
    type Icon as PhosphorIcon,
} from "@phosphor-icons/react"
import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { useLocation, useNavigate } from "react-router-dom"
import { useTheme } from "@/context/ThemeContext"
import { useAuth } from "@/context/AuthContext"
import { signOut } from "@/lib/supabase/queries/auth"
import type { ModuleName } from "@/lib/supabase/queries/auth"
import { DASHBOARD_KEY } from "@/hooks/useDashboard"
import { CLIENTS_KEY } from "@/hooks/useClients"
import { EVENTS_KEY } from "@/hooks/useEvents"

interface NavItem {
    name: string
    icon: PhosphorIcon
    path?: string
    module?: ModuleName
    adminOnly?: boolean
    subItems?: NavItem[]
}

interface NavSection {
    title: string
    items: NavItem[]
}

const navigationSections: NavSection[] = [
    {
        title: "Asosiy",
        items: [
            { name: "Dashboard", icon: House, path: "/dashboard", module: "dashboard" },
            { name: "Mijozlar", icon: Users, path: "/mijozlar", module: "mijozlar" },
            { name: "Sotuv bo'limi", icon: CreditCard, path: "/sotuv/crm-n", module: "sotuv-crmn" },
            {
                name: "Tadbirlar",
                icon: CalendarBlank,
                path: "/tadbirlar",
                subItems: [
                    { name: "Boshqaruv", icon: SquaresFour, path: "/tadbirlar", module: "tadbirlar" },
                    { name: "Moliya", icon: Coins, path: "/tadbirlar/moliya", module: "tadbirlar-moliya" },
                ],
            },
            {
                name: "Bildirishnomalar",
                icon: Bell,
                subItems: [
                    { name: "Barchasi", icon: SquaresFour },
                    { name: "Telegram Bot", icon: PaperPlaneRight },
                    { name: "SMS", icon: ChatTeardropDots },
                    { name: "Email", icon: Envelope },
                    { name: "Ilova", icon: DeviceMobile },
                ],
            },
        ],
    },
    {
        title: "Boshqaruv",
        items: [
            { name: "Hodimlar", icon: Users, path: "/hodimlar", adminOnly: true },
            { name: "Bo'limlar", icon: Buildings, path: "/bolimlar", adminOnly: true },
            { name: "Faollik", icon: ClockCounterClockwise, path: "/faollik", adminOnly: true },
            { name: "Yangiliklar", icon: Newspaper, path: "/yangiliklar", adminOnly: true },
            {
                name: "Sozlamalar",
                icon: Gear,
                path: "/sozlamalar",
                module: "sozlamalar",
                subItems: [
                    { name: "API", icon: Terminal },
                ],
            },
        ],
    },
]

const prefetchMap: Record<string, { key: readonly string[]; fn: () => Promise<unknown> }> = {
    Dashboard: { key: [...DASHBOARD_KEY], fn: () => import("@/lib/supabase/queries/dashboard").then(m => m.getDashboardAnalytics()) },
    Mijozlar: { key: [...CLIENTS_KEY], fn: () => import("@/lib/supabase/queries/clients").then(m => m.getClients()) },
    Tadbirlar: { key: [...EVENTS_KEY], fn: () => import("@/lib/supabase/queries/events").then(m => m.getEvents()) },
}

export function Sidebar() {
    const navigate = useNavigate()
    const location = useLocation()
    const { user, hasAccess } = useAuth()
    const isAdminUser = user?.role === "admin"

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
    const [expandedItems, setExpandedItems] = useState<string[]>([])

    const toggleExpand = (name: string) => {
        setExpandedItems(prev =>
            prev.includes(name)
                ? prev.filter(i => i !== name)
                : [...prev, name]
        )
    }

    function isItemVisible(item: NavItem): boolean {
        if (item.adminOnly) return isAdminUser
        if (item.module) return hasAccess(item.module)
        return true
    }

    function filterItem(item: NavItem): NavItem | null {
        if (item.subItems && item.subItems.length > 0) {
            const visibleSubs = item.subItems.filter(isItemVisible)
            if (visibleSubs.length === 0) return null
            return { ...item, subItems: visibleSubs }
        }
        if (!isItemVisible(item)) return null
        return item
    }

    const visibleSections = navigationSections
        .map(section => ({
            ...section,
            items: section.items
                .map(item => filterItem(item))
                .filter((it): it is NavItem => it !== null)
                .filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase())),
        }))
        .filter(section => section.items.length > 0)

    function handleNavigate(item: NavItem) {
        if (!item.path) return
        navigate(item.path)
    }

    function isActive(item: NavItem): boolean {
        if (item.path && location.pathname.startsWith(item.path)) return true
        if (item.subItems?.some(sub => sub.path && location.pathname.startsWith(sub.path))) return true
        return false
    }

    async function handleSignOut() {
        await signOut()
        navigate("/login", { replace: true })
    }

    const displayName = user?.full_name
    const displaySub  = user?.role === "admin" ? "Administrator" : user?.role === "manager" ? "Menejer" : "Xodim"
    const displayAvatar = user?.avatar_url

    const userInitials = displayName
        ? displayName.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
        : "—"

    const roleLabel = displaySub

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
                    {isCollapsed ? <CaretRight size={20} weight="bold" /> : <CaretLeft size={20} weight="bold" />}
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
                        <MagnifyingGlass
                            size={20}
                            className="absolute right-5 top-1/2 -translate-y-1/2"
                            weight="bold"
                            style={{ color: 'var(--sidebar-muted)' }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Nav */}
            <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden -mx-4 px-4">
                <nav className="flex-1 flex flex-col gap-[12px] overflow-y-hidden hover:overflow-y-auto no-scrollbar transition-all pt-2 pb-[100px]">
                    {visibleSections.map((section, index) => (
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
                                        const active = isActive(item)
                                        const hasSubItems = item.subItems && item.subItems.length > 0
                                        const isExpanded = expandedItems.includes(item.name)

                                        return (
                                            <div key={item.name} className="flex flex-col">
                                                <motion.div
                                                    onClick={() => {
                                                        if (hasSubItems && !isCollapsed) {
                                                            toggleExpand(item.name)
                                                        } else {
                                                            handleNavigate(item)
                                                        }
                                                    }}
                                                    layout
                                                    className={`flex items-center apple-sq-12 cursor-pointer transition-all duration-200 group relative overflow-hidden ${isCollapsed ? "w-11 h-11" : "px-4 py-2 w-full"}`}
                                                    style={{
                                                        background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                                                        border: active ? '1px solid var(--sidebar-active-border)' : '1px solid transparent',
                                                        color: active ? 'var(--sidebar-fg)' : 'var(--sidebar-muted)',
                                                    }}
                                                    onMouseEnter={e => {
                                                        if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover-bg)'
                                                        handlePrefetch(item.name)
                                                    }}
                                                    onMouseLeave={e => {
                                                        if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
                                                    }}
                                                    title={isCollapsed ? item.name : ""}
                                                >
                                                    <div className={`flex-shrink-0 flex items-center justify-center ${isCollapsed ? "w-11 h-11" : "w-5 h-5 mr-3"}`}>
                                                        <item.icon size={20} className="transition-all" weight="bold" />
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
                                                                        <CaretDown size={16} weight="bold" style={{ color: 'var(--sidebar-muted)' }} />
                                                                    </motion.div>
                                                                )}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                    {active && !isCollapsed && (
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
                                                                const isSubActive = subItem.path ? location.pathname.startsWith(subItem.path) : false
                                                                return (
                                                                    <motion.div
                                                                        key={subItem.name}
                                                                        onClick={() => handleNavigate(subItem)}
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
                                                                        <subItem.icon size={16} className="mr-3 transition-colors" weight="bold" />
                                                                        <span className="flex-1 truncate">{subItem.name}</span>
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
                            {index < visibleSections.length - 1 && (
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

            {/* Profile / Logout */}
            <motion.div
                layout
                className={`mt-auto w-full transition-all duration-300 ${isCollapsed ? "bg-transparent border-none p-0 h-auto flex flex-col items-center" : "h-[60px] apple-sq-12 px-4 py-[10px] flex items-center gap-3"}`}
                style={isCollapsed ? {} : {
                    background: 'var(--sidebar-profile-bg)',
                    border: '1px solid var(--sidebar-profile-border)',
                }}
            >
                <motion.div
                    layout
                    className={`rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${isCollapsed ? "w-11 h-11" : "w-10 h-10"}`}
                    style={{ background: 'var(--sidebar-avatar-bg)' }}
                    title={displayName ?? ""}
                >
                    {displayAvatar ? (
                        <img src={displayAvatar} alt={displayName ?? ""} className="w-full h-full object-cover" />
                    ) : displayName ? (
                        <span className="text-[14px] font-bold text-white">{userInitials}</span>
                    ) : (
                        <User size={20} className="text-white" weight="bold" />
                    )}
                </motion.div>
                <AnimatePresence>
                    {!isCollapsed && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="flex flex-col gap-0 min-w-0"
                        >
                            <span className="text-[16px] font-semibold truncate leading-tight" style={{ color: 'var(--sidebar-fg)' }}>
                                {displayName ?? "Mehmon"}
                            </span>
                            <span className="text-[14px] truncate leading-tight" style={{ color: 'var(--sidebar-muted)' }}>
                                {roleLabel}
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
                {!isCollapsed && (
                    <button
                        onClick={handleSignOut}
                        className="ml-auto p-1 rounded-[6px] transition-colors flex-shrink-0"
                        style={{ color: 'var(--sidebar-muted)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-fg)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-muted)' }}
                        title="Chiqish"
                    >
                        <SignOut size={20} weight="bold" />
                    </button>
                )}
            </motion.div>
        </motion.aside>
    )
}
