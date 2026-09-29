import { Code,
    MagnifyingGlass,
    House,
    Users,
    CalendarBlank,
    Gear,
    SignOut,
    CaretUpDown,
    CaretRight,
    User,
    SidebarSimple,
    CaretDown,
    Wallet,
    ClockCounterClockwise,
    ListChecks,
    type Icon as PhosphorIcon,
} from "@phosphor-icons/react"
import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { useLocation, useNavigate } from "react-router-dom"
import { useTheme, useSidebarScope, MODES, PHOTOS, photoThumb } from "@/context/ThemeContext"
import { useAuth } from "@/context/AuthContext"
import { signOut } from "@/lib/supabase/queries/auth"
import type { ModuleName } from "@/lib/supabase/queries/auth"
import { CLIENTS_KEY } from "@/hooks/useClients"
import { EVENTS_KEY } from "@/hooks/useEvents"

const accountItem = "w-full flex items-center gap-2.5 h-control-md px-2.5 rounded-item text-base font-medium text-ink transition-colors hover:bg-mute-ghost-hover"

interface NavItem {
    name: string
    icon: PhosphorIcon
    path?: string
    module?: ModuleName
    adminOnly?: boolean
    /** Parent with a page of its own: click opens `path` and expands the submenu;
     *  with no visible sub-items it's a plain link */
    opensPage?: boolean
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
            { name: "Dashboard", icon: House, path: "/dashboard" },
            { name: "Mijozlar", icon: Users, path: "/mijozlar", module: "mijozlar" },
            { name: "Vazifalar", icon: ListChecks, path: "/vazifalar" },
            { name: "Tadbirlar", icon: CalendarBlank, path: "/tadbirlar/boshqaruv", module: "tadbirlar" },
            { name: "Moliya", icon: Wallet, path: "/tadbirlar/moliya", module: "tadbirlar-moliya" },
        ],
    },
    {
        title: "Boshqaruv",
        items: [
            { name: "Hodimlar", icon: Users, path: "/hodimlar", adminOnly: true },
            {
                name: "Sozlamalar",
                icon: Gear,
                path: "/sozlamalar",
                opensPage: true,
                subItems: [
                    { name: "Integratsiyalar", icon: Code, path: "/sozlamalar/integratsiyalar", module: "integratsiyalar" },
                    { name: "Faollik", icon: ClockCounterClockwise, path: "/faollik", adminOnly: true },
                ],
            },
        ],
    },
]

