import { useState, useEffect, useRef } from "react"
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
        <h1 className="text-[22px] font-bold text-[#141414]" style={{ letterSpacing: "-0.4px" }}>
          Profilim
        </h1>
        <p className="text-[13px] text-[#999999]">
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
            className={`fixed top-6 right-6 z-[200] px-4 py-2.5 rounded-[8px] text-[12px] font-bold shadow-lg ${
              toast.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
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
        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative w-20 h-20 rounded-full bg-[#141414] flex items-center justify-center overflow-hidden cursor-pointer group"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={user.full_name} className="w-full h-full object-cover" />
          ) : (
            <UserIcon size={32} weight="bold" className="text-white" />
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Camera size={20} weight="bold" className="text-white" />
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-bold text-[#141414]">{user.full_name}</span>
          <span className="text-[12px] text-[#999]">{ROLE_LABELS[user.role]}</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mt-1 text-[12px] font-bold text-[#141414] hover:text-[#333] underline w-fit transition-colors"
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
          <label className="text-[12px] font-medium text-[#999]">Ism Familiya</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-[#999]">Email</label>
          <input
            type="email"
            value={user.email}
            disabled
            className="border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#999] bg-[#F9F9F9] cursor-not-allowed"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-[#999]">Telefon</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998 90 123 45 67"
            className="border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-[#999]">Rol</label>
          <input
            type="text"
            value={ROLE_LABELS[user.role]}
            disabled
            className="border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#999] bg-[#F9F9F9] cursor-not-allowed"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`px-5 py-2 rounded-[8px] text-[13px] font-bold text-white transition-colors ${
            saving || !dirty ? "bg-[#CCC] cursor-not-allowed" : "bg-[#141414] hover:bg-[#333]"
          }`}
        >
          {saving ? "Saqlanmoqda..." : "Saqlash"}
        </button>
        {!showPasswordForm && (
          <button
            onClick={() => setShowPasswordForm(true)}
            className="px-4 py-2 rounded-[8px] text-[13px] font-medium text-[#666] hover:text-[#141414] transition-colors"
          >
            Parolni o'zgartirish
          </button>
        )}
      </div>

      {/* Password form */}
      {showPasswordForm && (
        <div className="border border-[#F0F0F0] rounded-[10px] p-4 flex flex-col gap-3">
          <h3 className="text-[14px] font-bold text-[#141414]">Yangi parol</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Yangi parol (kamida 6 belgi)"
              className="border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Parolni tasdiqlang"
              className="border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePasswordChange}
              disabled={pwdSaving}
              className={`px-4 py-2 rounded-[8px] text-[13px] font-bold text-white transition-colors ${
                pwdSaving ? "bg-[#CCC] cursor-not-allowed" : "bg-[#141414] hover:bg-[#333]"
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
              className="px-4 py-2 rounded-[8px] text-[13px] font-medium text-[#999] hover:text-[#666]"
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
