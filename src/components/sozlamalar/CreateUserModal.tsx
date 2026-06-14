import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, CaretDown, Camera } from "@phosphor-icons/react"
import { useCreateUser } from "@/hooks/useUsers"
import { useAuth } from "@/context/AuthContext"
import { ImageCropModal } from "@/components/ui/ImageCropModal"
import { PhoneInput } from "@/components/ui/PhoneInput"
import {
  MODULES,
  ROLE_LABELS,
  uploadUserAvatar,
  updateUserAvatar,
  type ModuleName,
  type UserRole,
} from "@/lib/supabase/queries/auth"
import { DEPARTMENTS, type Department } from "@/lib/constants/employee"

interface CreateUserModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

interface CreateFormProps {
  onClose: () => void
  onCreated?: () => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function CreateForm({ onClose, onCreated }: CreateFormProps) {
  const { isAdmin } = useAuth()

  // Section 1 — Asosiy
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")

  // Section 2 — Ish
  const [department, setDepartment] = useState<Department | "">("")
  const [position, setPosition] = useState("")
  const [role, setRole] = useState<UserRole>("xodim")
  const [hireDate, setHireDate] = useState("")

  // Section 3 — Qo'shimcha (collapsible)
  const [extraOpen, setExtraOpen] = useState(false)
  const [birthDate, setBirthDate] = useState("")
  const [address, setAddress] = useState("")
  const [telegram, setTelegram] = useState("")
  const [emergencyContact, setEmergencyContact] = useState("")
  const [bio, setBio] = useState("")
  const [notes, setNotes] = useState("")

  // Section 4 — Modullar
  const [modules, setModules] = useState<Set<ModuleName>>(new Set())

  // Avatar upload + crop
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [tempImageSrc, setTempImageSrc] = useState("")
  const [showCrop, setShowCrop] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [error, setError] = useState<string | null>(null)
  const createMutation = useCreateUser()
  const saving = createMutation.isPending
  const isAdminRole = role === "admin"

  // Revoke object URL on preview swap / unmount
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  }, [avatarPreview])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError("Rasm 5MB dan kichik bo'lishi kerak")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setTempImageSrc(reader.result as string)
      setShowCrop(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  function handleCropComplete(blob: Blob) {
    if (avatarPreview && avatarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview)
    }
    setAvatarBlob(blob)
    setAvatarPreview(URL.createObjectURL(blob))
    setShowCrop(false)
  }

  function clearAvatar() {
    if (avatarPreview && avatarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview)
    }
    setAvatarBlob(null)
    setAvatarPreview(null)
  }

  function toggleModule(m: ModuleName) {
    setModules((prev) => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  async function handleSubmit() {
    setError(null)
    if (!fullName.trim()) return setError("Ism Familiya majburiy")
    if (!email.trim()) return setError("Email majburiy")
    if (!EMAIL_RE.test(email.trim())) return setError("Email formati noto'g'ri")
    if (password.length < 6) return setError("Parol kamida 6 belgidan iborat bo'lishi kerak")

    try {
      const result = await createMutation.mutateAsync({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role,
        modules: Array.from(modules),
        phone: phone.trim() || undefined,
        department: department || undefined,
        position: position.trim() || undefined,
        hire_date: hireDate || undefined,
        birth_date: birthDate || undefined,
        address: address.trim() || undefined,
        bio: bio.trim() || undefined,
        telegram: telegram.trim() || undefined,
      })

      // Upload avatar after the user exists (and ignore avatar errors so the
      // user is still created — admin can re-upload later).
      if (avatarBlob && result.user_id) {
        try {
          const url = await uploadUserAvatar(avatarBlob, result.user_id)
          await updateUserAvatar(result.user_id, url)
        } catch (avatarErr) {
          console.error("[CreateUserModal] avatar upload failed:", avatarErr)
        }
      }

      onCreated?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Xatolik yuz berdi"
      setError(
        msg.includes("not allowed") || msg.includes("admin")
          ? "Foydalanuvchi yaratish faqat server tomondan (Edge Function) mumkin. Admin sifatida tizimga kirganingizni tekshiring."
          : msg,
      )
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[110]"
        onClick={() => !saving && onClose()}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed inset-0 flex items-center justify-center z-[110] pointer-events-none p-4"
      >
        <div
          className="bg-white rounded-[12px] w-full max-w-2xl shadow-2xl pointer-events-auto max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F0F0] sticky top-0 bg-white z-10">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[16px] font-bold text-[#141414]">Yangi xodim qo'shish</h2>
              <span className="text-[11px] text-[#999]">Tizimga yangi foydalanuvchi qo'shing va modullarini sozlang</span>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors"
            >
              <X size={20} className="text-[#999]" weight="bold" />
            </button>
          </div>

          <div className="p-6 flex flex-col gap-6">
            {error && (
              <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                {error}
              </div>
            )}

            {/* Avatar */}
            <div className="flex flex-col items-center gap-3 pb-6 border-b border-[#F0F0F0]">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative w-24 h-24 rounded-full bg-[#F5F5F5] border-2 border-dashed border-[#E5E5E5] flex items-center justify-center cursor-pointer hover:border-[#141414] transition-all overflow-hidden group"
              >
                {avatarPreview ? (
                  <>
                    <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-[11px] font-bold">O'zgartirish</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-[#999]">
                    <Camera size={20} weight="bold" />
                    <span className="text-[10px]">Rasm yuklash</span>
                  </div>
                )}
              </div>
              {avatarPreview && (
                <button
                  type="button"
                  onClick={clearAvatar}
                  className="text-[11px] text-red-500 hover:text-red-700 transition-colors"
                >
                  O'chirish
                </button>
              )}
              <p className="text-[11px] text-[#999]">Profil rasm (ixtiyoriy)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* ── Section 1 — Asosiy ma'lumotlar ── */}
            <Section title="Asosiy ma'lumotlar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Ism Familiya *">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ali Valiev"
                    autoFocus
                    className={inputCls}
                  />
                </Field>
                <Field label="Email *">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className={inputCls}
                  />
                </Field>
                <Field label="Parol * (kamida 6 belgi)">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputCls}
                  />
                </Field>
                <Field label="Telefon">
                  <PhoneInput value={phone} onChange={setPhone} />
                </Field>
              </div>
            </Section>

            {/* ── Section 2 — Ish ma'lumotlari ── */}
            <Section title="Ish ma'lumotlari">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Bo'lim">
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as Department | "")}
                    className={inputCls}
                  >
                    <option value="">Tanlanmagan</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Lavozim">
                  <input
                    type="text"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="Marketing menejeri"
                    className={inputCls}
                  />
                </Field>
                <Field label="Rol *">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className={inputCls}
                  >
                    {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Ish boshlangan sana">
                  <input
                    type="date"
                    value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            </Section>

            {/* ── Section 3 — Qo'shimcha (collapsible) ── */}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setExtraOpen((v) => !v)}
                className="flex items-center gap-2 text-left -mx-1 px-1 py-1 rounded-[6px] hover:bg-[#F9F9F9] transition-colors"
              >
                <CaretDown
                  size={14}
                  weight="bold"
                  className={`text-[#999] transition-transform ${extraOpen ? "" : "-rotate-90"}`}
                />
                <span className="text-[12px] font-bold uppercase tracking-wider text-[#999]">
                  Qo'shimcha ma'lumotlar
                </span>
                <span className="text-[11px] text-[#CCC]">(majburiy emas)</span>
              </button>
              {extraOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-5">
                  <Field label="Tug'ilgan sana">
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Telegram username">
                    <input
                      type="text"
                      value={telegram}
                      onChange={(e) => setTelegram(e.target.value)}
                      placeholder="@username"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Manzil" full>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Toshkent, Yunusobod tumani..."
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Favqulodda kontakt" full>
                    <input
                      type="text"
                      value={emergencyContact}
                      onChange={(e) => setEmergencyContact(e.target.value)}
                      placeholder="Yaqin kishi ismi va telefoni"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Haqida (bio)" full>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Qisqacha ma'lumot..."
                      rows={3}
                      className={`${inputCls} resize-none`}
                    />
                  </Field>
                  {isAdmin && (
                    <Field label="Yozuvlar (faqat admin uchun)" full>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ichki yozuvlar..."
                        rows={2}
                        className={`${inputCls} resize-none`}
                      />
                    </Field>
                  )}
                </div>
              )}
            </div>

            {/* ── Section 4 — Modullar va ruxsatlar ── */}
            <Section title="Modullar va ruxsatlar">
              {isAdminRole && (
                <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-[#F0F0F0] text-[#141414] border border-[#E0E0E0] mb-3">
                  Admin barcha modullarga avtomatik kirish huquqiga ega
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {MODULES.map((m) => {
                  const checked = isAdminRole || modules.has(m.id)
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-2 px-3 py-2 border rounded-[8px] transition-colors ${
                        isAdminRole
                          ? "border-[#F0F0F0] bg-[#FAFAFA] cursor-not-allowed opacity-60"
                          : "border-[#E0E0E0] cursor-pointer hover:bg-[#F9F9F9]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isAdminRole}
                        onChange={() => toggleModule(m.id)}
                        className="w-4 h-4 rounded accent-[#141414] cursor-pointer disabled:cursor-not-allowed"
                      />
                      <span className="text-[13px] text-[#141414]">{m.label}</span>
                    </label>
                  )
                })}
              </div>
            </Section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#F0F0F0] sticky bottom-0 bg-white">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-[8px] text-[13px] font-medium text-[#999] hover:text-[#666] transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className={`px-5 py-2 rounded-[8px] text-[13px] font-bold text-white transition-colors ${
                saving ? "bg-[#CCC] cursor-not-allowed" : "bg-[#141414] hover:bg-[#333]"
              }`}
            >
              {saving ? "Yaratilmoqda..." : "Yaratish"}
            </button>
          </div>
        </div>
      </motion.div>

      <ImageCropModal
        isOpen={showCrop}
        imageSrc={tempImageSrc}
        onClose={() => setShowCrop(false)}
        onCropped={handleCropComplete}
      />
    </>
  )
}

const inputCls =
  "w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCC] focus:outline-none focus:border-[#141414] transition-colors"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[12px] font-bold uppercase tracking-wider text-[#999]">{title}</span>
      <div>{children}</div>
    </div>
  )
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""}`}>
      <label className="text-[12px] font-medium text-[#999]">{label}</label>
      {children}
    </div>
  )
}

export function CreateUserModal({ isOpen, onClose, onCreated }: CreateUserModalProps) {
  return (
    <AnimatePresence>
      {isOpen && <CreateForm onClose={onClose} onCreated={onCreated} />}
    </AnimatePresence>
  )
}
