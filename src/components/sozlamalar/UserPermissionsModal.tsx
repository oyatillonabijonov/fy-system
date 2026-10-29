import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import { useUserPermissions, useUpdateUserPermissions, useUpdateUserRole } from "@/hooks/useUsers"
import { useAuth } from "@/context/AuthContext"
import { useDialog } from "@/hooks/useDialog"
import { useMedia } from "@/hooks/useMedia"
import { sheet, sheetMotion } from "@/components/ui/sheetStyles"
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
  const onPhone = useMedia("(width < 40rem)")

  return (
    <div className={sheet.wrap}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-surface-overlay"
        onClick={() => !busy && onClose()}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        {...sheetMotion(onPhone)}
        className={`${sheet.panel} sm:max-w-lg sm:border border-line`}
      >
          <div className={sheet.grabber} />
          <div className="flex items-start justify-between gap-3 px-4 sm:px-6 pt-2 sm:pt-5 pb-3 sm:pb-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg sm:text-md font-semibold text-ink">Ruxsatlar</h2>
              <p className="text-sm text-ink-muted truncate">{user.full_name} · {user.email}</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Yopish" className="size-10 sm:size-8 -mr-2 sm:mr-0 shrink-0 rounded-full sm:rounded-item flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover transition-colors">
              <X size={18} />
            </button>
          </div>

          {permsQuery.isLoading || !permsQuery.data ? (
            <div className="px-4 sm:px-6 pb-8 text-base text-ink-muted">Yuklanmoqda…</div>
          ) : (
            <PermissionsForm
              user={user}
              initial={Object.fromEntries(permsQuery.data.filter((p) => p.can_view).map((p) => [p.module, p.can_edit]))}
              onBusy={setBusy}
              onClose={onClose}
              onSuccess={onSuccess}
            />
          )}
      </motion.div>
    </div>
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
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-2 flex flex-col gap-5">
        {error && (
          <div role="alert" className="px-3.5 py-2.5 rounded-control bg-danger-soft text-sm font-medium text-danger-text">{error}</div>
        )}
        <RoleField value={role} onChange={setRole} locked={isSelf} />
        <ModuleAccessField role={role} value={grants} onChange={setGrants} />
      </div>
      <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-4 max-sm:pb-[calc(16px+env(safe-area-inset-bottom))] border-t border-line">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-3.5 h-control-md max-sm:h-12 rounded-full whitespace-nowrap bg-mute-soft text-base font-medium text-ink hover:bg-mute-soft-hover transition-colors disabled:opacity-50"
        >
          Bekor qilish
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 h-control-md max-sm:h-12 max-sm:flex-1 rounded-full whitespace-nowrap bg-accent text-ink-on-accent text-base font-medium max-sm:font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50"
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
