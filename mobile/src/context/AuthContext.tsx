/* eslint-disable react-refresh/only-export-components -- useAuth hook is co-located with the AuthProvider component */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase/client"
import { getMyClient, signOut, type ClientRow } from "@/lib/supabase/queries/profile"

interface AuthContextType {
  session: Session | null
  client: ClientRow | null
  loading: boolean
  authError: string | null
  refreshClient: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [client, setClient] = useState<ClientRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const loadClient = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) {
      setClient(null)
      return
    }
    try {
      const row = await getMyClient()
      if (!row) {
        // Staff account or an unlinked user — this app is members-only.
        setAuthError("Bu ilova faqat klub a'zolari uchun")
        await signOut()
        setClient(null)
        return
      }
      setClient(row)
    } catch {
      setClient(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      await loadClient(data.session)
      if (mounted) setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return
        setSession(newSession)
        if (newSession) {
          setAuthError(null)
          void loadClient(newSession)
        } else {
          setClient(null)
        }
      },
    )

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [loadClient])

  const refreshClient = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await loadClient(data.session)
  }, [loadClient])

  return (
    <AuthContext.Provider value={{ session, client, loading, authError, refreshClient }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
