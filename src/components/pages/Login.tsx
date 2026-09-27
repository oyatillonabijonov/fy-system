import { useId, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { Eye, EyeSlash, ArrowRight } from "@phosphor-icons/react"
import { signIn } from "@/lib/supabase/queries/auth"
import { useAuth } from "@/context/AuthContext"
import { useTheme } from "@/context/ThemeContext"

export function Login() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { themeId } = useTheme()

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

      <div className="relative z-10 w-full max-w-[400px]">
        <div className="bg-surface border border-line rounded-overlay p-8 flex flex-col gap-7">
          <div className="flex flex-col items-center gap-5 text-center">
            <img
              src={themeId === "dark" ? "/Sidebar/Logo-white.svg" : "/Sidebar/Logo.svg"}
              alt="Fikr Yetakchilari"
              className="h-8 w-auto"
            />
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold text-ink">Tizimga kirish</h1>
              <p className="text-base text-ink-muted">Ish hisobingiz email va paroli bilan kiring</p>
            </div>
          </div>

          <LoginForm onSuccess={() => navigate("/dashboard", { replace: true })} />
        </div>

        <p className="text-center text-sm text-ink-muted mt-5">
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
        <label htmlFor={emailId} className="text-sm font-medium text-ink mb-1.5 block">Email</label>
        <input
          id={emailId}
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          required autoFocus placeholder="email@example.com"
          className="w-full h-control-lg px-3.5 bg-surface-sunken border border-transparent rounded-control text-base text-ink placeholder:text-ink-faint hover:bg-surface-sunken-hover focus:border-line-focus outline-none transition-colors"
        />
      </div>

      <div>
        <label htmlFor={passwordId} className="text-sm font-medium text-ink mb-1.5 block">Parol</label>
        <div className="relative">
          <input
            id={passwordId}
            type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
            required placeholder="••••••••"
            className="w-full h-control-lg px-3.5 pr-11 bg-surface-sunken border border-transparent rounded-control text-base text-ink placeholder:text-ink-faint hover:bg-surface-sunken-hover focus:border-line-focus outline-none transition-colors"
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 size-8 rounded-item flex items-center justify-center text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors" tabIndex={-1}>
            {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="px-3.5 py-2.5 bg-danger-soft rounded-control text-sm text-danger-text font-medium">{error}</div>
      )}

      <button type="submit" disabled={loading}
        className="w-full h-control-lg mt-1 bg-accent text-ink-on-accent rounded-control text-base font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 group">
        {loading ? (
          <><span className="w-4 h-4 border-2 border-ink-on-accent/30 border-t-ink-on-accent rounded-full animate-spin" />Kirilmoqda...</>
        ) : (
          <>Kirish<ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" /></>
        )}
      </button>

      <p className="text-sm text-ink-faint text-center">Parolni unutdingizmi? Administratorga murojaat qiling</p>
    </form>
  )
}