const prefetchMap: Record<string, { key: readonly string[]; fn: () => Promise<unknown> }> = {
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

    const { themeId, setThemeId, photo, setPhoto } = useTheme()
    const scope = useSidebarScope()
    const darkSidebar = scope === "dark" || themeId === "dark"
    const [isAccountOpen, setIsAccountOpen] = useState(false)
    const [menuPos, setMenuPos] = useState<{ left: number; width: number; bottom: number } | null>(null)
    useEffect(() => {
        if (!isAccountOpen) return
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsAccountOpen(false) }
        const close = () => setIsAccountOpen(false)   // the anchor moved — reopen places it again
        window.addEventListener("keydown", onKey)
        window.addEventListener("resize", close)
        return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("resize", close) }
    }, [isAccountOpen])
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
            if (visibleSubs.length === 0) return item.opensPage && isItemVisible(item) ? { ...item, subItems: undefined } : null
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
            data-theme={scope}
            className="sidebar h-full flex flex-col overflow-hidden flex-shrink-0 px-4 py-5 text-ink"
        >
            {/* Top: Logo + Collapse button */}
            <div className={`flex items-center h-control-md mb-6 ${isCollapsed ? "justify-center" : "justify-between pl-1"}`}>
                {!isCollapsed && (
                    <img
                        src={darkSidebar ? "/Sidebar/Logo-white.svg" : "/Sidebar/Logo.svg"}
                        alt="Biznes Klub Logo"
                        className="w-auto h-7"
                    />
                )}
                <button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    aria-label={isCollapsed ? "Menyuni yoyish" : "Menyuni yig'ish"}
                    aria-expanded={!isCollapsed}
                    className="h-control-md w-9 rounded-full flex items-center justify-center flex-shrink-0 text-ink transition-colors hover:bg-mute-ghost-hover"
                >
                    <SidebarSimple size={20} />
                </button>
            </div>

            {/* Search */}
            {!isCollapsed && (
                <div className="relative mb-4">
                    <MagnifyingGlass
                        size={16}
                       
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
                    />
                    <input
                        type="text"
                        placeholder="Menyudan qidirish"
                        aria-label="Menyudan qidirish"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-control-md rounded-full pl-9 pr-3 text-base text-ink placeholder:text-ink-muted bg-surface border border-transparent outline-none transition-colors focus:border-line-focus"
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
                                            if (hasSubItems && !isCollapsed && item.opensPage) {
                                                // first click opens the page and the submenu, the next one folds it back
                                                if (!isExpanded) handleNavigate(item)
                                                toggleExpand(item.name)
                                            } else if (hasSubItems && !isCollapsed) {
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

            {/* Account menu: the whole row opens Profilim / theme / Chiqish */}
            <div className="relative">
                <button
                    type="button"
                    onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect()
                        // collapsed sidebar: the menu grows to the right of the avatar
                        setMenuPos({ left: r.left, width: isCollapsed ? 248 : r.width, bottom: window.innerHeight - r.top + 8 })
                        setIsAccountOpen((o) => !o)
                    }}
                    aria-haspopup="menu"
                    aria-expanded={isAccountOpen}
                    aria-label={isCollapsed ? "Akkaunt menyusi" : undefined}
                    title={isCollapsed ? (displayName ?? "") : undefined}
                    className={`flex items-center rounded-full transition-colors ${isCollapsed ? "self-center p-0.5 mx-auto" : "w-full gap-3 p-1.5 pr-3"} bg-surface ${isAccountOpen ? "" : "hover:bg-surface-sunken-hover"}`}
                >
                    <span className="size-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-accent text-ink-on-accent">
                        {displayAvatar ? (
                            <img src={displayAvatar} alt="" className="w-full h-full object-cover" />
                        ) : displayName ? (
                            <span className="text-sm font-semibold">{userInitials}</span>
                        ) : (
                            <User size={18} />
                        )}
                    </span>
                    {!isCollapsed && (
                        <>
                            <span className="flex flex-col min-w-0 flex-1 text-left">
                                <span className="text-base font-medium text-ink truncate">{displayName ?? "Mehmon"}</span>
                                <span className="text-sm text-ink-muted truncate">{roleLabel}</span>
                            </span>
                            <CaretUpDown size={16} className="text-ink-faint flex-shrink-0" />
                        </>
                    )}
                </button>

                {/* Portal: the glass sidebar (backdrop-filter) would clip a fixed menu inside it.
                    Anchored to the account row: same width, 8px above it. */}
                {isAccountOpen && menuPos && createPortal(
                    <div data-theme={scope} className="text-ink">
                        {/* click-away layer */}
                        <button type="button" aria-hidden="true" tabIndex={-1} onClick={() => setIsAccountOpen(false)} className="fixed inset-0 z-40 cursor-default" />
                        <div role="menu" className="fixed z-50 p-1.5 rounded-menu bg-surface-raised border border-line flex flex-col gap-1"
                            style={{ left: menuPos.left, width: menuPos.width, bottom: menuPos.bottom }}>
                            <button type="button" role="menuitem" onClick={() => { setIsAccountOpen(false); navigate("/sozlamalar") }}
                                className="w-full flex items-center gap-2.5 h-10 px-2.5 rounded-item bg-surface-sunken text-base font-medium text-ink transition-colors hover:bg-surface-sunken-hover">
                                <User size={18} className="text-ink-muted" />
                                <span className="flex-1 text-left">Profilim</span>
                                <CaretRight size={16} className="text-ink-muted" />
                            </button>
                            <div className="px-1 pt-1.5 flex flex-col gap-1.5">
                                <span className="text-sm text-ink-muted">Rejim</span>
                                <div role="radiogroup" aria-label="Rejim" className="grid grid-cols-3 gap-0.5 p-0.5 rounded-control bg-surface-sunken">
                                    {MODES.map((m) => (
                                        <button key={m.id} type="button" role="radio" aria-checked={themeId === m.id} onClick={() => setThemeId(m.id)}
                                            className={`h-7 rounded-item text-sm font-medium transition-colors ${themeId === m.id ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}>
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                                <span className="text-sm text-ink-muted pt-1">Fon rasmi</span>
                                <div role="radiogroup" aria-label="Fon rasmi" className="grid grid-cols-4 gap-1.5">
                                    <button type="button" role="radio" aria-checked={!photo} onClick={() => setPhoto(null)}
                                        className={`h-9 rounded-item bg-surface-sunken text-sm text-ink-muted ${!photo ? "ring-2 ring-[var(--switch-on)]" : "hover:text-ink"}`}>
                                        Yo'q
                                    </button>
                                    {PHOTOS.map((p) => (
                                        <button key={p.id} type="button" role="radio" aria-checked={photo === p.id} aria-label={p.label} title={p.label}
                                            onClick={() => setPhoto(p.id)}
                                            className={`h-9 rounded-item bg-cover bg-center transition-opacity ${photo === p.id ? "ring-2 ring-[var(--switch-on)]" : "hover:opacity-85"}`}
                                            style={{ backgroundImage: `url(${photoThumb(p.id)})` }} />
                                    ))}
                                </div>
                            </div>
                            <div className="h-px bg-line my-1 mx-1" />
                            <button type="button" role="menuitem" onClick={handleSignOut} className={`${accountItem} text-danger-text`}>
                                <SignOut size={18} />
                                Chiqish
                            </button>
                        </div>
                    </div>,
                    document.body,
                )}
            </div>
        </motion.aside>
    )
}
