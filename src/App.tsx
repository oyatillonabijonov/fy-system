import { useState, useEffect } from "react"
import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom"
import { Sidebar } from "./components/layout/Sidebar"
import { Dashboard } from "./components/pages/Dashboard"
import { Mijozlar } from "./components/pages/Mijozlar"
import { CrmN } from "./components/pages/CrmN"
import { EventsBoshqaruv } from "./components/pages/EventsBoshqaruv"
import { EventsMoliya } from "./components/pages/EventsMoliya"
import { Sozlamalar } from "./components/pages/Sozlamalar"
import { Hodimlar } from "./components/pages/Hodimlar"
import { HodimDetail } from "./components/pages/HodimDetail"
import { Faollik } from "./components/pages/Faollik"
import { Login } from "./components/pages/Login"
import { ProtectedRoute } from "./components/auth/ProtectedRoute"
import { ThemeProvider } from "./context/ThemeContext"
import { ThemeSwitcher } from "./components/ui/ThemeSwitcher"
import { motion, AnimatePresence } from "framer-motion"
import {
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
  '/faollik':       { title: 'Faollik tarixi',  desc: "Tizimda kim nima qilgan — to'liq audit jurnali." },
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
  const meta = pageMetaFor(location.pathname)

  const [currentLang, setCurrentLang] = useState(() => getSaved(LANG_KEY, "uz"))
  const [isLangOpen, setIsLangOpen] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, currentLang) } catch { /* private browsing */ }
  }, [currentLang])

  // Escape closes the language popover
  useEffect(() => {
    if (!isLangOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsLangOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isLangOpen])

  return (
    <div className="h-screen text-foreground flex overflow-hidden transition-colors duration-300"
      style={{ background: 'var(--sidebar-bg)' }}>
      <Sidebar />

      {/* Main content panel */}
      <div
        className="flex-1 flex flex-col h-screen overflow-hidden rounded-none relative z-10 transition-colors duration-300"
        style={{ background: 'var(--main-bg)' }}
      >
        <div className="flex-1 flex flex-col relative min-h-0">

          {/* Header */}
          <header
            className="px-[24px] pt-[15px] pb-[15px] flex-shrink-0 transition-colors duration-300"
            style={{ borderBottom: '1px solid var(--header-border)' }}
          >
            <div
              className="h-[54px] apple-sq-12 flex items-center justify-between px-[16px]"
              style={{ background: 'var(--header-bg)' }}
            >
              {/* Left: page title */}
              <div className="flex flex-col gap-[4px]">
                <div className="text-[20px] font-bold leading-tight" style={{ color: 'var(--header-text)' }}>
                  {meta.title}
                </div>
                <div className="text-[12px] font-medium leading-tight" style={{ color: 'var(--header-muted)' }}>
                  {meta.desc}
                </div>
              </div>

              {/* Right: Search, Lang, Theme, Settings */}
              <div className="flex items-center gap-[12px]">

                {/* Search */}
                <div className="relative w-[320px]">
                  <MagnifyingGlass
                    size={20}
                    className="absolute left-[12px] top-1/2 -translate-y-1/2"
                    weight="bold"
                    style={{ color: 'var(--header-muted)' }}
                  />
                  <input
                    type="text"
                    placeholder="Tizim bo'ylab qidirish..."
                    aria-label="Tizim bo'ylab qidirish"
                    className="w-full border border-transparent focus:border-[var(--header-text)] rounded-[8px] py-[10px] pl-[40px] pr-[16px] text-sm focus:ring-0 outline-none transition-colors"
                    style={{
                      background: 'var(--header-input-bg)',
                      color: 'var(--header-text)',
                    }}
                  />
                </div>

                {/* Language */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsLangOpen(!isLangOpen)}
                    aria-label="Tilni tanlash"
                    aria-haspopup="true"
                    aria-expanded={isLangOpen}
                    className="flex items-center gap-[6px] px-3 py-2 rounded-[8px] cursor-pointer transition-colors"
                    style={{ background: 'var(--header-input-bg)', color: 'var(--header-text)' }}
                  >
                    <span className="text-sm font-semibold uppercase">{currentLang}</span>
                    <CaretDown
                      size={16}
                      weight="bold"
                      className={`transition-transform duration-200 ${isLangOpen ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--header-muted)' }}
                    />
                  </button>
                  <AnimatePresence>
                    {isLangOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full right-0 mt-2 w-[80px] rounded-[8px] shadow-lg overflow-hidden z-50"
                        style={{ background: 'var(--dropdown-bg)', border: '1px solid var(--dropdown-border)' }}
                      >
                        {['uz', 'ru', 'en'].map((lang) => (
                          <button
                            type="button"
                            key={lang}
                            onClick={() => { setCurrentLang(lang); setIsLangOpen(false) }}
                            aria-pressed={currentLang === lang}
                            className="w-full px-4 py-2 text-sm font-medium transition-colors text-left uppercase"
                            style={{
                              color: currentLang === lang ? 'var(--accent)' : 'var(--dropdown-text)',
                              background: currentLang === lang ? 'var(--dropdown-active-bg)' : 'transparent',
                            }}
                            onMouseEnter={e => {
                              if (currentLang !== lang) (e.currentTarget as HTMLElement).style.background = 'var(--dropdown-hover-bg)'
                            }}
                            onMouseLeave={e => {
                              if (currentLang !== lang) (e.currentTarget as HTMLElement).style.background = 'transparent'
                            }}
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
                <button
                  type="button"
                  aria-label="Sozlamalar"
                  className="p-2 rounded-[8px] transition-colors"
                  style={{ color: 'var(--header-icon)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--header-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <Gear size={24} weight="bold" />
                </button>
              </div>
            </div>
          </header>

          {/* Main scroll area */}
          <main className="flex-1 px-[16px] pt-[32px] pb-[20px] overflow-y-auto no-scrollbar relative"
            style={{ background: 'var(--main-bg)' }}>
            <div className="max-w-[1400px] mx-auto h-full">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="h-full"
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
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
          <Route path="/faollik" element={
            <ProtectedRoute adminOnly><Faollik /></ProtectedRoute>
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
