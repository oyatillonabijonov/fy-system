import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, MagnifyingGlass } from "@phosphor-icons/react"
import { useUsers } from "@/hooks/useUsers"
import { CreateUserModal } from "@/components/sozlamalar/CreateUserModal"
import { ROLE_LABELS, type UserProfile, type UserRole } from "@/lib/supabase/queries/auth"

const ROLE_BADGE: Record<UserRole, string> = {
  admin: "bg-purple-50 text-purple-700",
  manager: "bg-blue-50 text-blue-700",
  xodim: "bg-gray-50 text-gray-700",
}

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

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-[#141414]" style={{ letterSpacing: "-0.4px" }}>
            Hodimlar
          </h1>
          <p className="text-[13px] text-[#999999] mt-1">
            Tizim foydalanuvchilarini boshqarish
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-[#000] transition-colors"
        >
          <Plus weight="bold" size={16} />
          Yangi xodim
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <MagnifyingGlass
          size={16}
          weight="bold"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]"
        />
        <input
          type="text"
          placeholder="Ism yoki email bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-[#E5E5E5] rounded-[8px] text-[13px] text-[#141414] placeholder:text-[#CCC] focus:border-[#141414] outline-none transition-colors"
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Jami xodimlar" value={String(users.length)} />
        <StatCard label="Adminlar" value={String(users.filter((u) => u.role === "admin").length)} />
        <StatCard label="Faol xodimlar" value={String(users.filter((u) => u.is_active).length)} />
      </div>

      {/* Users table */}
      <div className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-[13px] text-[#999]">Yuklanmoqda...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[14px] font-bold text-[#141414] mb-1">
              {search ? "Mos keluvchi xodim topilmadi" : "Xodim topilmadi"}
            </p>
            <p className="text-[12px] text-[#999]">
              {search ? "Boshqa qidiruv so'zini sinab ko'ring" : "Yangi xodim qo'shish uchun yuqoridagi tugmani bosing"}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-[#FBFBFB] border-b border-[#F0F0F0]">
                <th className="px-6 py-4 text-left text-[11px] font-bold text-[#999999] uppercase tracking-wide">Xodim</th>
                <th className="px-6 py-4 text-left text-[11px] font-bold text-[#999999] uppercase tracking-wide">Email</th>
                <th className="px-6 py-4 text-left text-[11px] font-bold text-[#999999] uppercase tracking-wide">Rol</th>
                <th className="px-6 py-4 text-left text-[11px] font-bold text-[#999999] uppercase tracking-wide">Holat</th>
                <th className="px-6 py-4 text-right text-[11px] font-bold text-[#999999] uppercase tracking-wide">Yaratilgan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0F0]">
              {filteredUsers.map((user) => (
                <UserRow key={user.id} user={user} onClick={() => navigate(`/hodimlar/${user.id}`)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal stays on the list page */}
      <CreateUserModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-5">
      <p className="text-[12px] font-medium text-[#999999] mb-2">{label}</p>
      <p className="text-[22px] font-bold text-[#141414]" style={{ letterSpacing: "-0.4px" }}>
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
      className="hover:bg-[#F9F9F8] cursor-pointer transition-colors"
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.full_name} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#141414] flex items-center justify-center text-[11px] font-bold text-white">
              {initials}
            </div>
          )}
          <div>
            <p className="text-[13px] font-bold text-[#141414]">{user.full_name}</p>
            {user.phone && <p className="text-[11px] text-[#999]">{user.phone}</p>}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-[13px] text-[#666]">{user.email}</td>
      <td className="px-6 py-4">
        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${ROLE_BADGE[user.role]}`}>
          {ROLE_LABELS[user.role]}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${user.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {user.is_active ? "Faol" : "Faol emas"}
        </span>
      </td>
      <td className="px-6 py-4 text-right text-[12px] text-[#999]">
        {new Date(user.created_at).toLocaleDateString("uz-UZ")}
      </td>
    </tr>
  )
}
