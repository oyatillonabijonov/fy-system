import { Navigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { ThinkingOrb } from "thinking-orbs"
import { WifiSlash } from "@phosphor-icons/react"
import type { ModuleName } from "@/lib/supabase/queries/auth"

interface ProtectedRouteProps {
  children: React.ReactNode
  module?: ModuleName
  adminOnly?: boolean
}

function NoAccessScreen({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-[60px] mb-4">🔒</div>
        <h1 className="text-lg font-bold text-ink mb-2">Ruxsat yo'q</h1>
        <p className="text-base text-ink-muted">
          {message ?? "Bu bo'limga kirish uchun administrator sizga ruxsat berishi kerak."}
        </p>
      </div>
    </div>
  )
}

/** The server couldn't be asked who is signed in. Not the login page: the session is still in the
 *  browser, and AuthContext keeps retrying — the app opens by itself when the connection is back. */
function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <span className="size-16 rounded-full bg-surface-sunken flex items-center justify-center text-ink"><WifiSlash size={32} weight="thin" /></span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold text-ink">Serverga ulanib bo'lmadi</h1>
          <p className="text-base text-ink-muted">Internet aloqasini tekshiring. Aloqa tiklanishi bilan sahifa o'zi ochiladi, qayta kirish shart emas.</p>
        </div>
        <button type="button" onClick={onRetry} className="h-control-md px-5 rounded-full bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover transition-colors whitespace-nowrap">Qayta urinish</button>
      </div>
    </div>
  )
}

export function ProtectedRoute({ children, module, adminOnly }: ProtectedRouteProps) {
  const { user, loading, offline, retry, hasAccess, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ThinkingOrb state="working" size={64} theme="light" />
      </div>
    )
  }

  if (!user && offline) {
    return <OfflineScreen onRetry={retry} />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && !isAdmin) {
    return <NoAccessScreen message="Bu bo'lim faqat administratorlar uchun" />
  }

  if (module && !hasAccess(module)) {
    return <NoAccessScreen />
  }

  return <>{children}</>
}
