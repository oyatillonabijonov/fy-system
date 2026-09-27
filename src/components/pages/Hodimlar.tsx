import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, MagnifyingGlass } from "@phosphor-icons/react"
import { useUsers } from "@/hooks/useUsers"
import { CreateUserModal } from "@/components/sozlamalar/CreateUserModal"
import { ROLE_LABELS, ROLE_BADGE_VARIANT, type UserProfile } from "@/lib/supabase/queries/auth"
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate, formatPhone } from "@/lib/format"
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
}

export function Hodimlar() {
  const navigate = useNavigate()
  const { data: users = [], isLoading } = useUsers()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState("")

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users
    const q = search.toLowerCase()
    return users.filter(
      (u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    )
  }, [users, search])
  const paged = usePaged(filteredUsers)

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink" style={{ letterSpacing: "-0.4px" }}>
            Hodimlar
          </h1>
          <p className="text-base text-ink-muted mt-1">
            Tizim foydalanuvchilarini boshqarish
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 h-control-md bg-accent text-ink-on-accent rounded-control text-base font-bold hover:bg-accent-hover transition-colors"
        >
          <Plus size={16} />
          Yangi xodim
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <MagnifyingGlass
          size={16}
         
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
        <input
          type="text"
          placeholder="Ism yoki email bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 h-control-md border border-line rounded-control text-base text-ink placeholder:text-ink-faint focus:border-line-focus outline-none transition-colors"
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Jami xodimlar" value={String(users.length)} />
        <StatCard label="Adminlar" value={String(users.filter((u) => u.role === "admin").length)} />
        <StatCard label="Faol xodimlar" value={String(users.filter((u) => u.is_active).length)} />
      </div>

      {/* Users table */}
      <div>
        {isLoading ? (
          <div className="p-8 text-center text-base text-ink-muted">Yuklanmoqda...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-base font-bold text-ink mb-1">
              {search ? "Mos keluvchi xodim topilmadi" : "Xodim topilmadi"}
            </p>
            <p className="text-sm text-ink-muted">
              {search ? "Boshqa qidiruv so'zini sinab ko'ring" : "Yangi xodim qo'shish uchun yuqoridagi tugmani bosing"}
            </p>
          </div>
        ) : (
          <>
          <div className={tbl.scroll}>
          <table className={tbl.table}>
            <thead>
              <tr>
                <th className={tbl.th}>Xodim</th>
                <th className={tbl.th}>Email</th>
                <th className={tbl.th}>Rol</th>
                <th className={tbl.th}>Holat</th>
                <th className={`${tbl.th} text-right`}>Yaratilgan</th>
              </tr>
            </thead>
            <tbody>
              {paged.pageItems.map((user) => (
                <UserRow key={user.id} user={user} onClick={() => navigate(`/hodimlar/${user.id}`)} />
              ))}
            </tbody>
          </table>
          </div>
          <Pager page={paged.page} pageCount={paged.pageCount} total={filteredUsers.length} onPage={paged.setPage} />
          </>
        )}
      </div>

      {/* Create modal stays on the list page */}
      <CreateUserModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-line rounded-surface p-5">
      <p className="text-sm font-medium text-ink-muted mb-2">{label}</p>
      <p className="text-xl font-bold text-ink" style={{ letterSpacing: "-0.4px" }}>
        {value}
      </p>
    </div>
  )
}

function UserRow({ user, onClick }: { user: UserProfile; onClick: () => void }) {
  const initials = getInitials(user.full_name)

  return (
    <tr
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
      className={`${tbl.tr} cursor-pointer`}
    >
      <td className={tbl.td}>
        <div className="flex items-center gap-3">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.full_name} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-ink-on-accent">
              {initials}
            </div>
          )}
          <div>
            <p className="text-base font-medium text-ink">{user.full_name}</p>
            {user.phone && <p className="text-xs text-ink-muted">{formatPhone(user.phone)}</p>}
          </div>
        </div>
      </td>
      <td className={`${tbl.td} text-ink-muted`}>{user.email}</td>
      <td className={tbl.td}>
        <StatusBadge label={ROLE_LABELS[user.role]} variant={ROLE_BADGE_VARIANT[user.role]} />
      </td>
      <td className={tbl.td}>
        <StatusBadge label={user.is_active ? "Faol" : "Faol emas"} variant={user.is_active ? 'success' : 'danger'} />
      </td>
      <td className={`${tbl.td} text-right text-sm text-ink-muted tabular-nums`}>
        {formatDate(user.created_at)}
      </td>
    </tr>
  )
}
