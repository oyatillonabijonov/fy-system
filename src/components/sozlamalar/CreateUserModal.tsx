import { useState, useId } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ArrowsClockwise, Copy, Check } from "@phosphor-icons/react"
import { useCreateUser } from "@/hooks/useUsers"
import { useDialog } from "@/hooks/useDialog"
import type { ModuleGrants, ModuleName, UserRole } from "@/lib/supabase/queries/auth"
import { DEPARTMENTS, type Department } from "@/lib/constants/employee"
import { RoleField, ModuleAccessField } from "./AccessFields"

interface CreateUserModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 10 chars, no look-alikes (0/O, 1/l/I) — it gets read out or typed from a message */
function tempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const buf = new Uint32Array(10)
  crypto.getRandomValues(buf)
  return Array.from(buf, (n) => chars[n % chars.length]).join("")
}

/**
 * New staff account: name, login email, a temporary password (the user is asked
 * to change it on first login), department/position, role and module access.
 * Everything else (phone, birthday, photo…) is filled later from the profile page.
 */
function CreateForm({ onClose, onCreated }: Omit<CreateUserModalProps, "isOpen">) {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState(tempPassword)
  const [department, setDepartment] = useState<Department | "">("")
  const [position, setPosition] = useState("")
  const [role, setRole] = useState<UserRole>("xodim")
  const [grants, setGrants] = useState<ModuleGrants>({})
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)

  const createMutation = useCreateUser()
  const saving = createMutation.isPending
  const uid = useId()
  const titleId = useId()
  const panelRef = useDialog<HTMLDivElement>(() => !saving && onClose())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!fullName.trim()) return setError("Ism familiyani kiriting")
    if (!EMAIL_RE.test(email.trim())) return setError("Email formati noto'g'ri")
    if (password.length < 6) return setError("Parol kamida 6 belgidan iborat bo'lishi kerak")

    const modules = role === "admin" ? [] : (Object.keys(grants) as ModuleName[])
    try {
      await createMutation.mutateAsync({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role,
        modules,
        edit_modules: modules.filter((m) => grants[m]),
        department: department || undefined,
        position: position.trim() || undefined,
      })
      onCreated?.()
      setCreated({ email: email.trim(), password })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-surface-overlay z-[110]"
        onClick={() => !saving && onClose()}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="fixed inset-0 flex items-center justify-center z-[110] pointer-events-none p-4"
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="bg-surface-raised border border-line rounded-overlay w-full max-w-lg pointer-events-auto max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 pt-5 pb-4">
            <h2 id={titleId} className="text-md font-semibold text-ink">
              {created ? "Xodim qo'shildi" : "Yangi xodim"}
            </h2>
            <button type="button" onClick={onClose} disabled={saving} aria-label="Yopish" className="size-8 rounded-item flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover transition-colors">
              <X size={18} />
            </button>
          </div>

          {created ? (
            <Credentials {...created} onDone={onClose} />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto px-6 pb-2 flex flex-col gap-5">
                {error && (
                  <div role="alert" className="px-3.5 py-2.5 rounded-control bg-danger-soft text-sm font-medium text-danger-text">{error}</div>
                )}

                <Field label="Ism familiya" htmlFor={`${uid}-name`}>
                  <input id={`${uid}-name`} value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus className={inputCls} placeholder="Aziz Karimov" />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Email (login)" htmlFor={`${uid}-email`}>
                    <input id={`${uid}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="aziz@fy.uz" autoComplete="off" />
                  </Field>
                  <Field label="Vaqtincha parol" htmlFor={`${uid}-pwd`}>
                    <div className="relative">
                      <input id={`${uid}-pwd`} value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-10 font-mono`} autoComplete="off" />
                      <button type="button" onClick={() => setPassword(tempPassword())} aria-label="Yangi parol yaratish" title="Yangi parol yaratish" className="absolute right-1 top-1/2 -translate-y-1/2 size-8 rounded-item flex items-center justify-center text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors">
                        <ArrowsClockwise size={16} />
                      </button>
                    </div>
                  </Field>
                </div>
                <p className="-mt-3 text-sm text-ink-faint">Xodim birinchi kirganda o'z parolini o'rnatadi.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Bo'lim" htmlFor={`${uid}-dep`}>
                    <select id={`${uid}-dep`} value={department} onChange={(e) => setDepartment(e.target.value as Department | "")} className={inputCls}>
                      <option value="">Tanlanmagan</option>
                      {DEPARTMENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Lavozim" htmlFor={`${uid}-pos`}>
                    <input id={`${uid}-pos`} value={position} onChange={(e) => setPosition(e.target.value)} className={inputCls} placeholder="Sotuv menejeri" />
                  </Field>
                </div>

                <RoleField value={role} onChange={setRole} />
                <ModuleAccessField role={role} value={grants} onChange={setGrants} />
              </div>

              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
                <button type="button" onClick={onClose} disabled={saving} className={softBtn}>Bekor qilish</button>
                <button type="submit" disabled={saving} className={primaryBtn}>
                  {saving ? "Qo'shilmoqda…" : "Xodimni qo'shish"}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </>
  )
}

/** After creation: the login to hand over, with one copy button */
function Credentials({ email, password, onDone }: { email: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Login: ${email}\nParol: ${password}\nKirish: ${window.location.origin}/login`)
      setCopied(true)
    } catch { /* clipboard blocked — the values are on screen */ }
  }

  return (
    <div className="flex flex-col">
      <div className="px-6 pb-2 flex flex-col gap-4">
        <p className="text-base text-ink-muted">
          Quyidagi ma'lumotlarni xodimga bering. Birinchi kirishda u parolni o'zgartirishi so'raladi.
        </p>
        <dl className="rounded-control bg-surface-sunken px-4 py-1">
          <div className="flex items-center justify-between gap-4 py-2.5 border-b border-line">
            <dt className="text-base text-ink-muted">Login</dt>
            <dd className="text-base text-ink break-all text-right">{email}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-base text-ink-muted">Parol</dt>
            <dd className="text-base text-ink font-mono">{password}</dd>
          </div>
        </dl>
      </div>
      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line mt-4">
        <button type="button" onClick={copy} className={softBtn}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Nusxalandi" : "Nusxalash"}
        </button>
        <button type="button" onClick={onDone} className={primaryBtn}>Tayyor</button>
      </div>
    </div>
  )
}

const inputCls =
  "w-full h-control-md border border-line rounded-control px-3 text-base text-ink bg-surface placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
const softBtn =
  "flex items-center gap-2 px-3.5 h-control-md rounded-control bg-mute-soft text-base font-medium text-ink hover:bg-mute-soft-hover transition-colors disabled:opacity-50"
const primaryBtn =
  "px-4 h-control-md rounded-control bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-muted">{label}</label>
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
