import { useState, useEffect } from "react"
import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom"
import { Sidebar } from "./components/layout/Sidebar"
import { Dashboard } from "./components/pages/Dashboard"
import { Mijozlar } from "./components/pages/Mijozlar"
import { CrmN } from "./components/pages/CrmN"
import { Events } from "./components/pages/Events"
import { Sozlamalar } from "./components/pages/Sozlamalar"
import { Hodimlar } from "./components/pages/Hodimlar"
import { HodimDetail } from "./components/pages/HodimDetail"
import { Bolimlar } from "./components/pages/Bolimlar"
import { Faollik } from "./components/pages/Faollik"
import { Yangiliklar } from "./components/pages/Yangiliklar"
import { Pbx } from "./components/pages/Pbx"
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
  '/tadbirlar':     { title: 'Tadbirlar',       desc: "Klub doirasidagi barcha tadbirlar va uchrashuvlar." },
  '/pbx':           { title: 'IP Telefoniya',   desc: "Onlayn ATS integratsiyasi va qo'ng'iroqlar tarixi." },
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
  const meta = pageMetaFor(location.pathname)

  const [currentLang, setCurrentLang] = useState(() => getSaved(LANG_KEY, "uz"))
  const [isLangOpen, setIsLangOpen] = useState(false)
  const [isNotifOpen, setIsNotifOpen] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, currentLang) } catch { /* private browsing */ }
  }, [currentLang])

  const notifications = [
    { id: 1, title: "Yangi tadbir",       desc: "Biznes nonushta tadbiri yakunlandi.",   time: "2 daqiqa oldin", type: "event",   unread: true },
    { id: 2, title: "To'lov tasdiqlandi", desc: "Mijoz #4412 tomonidan to'lov amalga oshirildi.", time: "1 soat oldin",   type: "payment", unread: true },
    { id: 3, title: "Tizim yangilanishi", desc: "Yangi versiya 2.4.0 muvaffaqiyatli o'rnatildi.",   time: "3 soat oldin",   type: "system",  unread: false },
  ]

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

              {/* Right: Search, Notif, Lang, Theme, Settings */}
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
                    className="w-full border-none rounded-[8px] py-[10px] pl-[40px] pr-[16px] text-sm focus:ring-0 outline-none transition-colors"
                    style={{
                      background: 'var(--header-input-bg)',
                      color: 'var(--header-text)',
                    }}
                  />
                </div>

                {/* Notifications */}
                <div className="relative">
                  <button
                    onClick={() => setIsNotifOpen(!isNotifOpen)}
                    className="relative p-2 rounded-[8px] transition-colors"
                    style={{ background: isNotifOpen ? 'var(--header-hover)' : 'transparent' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--header-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isNotifOpen ? 'var(--header-hover)' : 'transparent'}
                  >
                    <Bell size={24} weight="bold" style={{ color: 'var(--header-icon)' }} />
                    <span className="absolute top-[8px] right-[8px] w-[10px] h-[10px] bg-[#FF3B30] border-2 rounded-full"
                      style={{ borderColor: 'var(--main-bg)' }}></span>
                  </button>

                  <AnimatePresence>
                    {isNotifOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        className="absolute top-full right-0 mt-2 w-[300px] rounded-[8px] shadow-[0_10px_40px_rgba(0,0,0,0.12)] overflow-hidden z-50 origin-top-right"
                        style={{
                          background: 'var(--dropdown-bg)',
                          border: '1px solid var(--dropdown-border)',
                        }}
                      >
                        <div className="px-4 py-3 flex items-center justify-between"
                          style={{ borderBottom: '1px solid var(--dropdown-border)' }}>
                          <span className="text-[14px] font-bold" style={{ color: 'var(--dropdown-text)' }}>
                            Bildirishnomalar
                          </span>
                          <div className="w-2 h-2 bg-[#FF3B30] rounded-full shadow-[0_0_8px_rgba(255,59,48,0.4)]" />
                        </div>
                        <div className="max-h-[360px] overflow-y-auto no-scrollbar py-1">
                          {notifications.map((notif) => (
                            <div
                              key={notif.id}
                              className="px-4 py-2.5 flex items-start gap-3 cursor-pointer transition-colors"
                              style={{ color: 'var(--dropdown-text)' }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--dropdown-hover-bg)'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                            >
                              <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${notif.unread ? '' : 'border'}`}
                                style={{
                                  background: notif.unread ? 'var(--accent)' : 'transparent',
                                  borderColor: 'var(--dropdown-border)',
                                }} />
                              <div className="flex flex-col gap-0.5 overflow-hidden">
                                <div className="text-[12px] font-bold leading-tight">{notif.title}</div>
                                <div className="text-[11px] line-clamp-1 leading-tight" style={{ color: 'var(--dropdown-muted)' }}>{notif.desc}</div>
                                <div className="text-[10px] mt-0.5" style={{ color: 'var(--dropdown-muted)', opacity: 0.7 }}>{notif.time}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          className="w-full py-2.5 text-[11px] font-bold transition-colors"
                          style={{ borderTop: '1px solid var(--dropdown-border)', color: 'var(--dropdown-muted)' }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.background = 'var(--dropdown-hover-bg)'
                              ; (e.currentTarget as HTMLElement).style.color = 'var(--dropdown-text)'
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = 'transparent'
                              ; (e.currentTarget as HTMLElement).style.color = 'var(--dropdown-muted)'
                          }}
                        >
                          Barchasini ko'rish
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Language */}
                <div className="relative">
                  <button
                    onClick={() => setIsLangOpen(!isLangOpen)}
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
                            key={lang}
                            onClick={() => { setCurrentLang(lang); setIsLangOpen(false) }}
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

          <Route path="/tadbirlar" element={
            <ProtectedRoute module="tadbirlar"><Events /></ProtectedRoute>
          } />

          <Route path="/pbx" element={
            <ProtectedRoute module="pbx"><Pbx /></ProtectedRoute>
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
