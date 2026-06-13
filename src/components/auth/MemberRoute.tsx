import { useEffect } from "react"
import { Navigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"

interface MemberRouteProps {
  children: React.ReactNode
}

export function MemberRoute({ children }: MemberRouteProps) {
  const { isMember, loading } = useAuth()

  // Force member theme on HTML element while in member portal
  useEffect(() => {
    if (!loading && isMember) {
      document.documentElement.setAttribute("data-theme", "member")
      return () => {
        // Restore saved theme on unmount
        const saved = localStorage.getItem("fy_theme") ?? "neutral"
        document.documentElement.setAttribute("data-theme", saved)
      }
    }
  }, [isMember, loading])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[14px] text-[#999]">Yuklanmoqda...</div>
      </div>
    )
  }

  if (!isMember) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
