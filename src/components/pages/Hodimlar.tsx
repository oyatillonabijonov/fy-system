import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, MagnifyingGlass } from "@phosphor-icons/react"
import { useUsers } from "@/hooks/useUsers"
import { CreateUserModal } from "@/components/sozlamalar/CreateUserModal"
import { ROLE_LABELS, type UserProfile, type UserRole } from "@/lib/supabase/queries/auth"
import { departmentLabel, departmentColor } from "@/lib/constants/employee"
import { formatPhone } from "@/lib/format"
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
}

const ROLE_FILTERS: { id: UserRole | "all"; label: string }[] = [
  { id: "all", label: "Hammasi" },
  { id: "admin", label: "Administrator" },
  { id: "manager", label: "Menejer" },
  { id: "xodim", label: "Xodim" },
]

export function Hodimlar() {
  const navigate = useNavigate()
  const { data: users = [], isLoading } = useUsers()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState("")
  const [role, setRole] = useState<UserRole | "all">("all")

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(
      (u) =>
        (role === "all" || u.role === role) &&
        (!q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.position ?? "").toLowerCase().includes(q)),
    )
  }, [users, search, role])
  const paged = usePaged(filteredUsers)

  const count = (id: UserRole | "all") => (id === "all" ? users.length : users.filter((u) => u.role === id).length)

  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setRole(f.id)}
              aria-pressed={role === f.id}
              className={`flex items-center gap-1.5 px-3.5 h-control-md rounded-full text-base font-medium transition-colors ${role === f.id ? "bg-mute-soft text-ink" : "text-ink-muted hover:bg-mute-ghost-hover hover:text-ink"}`}
            >
              {f.label}
              <span className="text-sm text-ink-faint tabular-nums">{count(f.id)}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              type="search"
              placeholder="Ism, email yoki lavozim"
              aria-label="Qidirish"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 h-control-md pl-9 pr-3 rounded-control bg-surface-sunken text-base text-ink placeholder:text-ink-faint border border-transparent outline-none focus:border-line-focus"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 h-control-md bg-accent text-ink-on-accent rounded-control text-base font-medium hover:bg-accent-hover transition-colors"
          >
            <Plus size={16} />
            Yangi xodim
          </button>
        </div>
      </div>

      {/* Users table */}
      <div className={tbl.scroll}>
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={tbl.th}>Xodim</th>
              <th className={tbl.th}>Bo'lim</th>
              <th className={tbl.th}>Rol</th>
              <th className={tbl.th}>Aloqa</th>
              <th className={tbl.th}>Holat</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className={tbl.empty}>Yuklanmoqda…</td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><td colSpan={5} className={tbl.empty}>{search || role !== "all" ? "Mos keluvchi xodim topilmadi" : "Hali xodim qo'shilmagan"}</td></tr>
            ) : paged.pageItems.map((user) => (
              <UserRow key={user.id} user={user} onClick={() => navigate(`/hodimlar/${user.id}`)} />
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={paged.page} pageCount={paged.pageCount} total={filteredUsers.length} onPage={paged.setPage} />

      {/* Create modal stays on the list page */}
      <CreateUserModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}

function UserRow({ user, onClick }: { user: UserProfile; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
      className={`${tbl.tr} cursor-pointer`}
    >
      <td className={tbl.td}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="size-9 rounded-full flex-shrink-0 overflow-hidden bg-mute-soft flex items-center justify-center text-sm font-semibold text-ink-muted">
            {user.avatar_url ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" /> : getInitials(user.full_name)}
          </span>
          <div className="min-w-0">
            <p className="text-base font-medium text-ink truncate">{user.full_name}</p>
            <p className="text-sm text-ink-muted truncate">{user.position ?? "Lavozim ko'rsatilmagan"}</p>
          </div>
        </div>
      </td>
      <td className={tbl.td}>
        {user.department ? (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="size-2 rounded-full" style={{ backgroundColor: departmentColor(user.department) }} />
            {departmentLabel(user.department)}
          </span>
        ) : <span className="text-ink-faint">—</span>}
      </td>
      <td className={`${tbl.td} whitespace-nowrap`}>{ROLE_LABELS[user.role]}</td>
      <td className={tbl.td}>
        <p className="text-ink-muted">{user.email}</p>
        {user.phone && <p className="text-sm text-ink-faint tabular-nums">{formatPhone(user.phone)}</p>}
      </td>
      <td className={tbl.td}>
        <span className={`flex items-center gap-2 whitespace-nowrap ${user.is_active ? "" : "text-ink-muted"}`}>
          <span className={`size-2 rounded-full ${user.is_active ? "bg-success" : "bg-mute-soft-hover"}`} />
          {user.is_active ? "Faol" : "Faol emas"}
        </span>
      </td>
    </tr>
  )
}
