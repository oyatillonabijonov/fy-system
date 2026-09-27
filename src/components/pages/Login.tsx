import { useId, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { Eye, EyeSlash, ArrowRight } from "@phosphor-icons/react"
import { signIn } from "@/lib/supabase/queries/auth"
import { useAuth } from "@/context/AuthContext"

export function Login() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()

  if (!authLoading && user) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Gradient mesh background */}
      <div className="absolute inset-0 bg-gradient-to-br from-page-subtle via-page to-page-subtle" />

      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-40 blur-[100px] animate-blob"
          style={{ background: "radial-gradient(circle, #635BFF 0%, #00D4FF 100%)", animationDelay: "0s" }} />
        <div className="absolute -top-20 -right-20 w-[500px] h-[500px] rounded-full opacity-35 blur-[100px] animate-blob"
          style={{ background: "radial-gradient(circle, #FF6B9D 0%, #FFA06B 100%)", animationDelay: "2s" }} />
        <div className="absolute -bottom-32 -left-20 w-[550px] h-[550px] rounded-full opacity-30 blur-[100px] animate-blob"
          style={{ background: "radial-gradient(circle, #00D4A8 0%, #00B4D8 100%)", animationDelay: "4s" }} />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full opacity-30 blur-[100px] animate-blob"
          style={{ background: "radial-gradient(circle, #FFD93D 0%, #FF6B35 100%)", animationDelay: "6s" }} />
      </div>

      <div className="relative z-10 w-full max-w-[420px]">
        <div
          className="bg-surface-raised rounded-overlay p-10 "
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img src="/Sidebar/Logo.svg" alt="Fikr Yetakchilari" className="h-10 w-auto mb-4" />
          </div>

          <LoginForm onSuccess={() => navigate("/dashboard", { replace: true })} />
        </div>

        <p className="text-center text-xs text-ink-muted mt-6 tracking-tight">
          © 2026 Fikr Yetakchilari · Biznes Klub
        </p>
      </div>
    </div>
  )
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const emailId = useId()
  const passwordId = useId()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await signIn(email, password)
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      setError(msg === "Invalid login credentials" ? "Email yoki parol noto'g'ri" : "Xatolik yuz berdi")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor={emailId} className="text-sm font-semibold text-ink mb-1.5 block tracking-tight">Email</label>
        <input
          id={emailId}
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          required autoFocus placeholder="email@example.com"
          className="w-full px-4 py-3 bg-surface border border-line rounded-control text-md text-ink placeholder:text-ink-faint focus:border-line-focus outline-none transition-all"
        />
      </div>

      <div>
        <label htmlFor={passwordId} className="text-sm font-semibold text-ink mb-1.5 block tracking-tight">Parol</label>
        <div className="relative">
          <input
            id={passwordId}
            type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
            required placeholder="••••••••"
            className="w-full px-4 py-3 pr-12 bg-surface border border-line rounded-control text-md text-ink placeholder:text-ink-faint focus:border-line-focus outline-none transition-all"
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-ink-muted hover:text-ink transition-colors" tabIndex={-1}>
            {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3.5 py-2.5 bg-danger-soft border border-danger-soft rounded-control text-sm text-danger-dark font-medium">{error}</div>
      )}

      <button type="submit" disabled={loading}
        className="w-full py-3 mt-2 bg-accent text-ink-on-accent rounded-control text-md font-bold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
        style={{ letterSpacing: "-0.3px" }}>
        {loading ? (
          <><span className="w-4 h-4 border-2 border-ink-on-accent/30 border-t-ink-on-accent rounded-full animate-spin" />Kirilmoqda...</>
        ) : (
          <>Kirish<ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" /></>
        )}
      </button>

      <div className="pt-2 border-t border-line text-center">
        <p className="text-xs text-ink-muted">Yordam kerak? Administrator bilan bog'laning</p>
      </div>
    </form>
  )
}
