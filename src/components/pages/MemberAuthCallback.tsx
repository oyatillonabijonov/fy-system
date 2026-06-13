import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight } from "@phosphor-icons/react"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/context/AuthContext"

export function MemberAuthCallback() {
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()

  const [step, setStep] = useState<"checking" | "form" | "saving">("checking")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [company, setCompany] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate("/login", { replace: true })
        return
      }

      // Check if already a member
      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle()

      if (client) {
        // Ensure user_type is set (Google OAuth doesn't set it automatically)
        if (user.user_metadata?.user_type !== "member") {
          await supabase.auth.updateUser({ data: { user_type: "member" } })
        }
        await refreshProfile()
        navigate("/member/events", { replace: true })
        return
      }

      // Pre-fill name from Google profile
      const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""
      setFullName(name)
      setStep("form")
    }

    void check()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setStep("saving")

    try {
      const { error: rpcError } = await supabase.rpc("setup_google_member", {
        p_full_name: fullName.trim(),
        p_phone: phone.trim(),
        p_company: company.trim(),
      })
      if (rpcError) throw rpcError

      // Mark as member in auth metadata so future sessions identify correctly
      await supabase.auth.updateUser({ data: { user_type: "member" } })

      await refreshProfile()
      navigate("/member/events", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
      setStep("form")
    }
  }

  if (step === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-[#6366F1] border-t-transparent rounded-full animate-spin" />
          <p className="text-[13px] text-[#999]">Yuklanmoqda...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-[#FAFAFA] via-white to-[#F5F5F5]" />

      <div className="relative z-10 w-full max-w-[420px]">
        <div
          className="bg-white/95 backdrop-blur-xl rounded-[16px] p-10 border border-white/60"
          style={{ boxShadow: "0 20px 60px -10px rgba(0, 0, 0, 0.08)" }}
        >
          <div className="flex flex-col items-center mb-6">
            <img src="/Sidebar/Logo.svg" alt="Fikr Yetakchilari" className="h-10 w-auto mb-4" />
            <p className="text-[13px] text-[#999]">Profilingizni to'ldiring</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-[12px] font-semibold text-[#141414] mb-1.5 block">To'liq ism *</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                required placeholder="Ism Familiya"
                className="w-full px-4 py-3 bg-white border border-[#E5E5E5] rounded-[10px] text-[14px] outline-none focus:border-[#141414] transition-all" />
            </div>

            <div>
              <label className="text-[12px] font-semibold text-[#141414] mb-1.5 block">Telefon *</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                required placeholder="+998 90 000 00 00"
                className="w-full px-4 py-3 bg-white border border-[#E5E5E5] rounded-[10px] text-[14px] outline-none focus:border-[#141414] transition-all" />
            </div>

            <div>
              <label className="text-[12px] font-semibold text-[#141414] mb-1.5 block">Kompaniya *</label>
              <input type="text" value={company} onChange={e => setCompany(e.target.value)}
                required placeholder="Kompaniya nomi"
                className="w-full px-4 py-3 bg-white border border-[#E5E5E5] rounded-[10px] text-[14px] outline-none focus:border-[#141414] transition-all" />
            </div>

            {error && (
              <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-[10px] text-[12px] text-red-700 font-medium">{error}</div>
            )}

            <button type="submit" disabled={step === "saving"}
              className="w-full py-3 mt-1 bg-[#141414] text-white rounded-[10px] text-[14px] font-bold hover:bg-black disabled:opacity-50 transition-all flex items-center justify-center gap-2 group"
              style={{ letterSpacing: "-0.3px" }}>
              {step === "saving"
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saqlanmoqda...</>
                : <>Davom etish<ArrowRight size={16} weight="bold" className="group-hover:translate-x-0.5 transition-transform" /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
