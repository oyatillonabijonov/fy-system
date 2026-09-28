import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import { useUserPermissions, useUpdateUserPermissions, useUpdateUserRole } from "@/hooks/useUsers"
import { useAuth } from "@/context/AuthContext"
import { useDialog } from "@/hooks/useDialog"
import type { ModuleGrants, UserRole, UserProfile } from "@/lib/supabase/queries/auth"
import { RoleField, ModuleAccessField } from "./AccessFields"

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

/** Role + module access for one staff member. Deactivation lives on the profile page. */
function PermissionsDialog({ onClose, user, onSuccess }: InnerProps) {
  const permsQuery = useUserPermissions(user.id)
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const panelRef = useDialog<HTMLDivElement>(() => !busy && onClose())

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-surface-overlay z-[110]"
        onClick={() => !busy && onClose()}
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
          <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-md font-semibold text-ink">Ruxsatlar</h2>
              <p className="text-sm text-ink-muted truncate">{user.full_name} · {user.email}</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Yopish" className="size-8 rounded-item flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover transition-colors">
              <X size={18} />
            </button>
          </div>

          {permsQuery.isLoading || !permsQuery.data ? (
            <div className="px-6 pb-8 text-base text-ink-muted">Yuklanmoqda…</div>
          ) : (
            <PermissionsForm
              user={user}
              initial={Object.fromEntries(permsQuery.data.filter((p) => p.can_view).map((p) => [p.module, p.can_edit]))}
              onBusy={setBusy}
              onClose={onClose}
              onSuccess={onSuccess}
            />
          )}
        </div>
      </motion.div>
    </>
  )
}

function PermissionsForm({ user, initial, onBusy, onClose, onSuccess }: InnerProps & { initial: ModuleGrants; onBusy: (b: boolean) => void }) {
  const { user: me } = useAuth()
  const updatePerms = useUpdateUserPermissions()
  const updateRole = useUpdateUserRole()
  const [role, setRole] = useState<UserRole>(user.role)
  const [grants, setGrants] = useState<ModuleGrants>(initial)
  const [error, setError] = useState<string | null>(null)
  const saving = updatePerms.isPending || updateRole.isPending
  const isSelf = me?.id === user.id

  async function handleSave() {
    setError(null)
    onBusy(true)
    try {
      if (role !== user.role) await updateRole.mutateAsync({ userId: user.id, role })
      // Grants are kept for admins too, so demoting later restores what they had
      await updatePerms.mutateAsync({ userId: user.id, grants })
      onSuccess?.("Ruxsatlar saqlandi")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    } finally {
      onBusy(false)
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 pb-2 flex flex-col gap-5">
        {error && (
          <div role="alert" className="px-3.5 py-2.5 rounded-control bg-danger-soft text-sm font-medium text-danger-text">{error}</div>
        )}
        <RoleField value={role} onChange={setRole} locked={isSelf} />
        <ModuleAccessField role={role} value={grants} onChange={setGrants} />
      </div>
      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-3.5 h-control-md rounded-control bg-mute-soft text-base font-medium text-ink hover:bg-mute-soft-hover transition-colors disabled:opacity-50"
        >
          Bekor qilish
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 h-control-md rounded-control bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {saving ? "Saqlanmoqda…" : "Saqlash"}
        </button>
      </div>
    </>
  )
}

export function UserPermissionsModal({ isOpen, onClose, user, onSuccess }: UserPermissionsModalProps) {
  return (
    <AnimatePresence>
      {isOpen && user && <PermissionsDialog key={user.id} onClose={onClose} user={user} onSuccess={onSuccess} />}
    </AnimatePresence>
  )
}
