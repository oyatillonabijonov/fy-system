import { useState, useEffect, useRef, useId } from "react"
import { PhoneInput } from "@/components/ui/PhoneInput"
import { motion, AnimatePresence } from "framer-motion"
import { User as UserIcon, Camera } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { ImageCropModal } from "@/components/ui/ImageCropModal"
import {
  ROLE_LABELS,
  updateMyProfile,
  updatePassword,
  uploadUserAvatar,
  type UserProfile,
} from "@/lib/supabase/queries/auth"

export function Sozlamalar() {
  const { user } = useAuth()
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(message: string, type: "success" | "error" = "success") {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  return (
    <div className="flex flex-col pb-10 max-w-[960px]">

      {user && <ProfileTab key={user.id} user={user} showToast={showToast} />}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            role="status"
            className={`fixed top-6 right-6 z-[200] px-4 py-2.5 rounded-control text-sm font-medium border border-line ${
              toast.type === "success" ? "bg-surface-raised text-ink" : "bg-danger-soft text-danger-text"
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Profile Form ───────────────────────────────────────

function ProfileTab({
  user,
  showToast,
}: {
  user: UserProfile
  showToast: (msg: string, type?: "success" | "error") => void
}) {
  const { refreshProfile } = useAuth()
  const uid = useId()
  const [fullName, setFullName] = useState(user.full_name)
  const [phone, setPhone] = useState(user.phone ?? "")
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url)
  const [saving, setSaving] = useState(false)

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pwdSaving, setPwdSaving] = useState(false)

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string>("")
  const [showCrop, setShowCrop] = useState(false)
  const [uploading, setUploading] = useState(false)

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      showToast("Rasm hajmi 5MB dan oshmasligi kerak", "error")
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => {
      setCropSrc(reader.result as string)
      setShowCrop(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  async function handleCropped(blob: Blob) {
    setShowCrop(false)
    setUploading(true)
    try {
      const url = await uploadUserAvatar(blob, user.id)
      await updateMyProfile({ avatar_url: url })
      setAvatarUrl(url)
      await refreshProfile()
      showToast("Avatar yangilandi")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Avatar yuklashda xatolik", "error")
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateMyProfile({
        full_name: fullName.trim() || user.full_name,
        phone: phone.trim() || null,
      })
      await refreshProfile()
      showToast("Profil saqlandi")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Saqlashda xatolik", "error")
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordChange() {
    if (newPassword.length < 6) {
      showToast("Parol kamida 6 belgidan iborat bo'lishi kerak", "error")
      return
    }
    if (newPassword !== confirmPassword) {
      showToast("Parollar mos kelmadi", "error")
      return
    }
    setPwdSaving(true)
    try {
      await updatePassword(newPassword)
      setNewPassword("")
      setConfirmPassword("")
      setShowPasswordForm(false)
      showToast("Parol o'zgartirildi")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Parolni o'zgartirishda xatolik", "error")
    } finally {
      setPwdSaving(false)
    }
  }

  const dirty = fullName.trim() !== user.full_name || (phone.trim() || null) !== (user.phone ?? null)

  return (
    <div className="flex flex-col">
      {/* Photo */}
      <SettingsRow title="Profil rasmi" desc="Sidebar'da va jurnal yozuvlarida ko'rinadi. JPG yoki PNG, 5MB gacha.">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Rasmni o'zgartirish"
            className="relative size-16 rounded-full bg-mute-soft flex items-center justify-center overflow-hidden cursor-pointer group flex-shrink-0"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={28} weight="light" className="text-ink-muted" />
            )}
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Camera size={20} className="text-white" />
            </span>
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className={softBtn}>
            {uploading ? "Yuklanmoqda…" : avatarUrl ? "Rasmni almashtirish" : "Rasm yuklash"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
        </div>
      </SettingsRow>

      {/* Personal info */}
      <SettingsRow title="Shaxsiy ma'lumotlar" desc="Ism va telefoningizni o'zingiz o'zgartira olasiz. Email va rolni administrator belgilaydi.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-full-name`} className={labelCls}>Ism familiya</label>
            <input id={`${uid}-full-name`} type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-phone`} className={labelCls}>Telefon</label>
            <PhoneInput id={`${uid}-phone`} value={phone} onChange={setPhone} />
          </div>
          <ReadOnly label="Email" value={user.email} />
          <ReadOnly label="Rol" value={ROLE_LABELS[user.role]} />
        </div>
        <div className="flex justify-end mt-5">
          <button type="button" onClick={handleSave} disabled={saving || !dirty} className={primaryBtn}>
            {saving ? "Saqlanmoqda…" : "O'zgarishlarni saqlash"}
          </button>
        </div>
      </SettingsRow>

      {/* Password */}
      <SettingsRow title="Parol" desc="Kamida 6 belgi. O'zgartirgach, keyingi kirishda yangi paroldan foydalaning." last>
        {showPasswordForm ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${uid}-pwd`} className={labelCls}>Yangi parol</label>
                <input id={`${uid}-pwd`} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${uid}-pwd2`} className={labelCls}>Parolni tasdiqlang</label>
                <input id={`${uid}-pwd2`} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowPasswordForm(false); setNewPassword(""); setConfirmPassword("") }}
                disabled={pwdSaving}
                className={softBtn}
              >
                Bekor qilish
              </button>
              <button type="button" onClick={handlePasswordChange} disabled={pwdSaving || !newPassword} className={primaryBtn}>
                {pwdSaving ? "Saqlanmoqda…" : "Parolni yangilash"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <span className="text-base text-ink-muted tracking-widest">••••••••</span>
            <button type="button" onClick={() => setShowPasswordForm(true)} className={softBtn}>
              Parolni o'zgartirish
            </button>
          </div>
        )}
      </SettingsRow>

      <ImageCropModal
        isOpen={showCrop}
        imageSrc={cropSrc}
        onClose={() => setShowCrop(false)}
        onCropped={handleCropped}
      />
    </div>
  )
}

// ─── Layout pieces ──────────────────────────────────────

const labelCls = "text-sm font-medium text-ink-muted"
const inputCls =
  "w-full h-control-md border border-line rounded-control px-3 text-base text-ink bg-surface placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
const softBtn =
  "flex items-center gap-2 px-3.5 h-control-md rounded-control bg-mute-soft text-base font-medium text-ink hover:bg-mute-soft-hover transition-colors disabled:opacity-50"
const primaryBtn =
  "px-4 h-control-md rounded-control bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:pointer-events-none"

/** One settings group: title + hint on the left, controls on the right, hairline between groups */
function SettingsRow({ title, desc, last, children }: { title: string; desc: string; last?: boolean; children: React.ReactNode }) {
  return (
    <section className={`grid grid-cols-1 md:grid-cols-[260px_1fr] gap-x-10 gap-y-4 py-7 first:pt-2 ${last ? "" : "border-b border-line"}`}>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="text-sm text-ink-muted leading-relaxed">{desc}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <span className="h-control-md px-3 flex items-center rounded-control bg-surface-sunken text-base text-ink-muted truncate">{value}</span>
    </div>
  )
}
