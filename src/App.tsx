import { useState, useEffect } from "react"
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Sidebar } from "./components/layout/Sidebar"
import { Dashboard } from "./components/pages/Dashboard"
import { Mijozlar } from "./components/pages/Mijozlar"
import { CrmN } from "./components/pages/CrmN"
import { EventsBoshqaruv } from "./components/pages/EventsBoshqaruv"
import { EventsMoliya } from "./components/pages/EventsMoliya"
import { Sozlamalar } from "./components/pages/Sozlamalar"
import { Hodimlar } from "./components/pages/Hodimlar"
import { HodimDetail } from "./components/pages/HodimDetail"
import { Bolimlar } from "./components/pages/Bolimlar"
import { Faollik } from "./components/pages/Faollik"
import { Yangiliklar } from "./components/pages/Yangiliklar"
import { Login } from "./components/pages/Login"
import { ProtectedRoute } from "./components/auth/ProtectedRoute"
import { ThemeProvider } from "./context/ThemeContext"
import { ThemeSwitcher } from "./components/ui/ThemeSwitcher"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bell,
  MagnifyingGlass,
  CaretDown,
  Gear,
} from "@phosphor-icons/react"

const LANG_KEY = 'fy_lang'

function getSaved(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch { return fallback }
}

interface PageMeta {
  title: string
  desc: string
}

const PAGE_META: Record<string, PageMeta> = {
  '/dashboard':     { title: 'Dashboard',       desc: "Tizimdagi barcha asosiy ko'rsatkichlar va statistika." },
  '/mijozlar':      { title: 'Mijozlar',        desc: "Barcha mijozlar bazasi va ular bilan ishlash bo'limi." },
  '/sotuv/crm-n':   { title: "Sotuv bo'limi",    desc: 'Savdo jarayonlari va lidlar boshqaruvi.' },
  '/tadbirlar/boshqaruv': { title: 'Tadbirlar — Boshqaruv', desc: "Tadbirlar, ishtirokchilar va booklet." },
  '/tadbirlar/moliya':    { title: 'Tadbirlar — Moliya',    desc: "To'lovlar, qarzdorlik va keshbek." },
  '/hodimlar':      { title: 'Hodimlar',        desc: "Tizim foydalanuvchilari va ularning ruxsatnomalari." },
  '/bolimlar':      { title: "Bo'limlar",       desc: "Tizim bo'limlari va hodimlar boshqaruvi." },
  '/faollik':       { title: 'Faollik tarixi',  desc: "Tizimda kim nima qilgan — to'liq audit jurnali." },
  '/yangiliklar':   { title: 'Yangiliklar',     desc: "Klub yangiliklari — a'zolar mobil ilovada ko'radi." },
  '/sozlamalar':    { title: 'Sozlamalar',      desc: "Tizim sozlamalari va shaxsiy ma'lumotlarni tahrirlash." },
}

function pageMetaFor(pathname: string): PageMeta {
  if (/^\/hodimlar\/[^/]+/.test(pathname)) {
    return { title: 'Xodim tafsilotlari', desc: "Profil, statistika va ruxsatnomalar." }
  }
  return PAGE_META[pathname] ?? { title: '', desc: '' }
}

// ─── Route adapters that turn callback-based pages into router-aware ones ──

