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
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold text-ink" style={{ letterSpacing: "-0.4px" }}>
          Profilim
        </h1>
        <p className="text-base text-ink-muted">
          Shaxsiy ma'lumotlar va parolingizni boshqaring
        </p>
      </div>

      {user && <ProfileTab key={user.id} user={user} showToast={showToast} />}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`fixed top-6 right-6 z-[200] px-4 py-2.5 rounded-surface text-sm font-bold ${
              toast.type === "success"
                ? "bg-surface-sunken text-ink border border-line"
                : "bg-danger-soft text-danger-dark border border-danger-soft"
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
    <div className="flex flex-col gap-6 max-w-[640px]">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Rasmni o'zgartirish"
          className="relative w-20 h-20 rounded-full bg-accent flex items-center justify-center overflow-hidden cursor-pointer group"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={user.full_name} className="w-full h-full object-cover" />
          ) : (
            <UserIcon size={32} className="text-ink-on-accent" />
          )}
          <span className="absolute inset-0 bg-surface-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Camera size={20} className="text-ink-on-accent" />
          </span>
        </button>
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-bold text-ink">{user.full_name}</span>
          <span className="text-sm text-ink-muted">{ROLE_LABELS[user.role]}</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mt-1 text-sm font-bold text-ink hover:text-ink-muted underline w-fit transition-colors"
          >
            {uploading ? "Yuklanmoqda..." : "Rasmni yangilash"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarPick}
        />
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-full-name`} className="text-sm font-medium text-ink-muted">Ism Familiya</label>
          <input
            id={`${uid}-full-name`}
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="border border-line rounded-control px-3 py-2 text-base text-ink focus:outline-none focus:border-line-focus transition-colors"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-email`} className="text-sm font-medium text-ink-muted">Email</label>
          <input
            id={`${uid}-email`}
            type="email"
            value={user.email}
            disabled
            className="border border-line rounded-control px-3 py-2 text-base text-ink-muted bg-surface-sunken cursor-not-allowed"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-phone`} className="text-sm font-medium text-ink-muted">Telefon</label>
          <PhoneInput id={`${uid}-phone`} value={phone} onChange={setPhone} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-role`} className="text-sm font-medium text-ink-muted">Rol</label>
          <input
            id={`${uid}-role`}
            type="text"
            value={ROLE_LABELS[user.role]}
            disabled
            className="border border-line rounded-control px-3 py-2 text-base text-ink-muted bg-surface-sunken cursor-not-allowed"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`px-5 py-2 rounded-control text-base font-bold text-ink-on-accent transition-colors ${
            saving || !dirty ? "bg-mute-soft cursor-not-allowed" : "bg-accent hover:bg-accent-hover"
          }`}
        >
          {saving ? "Saqlanmoqda..." : "Saqlash"}
        </button>
        {!showPasswordForm && (
          <button
            onClick={() => setShowPasswordForm(true)}
            className="px-4 py-2 rounded-control text-base font-medium text-ink-muted hover:text-ink transition-colors"
          >
            Parolni o'zgartirish
          </button>
        )}
      </div>

      {/* Password form */}
      {showPasswordForm && (
        <div className="border border-line rounded-surface p-4 flex flex-col gap-3">
          <h3 className="text-base font-bold text-ink">Yangi parol</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Yangi parol (kamida 6 belgi)"
              className="border border-line rounded-control px-3 py-2 text-base text-ink focus:outline-none focus:border-line-focus transition-colors"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Parolni tasdiqlang"
              className="border border-line rounded-control px-3 py-2 text-base text-ink focus:outline-none focus:border-line-focus transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePasswordChange}
              disabled={pwdSaving}
              className={`px-4 py-2 rounded-control text-base font-bold text-ink-on-accent transition-colors ${
                pwdSaving ? "bg-mute-soft cursor-not-allowed" : "bg-accent hover:bg-accent-hover"
              }`}
            >
              {pwdSaving ? "..." : "O'zgartirish"}
            </button>
            <button
              onClick={() => {
                setShowPasswordForm(false)
                setNewPassword("")
                setConfirmPassword("")
              }}
              disabled={pwdSaving}
              className="px-4 py-2 rounded-control text-base font-medium text-ink-muted hover:text-ink-muted"
            >
              Bekor qilish
            </button>
          </div>
        </div>
      )}

      <ImageCropModal
        isOpen={showCrop}
        imageSrc={cropSrc}
        onClose={() => setShowCrop(false)}
        onCropped={handleCropped}
      />
    </div>
  )
}
