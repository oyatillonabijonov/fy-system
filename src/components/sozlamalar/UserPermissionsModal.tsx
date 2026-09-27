import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import {
  useUserPermissions,
  useUpdateUserPermissions,
  useUpdateUserRole,
  useDeactivateUser,
  useActivateUser,
} from "@/hooks/useUsers"
import { useDialog } from "@/hooks/useDialog"
import { MODULES, ROLE_LABELS, type ModuleName, type UserRole, type UserProfile } from "@/lib/supabase/queries/auth"

interface UserPermissionsModalProps {
  isOpen: boolean
  onClose: () => void
  user: UserProfile | null
  onSuccess?: (message: string) => void
}

interface InnerProps {
  onClose: () => void
  user: UserProfile
  onSuccess?: (message: string) => void
}

interface FormProps extends InnerProps {
  initialModules: ModuleName[]
}

function PermissionsForm({ onClose, user, onSuccess }: InnerProps) {
  const permsQuery = useUserPermissions(user.id)

  if (permsQuery.isLoading || !permsQuery.data) {
    return (
      <PermissionsShell user={user} onClose={onClose} loading>
        <div className="text-sm text-ink-muted italic py-4">Yuklanmoqda...</div>
      </PermissionsShell>
    )
  }

  const initialModules = permsQuery.data.filter((p) => p.can_view).map((p) => p.module)
  return <LoadedPermissionsForm onClose={onClose} user={user} onSuccess={onSuccess} initialModules={initialModules} />
}

function PermissionsShell({
  user,
  onClose,
  loading,
  children,
}: {
  user: UserProfile
  onClose: () => void
  loading?: boolean
  children: React.ReactNode
}) {
  const initials = user.full_name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
  const titleId = useId()
  const panelRef = useDialog<HTMLDivElement>(() => !loading && onClose())
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-surface-overlay backdrop-blur-[2px] z-[110]"
        onClick={() => !loading && onClose()}
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
          className="bg-surface-raised rounded-overlay w-full max-w-lg pointer-events-auto max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <h2 id={titleId} className="text-md font-bold text-ink">Foydalanuvchi sozlamalari</h2>
            <button onClick={onClose} aria-label="Yopish" className="p-1.5 rounded-item hover:bg-mute-ghost-hover transition-colors">
              <X size={20} className="text-ink-muted" />
            </button>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3 p-3 bg-surface-sunken rounded-control">
              <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center overflow-hidden flex-shrink-0">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-base font-bold text-ink-on-accent">{initials}</span>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-base font-bold text-ink truncate">{user.full_name}</span>
                <span className="text-sm text-ink-muted truncate">{user.email}</span>
                {!user.is_active && (
                  <span className="mt-1 inline-flex w-fit px-1.5 py-0.5 rounded-tag text-xs font-bold bg-danger-soft text-danger-dark">
                    Faolsiz
                  </span>
                )}
              </div>
            </div>
            {children}
          </div>
        </div>
      </motion.div>
    </>
  )
}

function LoadedPermissionsForm({ onClose, user, onSuccess, initialModules }: FormProps) {
  const updatePerms = useUpdateUserPermissions()
  const updateRole = useUpdateUserRole()
  const deactivate = useDeactivateUser()
  const activate = useActivateUser()

  const [role, setRole] = useState<UserRole>(user.role)
  const [modules, setModules] = useState<Set<ModuleName>>(() => new Set(initialModules))
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const roleId = useId()

  const saving = updatePerms.isPending || updateRole.isPending || deactivate.isPending || activate.isPending

  function toggleModule(m: ModuleName) {
    setModules((prev) => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  async function handleSave() {
    setError(null)
    try {
      const tasks: Promise<unknown>[] = []
      if (role !== user.role) {
        tasks.push(updateRole.mutateAsync({ userId: user.id, role }))
      }
      tasks.push(updatePerms.mutateAsync({ userId: user.id, modules: Array.from(modules) }))
      await Promise.all(tasks)
      onSuccess?.("Saqlandi")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    }
  }

  async function handleDeactivate() {
    setError(null)
    try {
      await deactivate.mutateAsync(user.id)
      onSuccess?.("Foydalanuvchi faolsizlantirildi")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    }
  }

  async function handleActivate() {
    setError(null)
    try {
      await activate.mutateAsync(user.id)
      onSuccess?.("Foydalanuvchi qayta faollashtirildi")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    }
  }

  return (
    <PermissionsShell user={user} onClose={onClose} loading={saving}>
      <>
        {error && (
              <div className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark border border-danger-soft">
                {error}
              </div>
            )}

            {/* Role */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={roleId} className="text-sm font-medium text-ink-muted">Rol</label>
              <select
                id={roleId}
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={saving}
                className="w-full border border-line rounded-control px-3 py-2 text-base text-ink focus:outline-none focus:border-line-focus transition-colors"
              >
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>

            {/* Modules */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink-muted">Modullar</span>
              <div className="grid grid-cols-2 gap-2">
                {MODULES.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 px-3 py-2 border border-line rounded-control cursor-pointer hover:bg-mute-ghost-hover transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={modules.has(m.id)}
                      onChange={() => toggleModule(m.id)}
                      disabled={saving}
                      className="w-4 h-4 rounded-checkbox accent-accent cursor-pointer"
                    />
                    <span className="text-base text-ink">{m.label}</span>
                  </label>
                ))}
              </div>
              {role === "admin" && (
                <span className="text-xs text-ink-muted italic">
                  Administrator har bir bo'limga avtomatik kirish huquqiga ega — modullar tanlash shart emas.
                </span>
              )}
            </div>

            {/* Deactivate / Activate confirmation */}
            <div className="border-t border-line pt-4">
              {user.is_active ? (
                confirmDeactivate ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-muted flex-1">Aniqmi?</span>
                    <button
                      onClick={() => setConfirmDeactivate(false)}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-item text-sm font-medium text-ink-muted hover:text-ink"
                    >
                      Yo'q
                    </button>
                    <button
                      onClick={handleDeactivate}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-item text-sm font-bold text-white bg-danger hover:bg-danger/90"
                    >
                      Ha, faolsizlantir
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeactivate(true)}
                    disabled={saving}
                    className="text-sm font-bold text-danger-text hover:text-danger-dark transition-colors"
                  >
                    Faolsizlantirish
                  </button>
                )
              ) : (
                <button
                  onClick={handleActivate}
                  disabled={saving}
                  className="text-sm font-bold text-ink hover:text-ink transition-colors"
                >
                  Qayta faollashtirish
                </button>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-control text-base font-medium text-ink-muted hover:text-ink transition-colors"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-5 py-2 rounded-control text-base font-bold text-ink-on-accent transition-colors ${
                  saving ? "bg-mute-soft cursor-not-allowed" : "bg-accent hover:bg-accent-hover"
                }`}
              >
                {saving ? "Saqlanmoqda..." : "Saqlash"}
              </button>
            </div>
      </>
    </PermissionsShell>
  )
}

export function UserPermissionsModal({ isOpen, onClose, user, onSuccess }: UserPermissionsModalProps) {
  return (
    <AnimatePresence>
      {isOpen && user && <PermissionsForm key={user.id} onClose={onClose} user={user} onSuccess={onSuccess} />}
    </AnimatePresence>
  )
}