// ─── Shell layout (sidebar + header + outlet) ───────────────────────────

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const meta = pageMetaFor(location.pathname)

  const [currentLang, setCurrentLang] = useState(() => getSaved(LANG_KEY, "uz"))
  const [isLangOpen, setIsLangOpen] = useState(false)
  const [isNotifOpen, setIsNotifOpen] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, currentLang) } catch { /* private browsing */ }
  }, [currentLang])

  // Escape closes the header popovers (notifications, language)
  useEffect(() => {
    if (!isNotifOpen && !isLangOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setIsNotifOpen(false); setIsLangOpen(false) }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isNotifOpen, isLangOpen])

  const notifications = [
    { id: 1, title: "Yangi tadbir",       desc: "Biznes nonushta tadbiri yakunlandi.",   time: "2 daqiqa oldin", type: "event",   unread: true },
    { id: 2, title: "To'lov tasdiqlandi", desc: "Mijoz #4412 tomonidan to'lov amalga oshirildi.", time: "1 soat oldin",   type: "payment", unread: true },
    { id: 3, title: "Tizim yangilanishi", desc: "Yangi versiya 2.4.0 muvaffaqiyatli o'rnatildi.",   time: "3 soat oldin",   type: "system",  unread: false },
  ]

  const menuItem = "flex items-start gap-3 px-3 py-2 rounded-item"
  const iconBtn = "relative h-control-md w-9 flex items-center justify-center rounded-control text-ink transition-colors hover:bg-mute-ghost-hover"

  return (
    <div className="h-screen text-ink flex overflow-hidden bg-page">
      <Sidebar />

      {/* Main content panel — a card inset on the page ground, joined to the sidebar by the shared background */}
      <div className="flex-1 flex flex-col my-2 mr-2 overflow-hidden min-w-0 bg-surface rounded-overlay ">
        {/* Header */}
        <header className="mx-3 mt-3 h-14 px-4 flex items-center justify-between gap-6 flex-shrink-0 rounded-surface border border-line">
          {/* Left: page title */}
          <div className="flex flex-col min-w-0">
            <h1 className="text-md font-semibold text-ink truncate">{meta.title}</h1>
            <p className="text-sm text-ink-muted truncate">{meta.desc}</p>
          </div>

          {/* Right: Search, Notif, Lang, Theme, Settings */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Search */}
            <div className="relative w-[280px]">
              <MagnifyingGlass
                size={16}
                weight="bold"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
              />
              <input
                type="text"
                placeholder="Tizim bo'ylab qidirish"
                aria-label="Tizim bo'ylab qidirish"
                className="w-full h-control-md rounded-control pl-9 pr-3 text-base text-ink placeholder:text-ink-faint bg-surface-sunken border border-transparent outline-none transition-colors hover:bg-surface-sunken-hover focus:border-line-focus"
              />
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                aria-label="Bildirishnomalar"
                aria-haspopup="true"
                aria-expanded={isNotifOpen}
                className={`${iconBtn} ${isNotifOpen ? "bg-mute-ghost-hover" : ""}`}
              >
                <Bell size={20} weight="bold" />
                <span className="absolute top-2 right-2 size-2 rounded-full bg-danger" />
              </button>

              <AnimatePresence>
                {isNotifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
                    className="absolute top-full right-0 mt-2 w-[320px] rounded-menu bg-surface-raised border border-line overflow-hidden z-50 origin-top-right"
                  >
                    <div className="px-4 h-11 flex items-center border-b border-line">
                      <span className="text-base font-semibold text-ink">Bildirishnomalar</span>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto no-scrollbar p-1">
                      {notifications.map((notif) => (
                        <div key={notif.id} className={menuItem}>
                          <span className={`mt-1.5 size-2 rounded-full flex-shrink-0 ${notif.unread ? "bg-accent" : "bg-mute-soft"}`} />
                          <span className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-base font-medium text-ink">{notif.title}</span>
                            <span className="text-sm text-ink-muted line-clamp-1">{notif.desc}</span>
                            <span className="text-xs text-ink-faint">{notif.time}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Language */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsLangOpen(!isLangOpen)}
                aria-label="Tilni tanlash"
                aria-haspopup="true"
                aria-expanded={isLangOpen}
                className="h-control-md flex items-center gap-1.5 px-3 rounded-control bg-mute-soft text-ink transition-colors hover:bg-mute-soft-hover"
              >
                <span className="text-base font-medium uppercase">{currentLang}</span>
                <CaretDown
                  size={14}
                  weight="bold"
                  className={`text-ink-muted transition-transform ${isLangOpen ? 'rotate-180' : ''}`}
                />
              </button>
              <AnimatePresence>
                {isLangOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
                    className="absolute top-full right-0 mt-2 w-[96px] p-1 rounded-menu bg-surface-raised border border-line z-50"
                  >
                    {['uz', 'ru', 'en'].map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        aria-pressed={currentLang === lang}
                        onClick={() => { setCurrentLang(lang); setIsLangOpen(false) }}
                        className={`w-full h-control-sm px-3 rounded-item text-base font-medium text-left uppercase transition-colors ${currentLang === lang ? "bg-surface-sunken text-ink" : "text-ink-muted hover:bg-mute-ghost-hover hover:text-ink"}`}
                      >
                        {lang}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme switcher */}
            <ThemeSwitcher />

            {/* Settings */}
            <button type="button" onClick={() => navigate('/sozlamalar')} aria-label="Sozlamalar" className={iconBtn}>
              <Gear size={20} weight="bold" />
            </button>
          </div>
        </header>

        {/* Main scroll area */}
        <main className="flex-1 px-6 pt-6 pb-5 overflow-y-auto no-scrollbar relative">
          <div className="max-w-[1400px] mx-auto h-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
                className="h-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* All routes below sit inside ProtectedRoute → AppShell */}
        <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route path="/dashboard" element={
            <ProtectedRoute module="dashboard"><Dashboard /></ProtectedRoute>
          } />

          <Route path="/sotuv/crm-n" element={
            <ProtectedRoute module="sotuv-crmn"><CrmN /></ProtectedRoute>
          } />

          <Route path="/mijozlar" element={
            <ProtectedRoute module="mijozlar"><Mijozlar /></ProtectedRoute>
          } />

          <Route path="/tadbirlar" element={<Navigate to="/tadbirlar/boshqaruv" replace />} />

          <Route path="/tadbirlar/boshqaruv" element={
            <ProtectedRoute module="tadbirlar"><EventsBoshqaruv /></ProtectedRoute>
          } />

          <Route path="/tadbirlar/moliya" element={
            <ProtectedRoute module="tadbirlar-moliya"><EventsMoliya /></ProtectedRoute>
          } />

          <Route path="/hodimlar" element={
            <ProtectedRoute adminOnly><Hodimlar /></ProtectedRoute>
          } />
          <Route path="/hodimlar/:id" element={
            <ProtectedRoute adminOnly><HodimDetail /></ProtectedRoute>
          } />
          <Route path="/bolimlar" element={
            <ProtectedRoute adminOnly><Bolimlar /></ProtectedRoute>
          } />
          <Route path="/faollik" element={
            <ProtectedRoute adminOnly><Faollik /></ProtectedRoute>
          } />
          <Route path="/yangiliklar" element={
            <ProtectedRoute adminOnly><Yangiliklar /></ProtectedRoute>
          } />

          <Route path="/sozlamalar" element={
            <ProtectedRoute module="sozlamalar"><Sozlamalar /></ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}

export default App
