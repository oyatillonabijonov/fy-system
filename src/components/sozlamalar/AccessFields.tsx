import { MODULES, EDITABLE_MODULE, ROLE_LABELS, type ModuleGrants, type ModuleName, type UserRole } from "@/lib/supabase/queries/auth"

const ROLE_HINTS: Record<UserRole, string> = {
  xodim: "Faqat quyida belgilangan bo'limlarni ko'radi",
  manager: "Xodim kabi, belgilangan bo'limlar bilan ishlaydi",
  admin: "Hamma bo'limlar, xodimlar va ruxsatlarni boshqaradi",
}

/** Role as a segmented control. `locked` = editing your own account (no self-demotion). */
export function RoleField({ value, onChange, locked }: { value: UserRole; onChange: (r: UserRole) => void; locked?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink-muted">Rol</span>
      <div role="radiogroup" aria-label="Rol" className="grid grid-cols-3 gap-1 p-1 rounded-control bg-surface-sunken">
        {(["xodim", "manager", "admin"] as UserRole[]).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={value === r}
            disabled={locked}
            onClick={() => onChange(r)}
            className={`h-8 rounded-item text-base font-medium transition-colors disabled:cursor-not-allowed ${value === r ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}
          >
            {ROLE_LABELS[r]}
          </button>
        ))}
      </div>
      <span className="text-sm text-ink-faint">
        {locked ? "O'z rolingizni o'zgartira olmaysiz" : ROLE_HINTS[value]}
      </span>
    </div>
  )
}

/** Module access: one switch per module; Moliya adds an "edit" level. Admins get everything. */
export function ModuleAccessField({ role, value, onChange }: { role: UserRole; value: ModuleGrants; onChange: (g: ModuleGrants) => void }) {
  if (role === "admin") {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink-muted">Kirish huquqlari</span>
        <p className="px-3.5 py-3 rounded-control bg-surface-sunken text-base text-ink-muted">
          Administrator barcha bo'limlarga kira oladi.
        </p>
      </div>
    )
  }

  function toggle(m: ModuleName) {
    const next = { ...value }
    if (m in next) delete next[m]
    else next[m] = false
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink-muted">Kirish huquqlari</span>
      <div className="flex flex-col rounded-control bg-surface-sunken px-3.5">
        {MODULES.map((m) => {
          const on = m.id in value
          return (
            <div key={m.id} className="py-3 border-b border-line last:border-0">
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="flex-1 min-w-0">
                  <span className="block text-base text-ink">{m.label}</span>
                  <span className="block text-sm text-ink-muted">{m.desc}</span>
                </span>
                <input type="checkbox" checked={on} onChange={() => toggle(m.id)} className="sr-only peer" />
                <span aria-hidden className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-line-focus ${on ? "bg-accent" : "bg-mute-soft-hover"}`}>
                  <span className={`absolute top-0.5 size-4 rounded-full bg-surface transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
                </span>
              </label>
              {on && m.id === EDITABLE_MODULE && (
                <label className="flex items-center gap-2 mt-2.5 text-base text-ink cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={value[m.id] === true}
                    onChange={(e) => onChange({ ...value, [m.id]: e.target.checked })}
                    className="size-4 accent-accent cursor-pointer"
                  />
                  To'lov va xarajat kiritish, tahrirlash
                </label>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
