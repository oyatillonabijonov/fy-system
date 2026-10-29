import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useLocation, useNavigate } from "react-router-dom"
import { House, CheckCircle, Funnel, Users, Bank, DotsThreeOutline, CaretRight, SignOut } from "@phosphor-icons/react"
import type { Icon as PhosphorIcon } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useTheme, MODES } from "@/context/ThemeContext"
import { signOut, type ModuleName } from "@/lib/supabase/queries/auth"
import { navigationSections, type NavItem } from "./nav"

/** The five sections staff open most on a phone; everything else sits behind "Yana" */
const TABS: { label: string; icon: PhosphorIcon; path: string; module?: ModuleName }[] = [
  { label: "Bosh sahifa", icon: House, path: "/dashboard" },
  { label: "Vazifalar", icon: CheckCircle, path: "/vazifalar" },
  { label: "Sotuv", icon: Funnel, path: "/sotuv", module: "sotuv-crmn" },
  { label: "Mijozlar", icon: Users, path: "/mijozlar", module: "mijozlar" },
  { label: "Moliya", icon: Bank, path: "/tadbirlar/moliya", module: "tadbirlar-moliya" },
]

const initials = (name?: string | null) =>
  (name ?? "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")

/** Phone/tablet navigation (below lg): a plain tab bar pinned to the bottom + the "Yana" sheet */
export function MobileNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, hasAccess } = useAuth()
  const isAdmin = user?.role === "admin"
  const [moreFor, setMoreFor] = useState<string | null>(null)   // the sheet belongs to the page it was opened on
  const moreOpen = moreFor === location.pathname

  const tabs = TABS.filter((t) => !t.module || hasAccess(t.module))
  const visible = (i: NavItem) => (i.adminOnly ? isAdmin : !i.module || hasAccess(i.module))
  // every other page the user may open, flattened from the sidebar's sections
  const rest = navigationSections.flatMap((s) => s.items).flatMap((i) => (i.subItems?.length ? [i, ...i.subItems] : [i]))
    .filter((i) => i.path && visible(i) && !tabs.some((t) => t.path === i.path))
    .filter((i, n, all) => all.findIndex((o) => o.path === i.path) === n)

  const active = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/")
  const moreActive = !tabs.some((t) => active(t.path))

  return (
    <>
      <nav aria-label="Asosiy menyu" className="tabbar fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="grid h-14" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const on = active(t.path)
            return (
              <button key={t.path} type="button" onClick={() => navigate(t.path)} aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-1 min-w-0 ${on ? "text-ink" : "text-ink-faint"}`}>
                <t.icon size={24} weight={on ? "fill" : "light"} />
                <span className="text-[11px] leading-none font-medium truncate max-w-full px-0.5">{t.label}</span>
              </button>
            )
          })}
          <button type="button" onClick={() => setMoreFor(location.pathname)} aria-haspopup="dialog" aria-expanded={moreOpen}
            className={`flex flex-col items-center justify-center gap-1 ${moreActive || moreOpen ? "text-ink" : "text-ink-faint"}`}>
            <DotsThreeOutline size={24} weight={moreActive || moreOpen ? "fill" : "light"} />
            <span className="text-[11px] leading-none font-medium">Yana</span>
          </button>
        </div>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreFor(null)} items={rest} />
    </>
  )
}

function MoreSheet({ open, onClose, items }: { open: boolean; onClose: () => void; items: NavItem[] }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { themeId, setThemeId } = useTheme()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])
  const role = user?.role === "admin" ? "Administrator" : user?.role === "manager" ? "Menejer" : "Xodim"

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end">
          <motion.button type="button" aria-label="Yopish" onClick={onClose} className="absolute inset-0 bg-surface-overlay cursor-default"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />
          <motion.div role="dialog" aria-modal="true" aria-label="Yana"
            className="relative w-full max-h-[85dvh] overflow-y-auto no-scrollbar rounded-t-[20px] bg-surface-raised px-4 pt-2 pb-[calc(16px+env(safe-area-inset-bottom))] text-ink"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}>
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-mute-soft" />

            <button type="button" onClick={() => { onClose(); navigate("/sozlamalar") }}
              className="w-full flex items-center gap-3 p-3 rounded-surface bg-surface-sunken text-left">
              <span className="size-11 shrink-0 rounded-full overflow-hidden bg-accent text-ink-on-accent flex items-center justify-center text-base font-semibold">
                {user?.avatar_url ? <img src={user.avatar_url} alt="" className="size-full object-cover" /> : initials(user?.full_name)}
              </span>
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-base font-semibold truncate">{user?.full_name ?? "Profilim"}</span>
                <span className="text-sm text-ink-muted truncate">{role} · Profilim</span>
              </span>
              <CaretRight size={16} className="text-ink-faint shrink-0" />
            </button>

            {items.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {items.map((i) => (
                  <button key={i.path} type="button" onClick={() => { onClose(); if (i.path) navigate(i.path) }}
                    className="h-[84px] flex flex-col items-center justify-center gap-2 rounded-surface bg-surface-sunken px-1">
                    <i.icon size={24} weight="light" />
                    <span className="text-sm font-medium leading-tight text-center line-clamp-2">{i.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              <span className="text-sm text-ink-muted px-1">Rejim</span>
              <div role="radiogroup" aria-label="Rejim" className="grid grid-cols-3 gap-0.5 p-0.5 rounded-control bg-surface-sunken">
                {MODES.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={themeId === m.id} onClick={() => setThemeId(m.id)}
                    className={`h-9 rounded-item text-sm font-medium transition-colors ${themeId === m.id ? "bg-surface text-ink" : "text-ink-muted"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <button type="button" onClick={async () => { await signOut(); navigate("/login", { replace: true }) }}
              className="mt-4 w-full h-11 flex items-center justify-center gap-2 rounded-full bg-surface-sunken text-base font-medium text-danger-text">
              <SignOut size={18} /> Chiqish
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
