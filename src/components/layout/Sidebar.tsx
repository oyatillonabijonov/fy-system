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
    SidebarSimple,
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
import { motion } from "framer-motion"
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
                    { name: "Boshqaruv", icon: SquaresFour, path: "/tadbirlar/boshqaruv", module: "tadbirlar" },
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
            animate={{ width: isCollapsed ? 68 : 264 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className="h-full flex flex-col overflow-hidden flex-shrink-0 px-4 py-5"
        >
            {/* Top: Logo + Collapse button */}
            <div className={`flex items-center h-control-md mb-6 ${isCollapsed ? "justify-center" : "justify-between pl-1"}`}>
                {!isCollapsed && (
                    <img
                        src={themeId === 'dark' ? "/Sidebar/Logo-white.svg" : "/Sidebar/Logo.svg"}
                        alt="Biznes Klub Logo"
                        className="w-auto h-7"
                    />
                )}
                <button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    aria-label={isCollapsed ? "Menyuni yoyish" : "Menyuni yig'ish"}
                    aria-expanded={!isCollapsed}
                    className="h-control-md w-9 rounded-control flex items-center justify-center flex-shrink-0 text-ink transition-colors hover:bg-mute-ghost-hover"
                >
                    <SidebarSimple size={20} />
                </button>
            </div>

            {/* Search */}
            {!isCollapsed && (
                <div className="relative mb-4">
                    <MagnifyingGlass
                        size={16}
                       
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
                    />
                    <input
                        type="text"
                        placeholder="Menyudan qidirish"
                        aria-label="Menyudan qidirish"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-control-md rounded-full pl-9 pr-3 text-base text-ink placeholder:text-ink-faint bg-surface border border-transparent outline-none transition-colors focus:border-line-focus"
                    />
                </div>
            )}

            {/* Nav */}
            <nav aria-label="Asosiy menyu" className="flex-1 flex flex-col gap-6 overflow-y-auto no-scrollbar min-h-0 pb-4">
                {visibleSections.map((section) => (
                    <div key={section.title} className="flex flex-col gap-0.5">
                        {!isCollapsed && (
                            <h3 className="text-sm text-ink-muted px-3 pb-1.5">
                                {section.title}
                            </h3>
                        )}
                        {section.items.map((item) => {
                            const active = isActive(item)
                            const hasSubItems = item.subItems && item.subItems.length > 0
                            const isExpanded = expandedItems.includes(item.name)

                            return (
                                <div key={item.name} className="flex flex-col">
                                    <button
                                        onClick={() => {
                                            if (hasSubItems && !isCollapsed) {
                                                toggleExpand(item.name)
                                            } else {
                                                handleNavigate(item)
                                            }
                                        }}
                                        type="button"
                                        onMouseEnter={() => handlePrefetch(item.name)}
                                        onFocus={() => handlePrefetch(item.name)}
                                        aria-current={active && !hasSubItems ? "page" : undefined}
                                        aria-expanded={hasSubItems && !isCollapsed ? isExpanded : undefined}
                                        title={isCollapsed ? item.name : undefined}
                                        aria-label={isCollapsed ? item.name : undefined}
                                        className={`flex items-center gap-3 h-control-md rounded-full text-base font-medium text-ink transition-colors ${isCollapsed ? "w-10 justify-center self-center" : "w-full px-3"} ${active ? "bg-surface " : "hover:bg-mute-ghost-hover"}`}
                                    >
                                        <item.icon size={18} className="flex-shrink-0" />
                                        {!isCollapsed && (
                                            <>
                                                <span className="flex-1 text-left whitespace-nowrap truncate">{item.name}</span>
                                                {hasSubItems && (
                                                    <CaretDown
                                                        size={16}
                                                       
                                                        className={`text-ink-faint transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                                    />
                                                )}
                                            </>
                                        )}
                                    </button>

                                    {hasSubItems && isExpanded && !isCollapsed && (
                                        <div className="flex flex-col gap-0.5 mt-0.5 ml-[21px] pl-3 border-l border-line">
                                            {item.subItems?.map((subItem) => {
                                                const isSubActive = subItem.path ? location.pathname.startsWith(subItem.path) : false
                                                return (
                                                    <button
                                                        key={subItem.name}
                                                        type="button"
                                                        onClick={() => handleNavigate(subItem)}
                                                        aria-current={isSubActive ? "page" : undefined}
                                                        className={`relative flex items-center gap-3 h-control-sm px-2 text-base font-medium transition-colors before:absolute before:-left-[13px] before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-px before:transition-colors ${isSubActive ? "text-ink before:bg-ink" : "text-ink-muted hover:text-ink before:bg-transparent"}`}
                                                    >
                                                        <subItem.icon size={16} className="flex-shrink-0" />
                                                        <span className="flex-1 text-left truncate">{subItem.name}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ))}
            </nav>

            {/* Profile / Logout */}
            {!isCollapsed && <h3 className="text-sm text-ink-muted px-3 pb-2">Akkaunt</h3>}
            <div className={`flex items-center ${isCollapsed ? "flex-col" : "gap-3 px-1"}`}>
                <div
                    className="size-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-accent text-ink-on-accent"
                    title={displayName ?? ""}
                >
                    {displayAvatar ? (
                        <img src={displayAvatar} alt={displayName ?? ""} className="w-full h-full object-cover" />
                    ) : displayName ? (
                        <span className="text-sm font-semibold">{userInitials}</span>
                    ) : (
                        <User size={18} />
                    )}
                </div>
                {!isCollapsed && (
                    <>
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-base font-medium text-ink truncate">
                                {displayName ?? "Mehmon"}
                            </span>
                            <span className="text-sm text-ink-muted truncate">
                                {roleLabel}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={handleSignOut}
                            aria-label="Chiqish"
                            title="Chiqish"
                            className="h-control-md w-9 rounded-control flex items-center justify-center flex-shrink-0 text-ink-muted transition-colors hover:bg-mute-ghost-hover hover:text-ink"
                        >
                            <SignOut size={18} />
                        </button>
                    </>
                )}
            </div>
        </motion.aside>
    )
}
