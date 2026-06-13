import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import { useUpdateUserProfile } from "@/hooks/useUsers"
import { useAuth } from "@/context/AuthContext"
import type { UserProfile } from "@/lib/supabase/queries/auth"
import { DEPARTMENTS, type Department } from "@/lib/constants/employee"

interface EditProfileModalProps {
  isOpen: boolean
  onClose: () => void
  user: UserProfile
  onSuccess?: (msg: string) => void
}

interface InnerProps {
  onClose: () => void
  user: UserProfile
  onSuccess?: (msg: string) => void
}

const inputCls =
  "w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCC] focus:outline-none focus:border-[#141414] transition-colors"

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""}`}>
      <label className="text-[12px] font-medium text-[#999]">{label}</label>
      {children}
    </div>
  )
}

function EditForm({ onClose, user, onSuccess }: InnerProps) {
  const { isAdmin } = useAuth()
  const updateMutation = useUpdateUserProfile()
  const saving = updateMutation.isPending

  const [fullName, setFullName] = useState(user.full_name)
  const [phone, setPhone] = useState(user.phone ?? "")
  const [department, setDepartment] = useState<Department | "">(user.department ?? "")
  const [position, setPosition] = useState(user.position ?? "")
  const [hireDate, setHireDate] = useState(user.hire_date ?? "")
  const [birthDate, setBirthDate] = useState(user.birth_date ?? "")
  const [address, setAddress] = useState(user.address ?? "")
  const [telegram, setTelegram] = useState(user.telegram ?? "")
  const [emergencyContact, setEmergencyContact] = useState(user.emergency_contact ?? "")
  const [bio, setBio] = useState(user.bio ?? "")
  const [notes, setNotes] = useState(user.notes ?? "")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    if (!fullName.trim()) {
      setError("Ism Familiya majburiy")
      return
    }
    try {
      const data: Partial<UserProfile> = {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        department: department || null,
        position: position.trim() || null,
        hire_date: hireDate || null,
        birth_date: birthDate || null,
        address: address.trim() || null,
        telegram: telegram.trim() || null,
        emergency_contact: emergencyContact.trim() || null,
        bio: bio.trim() || null,
      }
      if (isAdmin) {
        data.notes = notes.trim() || null
      }

      await updateMutation.mutateAsync({ userId: user.id, data })
      onSuccess?.("Profil yangilandi")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saqlashda xatolik")
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
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F0F0] sticky top-0 bg-white z-10">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[16px] font-bold text-[#141414]">Profilni tahrirlash</h2>
              <span className="text-[11px] text-[#999]">{user.full_name} · {user.email}</span>
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

            <div className="flex flex-col gap-3">
              <span className="text-[12px] font-bold uppercase tracking-wider text-[#999]">Asosiy</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Ism Familiya *">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoFocus
                    className={inputCls}
                  />
                </Field>
                <Field label="Telefon">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+998 90 123 45 67"
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-[12px] font-bold uppercase tracking-wider text-[#999]">Ish</span>
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
                    className={inputCls}
                  />
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
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-[12px] font-bold uppercase tracking-wider text-[#999]">Shaxsiy</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                </Field>
                {isAdmin && (
                  <Field label="Yozuvlar (faqat admin)" full>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Ichki yozuvlar..."
                      className={`${inputCls} resize-none`}
                    />
                  </Field>
                )}
              </div>
            </div>
          </div>

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
              {saving ? "Saqlanmoqda..." : "Saqlash"}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

export function EditProfileModal({ isOpen, onClose, user, onSuccess }: EditProfileModalProps) {
  return (
    <AnimatePresence>
      {isOpen && <EditForm key={user.id} onClose={onClose} user={user} onSuccess={onSuccess} />}
    </AnimatePresence>
  )
}
