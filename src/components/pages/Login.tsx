import { useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { Eye, EyeSlash, ArrowRight } from "@phosphor-icons/react"
import { signIn, selfRegisterMember } from "@/lib/supabase/queries/auth"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase/client"

// Google OAuth always goes through member callback — staff use email/password only.
async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/member-callback`,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  })
}

type Tab = "login" | "register"

export function Login() {
  const navigate = useNavigate()
  const { user, isMember, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<Tab>("login")

  // Already signed in → redirect
  if (!authLoading && user) return <Navigate to="/dashboard" replace />
  if (!authLoading && isMember) return <Navigate to="/member/events" replace />

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Gradient mesh background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FAFAFA] via-white to-[#F5F5F5]" />

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
          className="bg-white/95 backdrop-blur-xl rounded-[16px] p-10 border border-white/60"
          style={{ boxShadow: "0 20px 60px -10px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255,255,255,0.5)" }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <img src="/Sidebar/Logo.svg" alt="Fikr Yetakchilari" className="h-10 w-auto mb-4" />
          </div>

          {/* Tabs */}
          <div className="flex rounded-[10px] bg-[#F3F2F0] p-1 mb-6">
            {(["login", "register"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2 text-[13px] font-semibold rounded-[8px] transition-all"
                style={{
                  background: tab === t ? "#FFFFFF" : "transparent",
                  color: tab === t ? "#141414" : "#999999",
                  boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {t === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
              </button>
            ))}
          </div>

          {tab === "login" ? (
            <LoginForm onSuccess={(isMemberUser) => navigate(isMemberUser ? "/member/events" : "/dashboard", { replace: true })} />
          ) : (
            <RegisterForm onSuccess={() => navigate("/member/events", { replace: true })} />
          )}
        </div>

        <p className="text-center text-[11px] text-[#999999] mt-6 tracking-tight">
          © 2026 Fikr Yetakchilari · Biznes Klub
        </p>
      </div>
    </div>
  )
}

function LoginForm({ onSuccess }: { onSuccess: (isMember: boolean) => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await signIn(email, password)
      const { data } = await supabase.auth.getUser()
      const isMemberUser = data.user?.user_metadata?.user_type === "member"
      onSuccess(isMemberUser)
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
        <label className="text-[12px] font-semibold text-[#141414] mb-1.5 block tracking-tight">Email</label>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          required autoFocus placeholder="email@example.com"
          className="w-full px-4 py-3 bg-white border border-[#E5E5E5] rounded-[10px] text-[14px] text-[#141414] placeholder:text-[#CCCCCC] focus:border-[#141414] focus:ring-2 focus:ring-[#141414]/5 outline-none transition-all"
        />
      </div>

      <div>
        <label className="text-[12px] font-semibold text-[#141414] mb-1.5 block tracking-tight">Parol</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
            required placeholder="••••••••"
            className="w-full px-4 py-3 pr-12 bg-white border border-[#E5E5E5] rounded-[10px] text-[14px] text-[#141414] placeholder:text-[#CCCCCC] focus:border-[#141414] focus:ring-2 focus:ring-[#141414]/5 outline-none transition-all"
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#999999] hover:text-[#141414] transition-colors" tabIndex={-1}>
            {showPassword ? <EyeSlash size={18} weight="bold" /> : <Eye size={18} weight="bold" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-[10px] text-[12px] text-red-700 font-medium">{error}</div>
      )}

      <button type="submit" disabled={loading}
        className="w-full py-3 mt-2 bg-[#141414] text-white rounded-[10px] text-[14px] font-bold hover:bg-[#000] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
        style={{ letterSpacing: "-0.3px" }}>
        {loading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Kirilmoqda...</>
        ) : (
          <>Kirish<ArrowRight size={16} weight="bold" className="group-hover:translate-x-0.5 transition-transform" /></>
        )}
      </button>

      <div className="flex items-center gap-3 mt-1">
        <div className="flex-1 h-px bg-[#E5E5E5]" />
        <span className="text-[11px] text-[#CCCCCC] font-medium">yoki</span>
        <div className="flex-1 h-px bg-[#E5E5E5]" />
      </div>

      <button type="button" onClick={() => signInWithGoogle()}
        className="w-full py-3 bg-white border border-[#E5E5E5] rounded-[10px] text-[14px] font-semibold text-[#141414] hover:bg-[#F9F9F9] transition-all flex items-center justify-center gap-3">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
          <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        Google bilan kirish
      </button>

      <div className="pt-2 border-t border-[#F0F0F0] text-center">
        <p className="text-[11px] text-[#999999]">Yordam kerak? Administrator bilan bog'laning</p>
      </div>
    </form>
  )
}

function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [company, setCompany] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await selfRegisterMember({ email, password, full_name: fullName, phone, company })
      // Auto sign in after successful registration
      await signIn(email, password)
      setSuccess(true)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-2xl">✓</div>
        <p className="text-[14px] font-semibold text-[#141414]">Muvaffaqiyatli ro'yxatdan o'tdingiz!</p>
        <p className="text-[12px] text-[#999]">Tizimga kirilmoqda...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label className="text-[12px] font-semibold text-[#141414] mb-1.5 block tracking-tight">To'liq ism *</label>
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
          required placeholder="Ism Familiya"
          className="w-full px-4 py-3 bg-white border border-[#E5E5E5] rounded-[10px] text-[14px] text-[#141414] placeholder:text-[#CCCCCC] focus:border-[#141414] focus:ring-2 focus:ring-[#141414]/5 outline-none transition-all" />
      </div>

      <div>
        <label className="text-[12px] font-semibold text-[#141414] mb-1.5 block tracking-tight">Telefon *</label>
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
          required placeholder="+998 90 000 00 00"
          className="w-full px-4 py-3 bg-white border border-[#E5E5E5] rounded-[10px] text-[14px] text-[#141414] placeholder:text-[#CCCCCC] focus:border-[#141414] focus:ring-2 focus:ring-[#141414]/5 outline-none transition-all" />
      </div>

      <div>
        <label className="text-[12px] font-semibold text-[#141414] mb-1.5 block tracking-tight">Kompaniya *</label>
        <input type="text" value={company} onChange={(e) => setCompany(e.target.value)}
          required placeholder="Kompaniya nomi"
          className="w-full px-4 py-3 bg-white border border-[#E5E5E5] rounded-[10px] text-[14px] text-[#141414] placeholder:text-[#CCCCCC] focus:border-[#141414] focus:ring-2 focus:ring-[#141414]/5 outline-none transition-all" />
      </div>

      <div>
        <label className="text-[12px] font-semibold text-[#141414] mb-1.5 block tracking-tight">Email *</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          required placeholder="email@example.com"
          className="w-full px-4 py-3 bg-white border border-[#E5E5E5] rounded-[10px] text-[14px] text-[#141414] placeholder:text-[#CCCCCC] focus:border-[#141414] focus:ring-2 focus:ring-[#141414]/5 outline-none transition-all" />
      </div>

      <div>
        <label className="text-[12px] font-semibold text-[#141414] mb-1.5 block tracking-tight">Parol *</label>
        <div className="relative">
          <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
            required minLength={6} placeholder="Kamida 6 ta belgi"
            className="w-full px-4 py-3 pr-12 bg-white border border-[#E5E5E5] rounded-[10px] text-[14px] text-[#141414] placeholder:text-[#CCCCCC] focus:border-[#141414] focus:ring-2 focus:ring-[#141414]/5 outline-none transition-all" />
          <button type="button" onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#999999] hover:text-[#141414] transition-colors" tabIndex={-1}>
            {showPassword ? <EyeSlash size={18} weight="bold" /> : <Eye size={18} weight="bold" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-[10px] text-[12px] text-red-700 font-medium">{error}</div>
      )}

      <button type="submit" disabled={loading}
        className="w-full py-3 mt-1 bg-[#141414] text-white rounded-[10px] text-[14px] font-bold hover:bg-[#000] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
        style={{ letterSpacing: "-0.3px" }}>
        {loading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Ro'yxatdan o'tilmoqda...</>
        ) : (
          <>Ro'yxatdan o'tish<ArrowRight size={16} weight="bold" className="group-hover:translate-x-0.5 transition-transform" /></>
        )}
      </button>

      <div className="flex items-center gap-3 mt-1">
        <div className="flex-1 h-px bg-[#E5E5E5]" />
        <span className="text-[11px] text-[#CCCCCC] font-medium">yoki</span>
        <div className="flex-1 h-px bg-[#E5E5E5]" />
      </div>

      <button type="button" onClick={() => signInWithGoogle()}
        className="w-full py-3 bg-white border border-[#E5E5E5] rounded-[10px] text-[14px] font-semibold text-[#141414] hover:bg-[#F9F9F9] transition-all flex items-center justify-center gap-3">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
          <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        Google bilan ro'yxatdan o'tish
      </button>
    </form>
  )
}
