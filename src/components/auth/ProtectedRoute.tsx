import { Navigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
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
        <h1 className="text-[20px] font-bold text-[#141414] mb-2">Ruxsat yo'q</h1>
        <p className="text-[13px] text-[#999]">
          {message ?? "Bu bo'limga kirish uchun administrator sizga ruxsat berishi kerak."}
        </p>
      </div>
    </div>
  )
}

export function ProtectedRoute({ children, module, adminOnly }: ProtectedRouteProps) {
  const { user, loading, hasAccess, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[14px] text-[#999]">Yuklanmoqda...</div>
      </div>
    )
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
