/* eslint-disable react-refresh/only-export-components -- useAuth hook is co-located with the AuthProvider component */
import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react"
import { supabase } from "../lib/supabase/client"
import {
  getCurrentProfile,
  getCurrentPermissions,
  getCurrentMemberClient,
  type UserProfile,
  type UserPermission,
  type ModuleName,
  type MemberClient,
} from "../lib/supabase/queries/auth"

interface AuthContextType {
  user: UserProfile | null
  memberClient: MemberClient | null
  isMember: boolean
  permissions: UserPermission[]
  loading: boolean
  isAdmin: boolean
  hasAccess: (module: ModuleName) => boolean
  canEdit: (module: ModuleName) => boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [memberClient, setMemberClient] = useState<MemberClient | null>(null)
  const [permissions, setPermissions] = useState<UserPermission[]>([])
  const [loading, setLoading] = useState(true)
  // Tracks the currently-loaded user id so we can ignore SIGNED_IN echoes
  // that Supabase fires every time the tab regains focus.
  const currentUserIdRef = useRef<string | null>(null)

  const loadUser = useCallback(async () => {
    setLoading(true)
    try {
      const profile = await getCurrentProfile()
      setUser(profile)
      currentUserIdRef.current = profile?.id ?? null
      if (profile) {
        const perms = await getCurrentPermissions()
        setPermissions(perms)
        setMemberClient(null)
      } else {
        setPermissions([])
        const mc = await getCurrentMemberClient()
        setMemberClient(mc)
        if (mc) currentUserIdRef.current = mc.auth_user_id
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUser()

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      const newUserId = session?.user?.id ?? null

      if (event === "SIGNED_OUT") {
        currentUserIdRef.current = null
        void loadUser()
        return
      }

      if (event === "USER_UPDATED") {
        void loadUser()
        return
      }

      if (event === "SIGNED_IN") {
        // Only reload if this is a genuine sign-in (different user), not a
        // tab-refocus echo. Supabase fires SIGNED_IN every visibility change
        // when the session is still valid.
        if (newUserId !== currentUserIdRef.current) {
          currentUserIdRef.current = newUserId
          void loadUser()
        }
        return
      }

      // Ignore: TOKEN_REFRESHED, INITIAL_SESSION, PASSWORD_RECOVERY, MFA_CHALLENGE_VERIFIED
    })

    return () => subscription.subscription.unsubscribe()
  }, [loadUser])

  const isAdmin = user?.role === "admin"
  const isMember = memberClient !== null

  const hasAccess = useCallback(
    (module: ModuleName): boolean => {
      if (!user) return false
      if (user.role === "admin") return true
      return permissions.some((p) => p.module === module && p.can_view)
    },
    [user, permissions],
  )

  const canEdit = useCallback(
    (module: ModuleName): boolean => {
      if (!user) return false
      if (user.role === "admin") return true
      return permissions.some((p) => p.module === module && p.can_edit)
    },
    [user, permissions],
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        memberClient,
        isMember,
        permissions,
        loading,
        isAdmin,
        hasAccess,
        canEdit,
        refreshProfile: loadUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
