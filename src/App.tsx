import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Sidebar } from "./components/layout/Sidebar"
import { Dashboard } from "./components/pages/Dashboard"
import { HomeDashboard } from "./components/pages/HomeDashboard"
import { Mijozlar } from "./components/pages/Mijozlar"
import { EventsBoshqaruv } from "./components/pages/EventsBoshqaruv"
import { EventsMoliya } from "./components/pages/EventsMoliya"
import { Sozlamalar } from "./components/pages/Sozlamalar"
import { Hodimlar } from "./components/pages/Hodimlar"
import { HodimDetail } from "./components/pages/HodimDetail"
import { Faollik } from "./components/pages/Faollik"
import { Vazifalar } from "./components/pages/Vazifalar"
import { Integratsiyalar } from "./components/pages/Integratsiyalar"
import { Login } from "./components/pages/Login"
import { ProtectedRoute } from "./components/auth/ProtectedRoute"
import { ThemeProvider } from "./context/ThemeContext"
import { motion, AnimatePresence } from "framer-motion"
import {
  MagnifyingGlass,
  Warning,
} from "@phosphor-icons/react"
import { useAuth } from "./context/AuthContext"


interface PageMeta {
  title: string
  desc: string
}

const PAGE_META: Record<string, PageMeta> = {
  '/dashboard':     { title: 'Dashboard',       desc: "Tizimdagi barcha asosiy ko'rsatkichlar va statistika." },
  '/mijozlar':      { title: 'Mijozlar',        desc: "Barcha mijozlar bazasi va ular bilan ishlash bo'limi." },
  '/vazifalar':     { title: 'Vazifalar',       desc: "Jamoa vazifalari: tadbirlar bo'yicha va shaxsiy." },
  '/tadbirlar/boshqaruv': { title: 'Tadbirlar — Boshqaruv', desc: "Tadbirlar, ishtirokchilar va booklet." },
  '/tadbirlar/moliya':    { title: 'Tadbirlar — Moliya',    desc: "To'lovlar, qarzdorlik va keshbek." },
  '/hodimlar':      { title: 'Hodimlar',        desc: "Tizim foydalanuvchilari va ularning ruxsatnomalari." },
  '/faollik':       { title: 'Faollik tarixi',  desc: "Tizimda kim nima qilgan — to'liq audit jurnali." },
  '/sozlamalar':    { title: 'Sozlamalar',      desc: "Tizim sozlamalari va shaxsiy ma'lumotlarni tahrirlash." },
  '/sozlamalar/integratsiyalar': { title: 'Integratsiyalar', desc: "Telegram guruhlar — bot qaysi guruhda nima qiladi." },
}

function pageMetaFor(pathname: string): PageMeta {
  if (/^\/hodimlar\/[^/]+/.test(pathname)) {
    return { title: 'Xodim tafsilotlari', desc: "Profil, statistika va ruxsatnomalar." }
  }
  return PAGE_META[pathname] ?? { title: '', desc: '' }
}

// ─── Route adapters that turn callback-based pages into router-aware ones ──

// ─── Shell layout (sidebar + header + outlet) ───────────────────────────

/** AmoCRM analytics for the `dashboard` module; everyone else gets the general home page */
function DashboardRoute() {
  const { hasAccess } = useAuth()
  return hasAccess("dashboard") ? <Dashboard /> : <HomeDashboard />
}

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const meta = pageMetaFor(location.pathname)



  return (
    <div className="app-ground h-screen text-ink flex overflow-hidden bg-page">
      <Sidebar />

      {/* Main content panel — a card inset on the page ground, joined to the sidebar by the shared background */}
      <div className="app-main flex-1 flex flex-col my-2 mr-2 overflow-hidden min-w-0 bg-surface rounded-overlay ">
        {/* First login with an admin-issued temporary password */}
        {user?.must_change_password && location.pathname !== "/sozlamalar" && (
          <div role="alert" className="flex items-center gap-3 px-6 py-2.5 bg-danger text-white text-base flex-shrink-0">
            <Warning size={18} className="flex-shrink-0" />
            <span className="flex-1 min-w-0">Siz vaqtincha parol bilan kirdingiz. Xavfsizlik uchun parolingizni o'zgartiring.</span>
            <button
              type="button"
              onClick={() => navigate("/sozlamalar#parol")}
              className="h-control-sm px-3 rounded-control bg-white/15 hover:bg-white/25 font-medium whitespace-nowrap transition-colors"
            >
              Parolni o'zgartirish
            </button>
          </div>
        )}

        {/* Header */}
        <header className="h-16 px-6 flex items-center justify-between gap-6 flex-shrink-0 border-b border-line">
          {/* Left: page title */}
          <div className="flex flex-col min-w-0">
            <h1 className="text-md font-semibold text-ink truncate">{meta.title}</h1>
            <p className="text-sm text-ink-muted truncate">{meta.desc}</p>
          </div>

          {/* Right: Search, Lang, Theme, Settings */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Search */}
            <div className="relative w-[280px]">
              <MagnifyingGlass
                size={16}
               
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
              />
              <input
                type="text"
                placeholder="Tizim bo'ylab qidirish"
                aria-label="Tizim bo'ylab qidirish"
                className="w-full h-control-md rounded-control pl-9 pr-3 text-base text-ink placeholder:text-ink-faint bg-surface-sunken border border-transparent outline-none transition-colors hover:bg-surface-sunken-hover focus:border-line-focus"
              />
            </div>

            {/* Profile — opens Profilim */}
            <button type="button" onClick={() => navigate('/sozlamalar')} aria-label="Profilim" title={user?.full_name ?? "Profilim"}
              className="size-9 shrink-0 rounded-full overflow-hidden bg-mute-soft flex items-center justify-center text-sm font-semibold text-ink transition-opacity hover:opacity-85">
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="" className="size-full object-cover" />
                : (user?.full_name ?? "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
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
            <ProtectedRoute><DashboardRoute /></ProtectedRoute>
          } />

          <Route path="/mijozlar" element={
            <ProtectedRoute module="mijozlar"><Mijozlar /></ProtectedRoute>
          } />

          {/* Every signed-in staff member sees and edits all tasks (066) */}
          <Route path="/vazifalar" element={<Vazifalar />} />

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
            <ProtectedRoute><Sozlamalar /></ProtectedRoute>
          } />
          <Route path="/sozlamalar/integratsiyalar" element={
            <ProtectedRoute module="integratsiyalar"><Integratsiyalar /></ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}

export default App
