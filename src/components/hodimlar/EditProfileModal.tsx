import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import { useUpdateUserProfile } from "@/hooks/useUsers"
import { useAuth } from "@/context/AuthContext"
import { useDialog } from "@/hooks/useDialog"
import type { UserProfile } from "@/lib/supabase/queries/auth"
import { DEPARTMENTS, type Department } from "@/lib/constants/employee"
import { PhoneInput } from "@/components/ui/PhoneInput"

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
  "w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"

function Field({ label, full, htmlFor, children }: { label: string; full?: boolean; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-muted">{label}</label>
      {children}
    </div>
  )
}

function EditForm({ onClose, user, onSuccess }: InnerProps) {
  const { isAdmin } = useAuth()
  const updateMutation = useUpdateUserProfile()
  const saving = updateMutation.isPending
  const uid = useId()
  const titleId = useId()
  const panelRef = useDialog<HTMLDivElement>(() => !saving && onClose())

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
        className="fixed inset-0 bg-surface-overlay backdrop-blur-[2px] z-[110]"
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
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="bg-surface-raised rounded-overlay w-full max-w-2xl pointer-events-auto max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-line sticky top-0 bg-surface-raised z-10">
            <div className="flex flex-col gap-0.5">
              <h2 id={titleId} className="text-lg font-bold text-ink">Profilni tahrirlash</h2>
              <span className="text-xs text-ink-muted">{user.full_name} · {user.email}</span>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              aria-label="Yopish"
              className="p-1.5 rounded-item hover:bg-mute-ghost-hover transition-colors"
            >
              <X size={20} className="text-ink-muted" />
            </button>
          </div>

          <div className="p-6 flex flex-col gap-6">
            {error && (
              <div className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark border border-line">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <span className="text-sm font-bold uppercase tracking-wider text-ink-muted">Asosiy</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Ism Familiya *" htmlFor={`${uid}-full-name`}>
                  <input
                    id={`${uid}-full-name`}
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoFocus
                    className={inputCls}
                  />
                </Field>
                <Field label="Telefon" htmlFor={`${uid}-phone`}>
                  <PhoneInput id={`${uid}-phone`} value={phone} onChange={setPhone} />
                </Field>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-sm font-bold uppercase tracking-wider text-ink-muted">Ish</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Bo'lim" htmlFor={`${uid}-department`}>
                  <select
                    id={`${uid}-department`}
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
                <Field label="Lavozim" htmlFor={`${uid}-position`}>
                  <input
                    id={`${uid}-position`}
                    type="text"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Ish boshlangan sana" htmlFor={`${uid}-hire-date`}>
                  <input
                    id={`${uid}-hire-date`}
                    type="date"
                    value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-sm font-bold uppercase tracking-wider text-ink-muted">Shaxsiy</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Tug'ilgan sana" htmlFor={`${uid}-birth-date`}>
                  <input
                    id={`${uid}-birth-date`}
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Telegram username" htmlFor={`${uid}-telegram`}>
                  <input
                    id={`${uid}-telegram`}
                    type="text"
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="@username"
                    className={inputCls}
                  />
                </Field>
                <Field label="Manzil" full htmlFor={`${uid}-address`}>
                  <input
                    id={`${uid}-address`}
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Favqulodda kontakt" full htmlFor={`${uid}-emergency-contact`}>
                  <input
                    id={`${uid}-emergency-contact`}
                    type="text"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    placeholder="Yaqin kishi ismi va telefoni"
                    className={inputCls}
                  />
                </Field>
                <Field label="Haqida (bio)" full htmlFor={`${uid}-bio`}>
                  <textarea
                    id={`${uid}-bio`}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                </Field>
                {isAdmin && (
                  <Field label="Yozuvlar (faqat admin)" full htmlFor={`${uid}-notes`}>
                    <textarea
                      id={`${uid}-notes`}
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

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line sticky bottom-0 bg-surface-raised">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-control text-base font-medium text-ink-muted hover:text-ink transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className={`px-5 py-2 rounded-control text-base font-bold transition-colors ${
                saving ? "bg-mute-soft text-ink-faint cursor-not-allowed" : "bg-accent text-ink-on-accent hover:bg-accent-hover"
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
