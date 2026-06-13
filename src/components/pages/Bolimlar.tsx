import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Buildings, Users as UsersIcon, Target, Crown, X } from "@phosphor-icons/react"
import { useDepartmentStats } from "@/hooks/useUsers"
import { useDepartmentKpi, useSetDepartmentHead } from "@/hooks/useKpi"
import { useAuth } from "@/context/AuthContext"
import { DEPARTMENTS, departmentLabel, departmentColor, type Department } from "@/lib/constants/employee"
import type { DepartmentStats, UserProfile } from "@/lib/supabase/queries/auth"

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
}

function fmtSom(n: number): string {
  return new Intl.NumberFormat("uz-UZ").format(n)
}

function progressColor(p: number): string {
  if (p < 50) return "#EF4444"
  if (p < 80) return "#F59E0B"
  if (p < 100) return "#3B82F6"
  return "#10B981"
}

export function Bolimlar() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const { data: stats = [], isLoading } = useDepartmentStats()

  const now = new Date()
  const [period] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })

  const monthName = new Date(period.year, period.month - 1, 1)
    .toLocaleDateString("uz-UZ", { month: "long", year: "numeric" })

  const totalEmployees = stats.reduce((sum, s) => sum + s.total_employees, 0)
  const totalActive = stats.reduce((sum, s) => sum + s.active_employees, 0)
  const headsAssigned = stats.filter((s) => s.head_user_id).length

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-[#141414]" style={{ letterSpacing: "-0.4px" }}>
            Bo'limlar
          </h1>
          <p className="text-[13px] text-[#999999] mt-1">
            Tizim bo'limlari va ulardagi hodimlar — {monthName}
          </p>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <TopStatCard
          icon={<Buildings size={18} weight="bold" />}
          label="Bo'limlar"
          value={String(stats.filter((s) => s.total_employees > 0).length)}
          subtitle={`Jami ${DEPARTMENTS.length} ta bo'lim`}
        />
        <TopStatCard
          icon={<UsersIcon size={18} weight="bold" />}
          label="Jami hodimlar"
          value={String(totalEmployees)}
          subtitle={`${totalActive} ta faol`}
        />
        <TopStatCard
          icon={<Crown size={18} weight="bold" />}
          label="Bo'lim boshliqlari"
          value={String(headsAssigned)}
          subtitle={`${stats.length - headsAssigned} ta tayinlanmagan`}
        />
        <TopStatCard
          icon={<Target size={18} weight="bold" />}
          label="Joriy davr"
          value={monthName}
          subtitle="KPI hisobotlari"
        />
      </div>

      {/* Department cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#F0F0F0] rounded-[12px] p-6 h-[240px] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.map((s) => (
            <DepartmentCard
              key={s.department}
              stats={s}
              period={period}
              isAdmin={isAdmin}
              onMemberClick={(id) => navigate(`/hodimlar/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Top stat card ───────────────────────────────────────

function TopStatCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtitle: string
}) {
  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[#666]">{icon}</div>
        <span className="text-[12px] text-[#666] font-medium">{label}</span>
      </div>
      <p className="text-[20px] font-bold text-[#141414] mb-1" style={{ letterSpacing: "-0.4px" }}>
        {value}
      </p>
      <p className="text-[11px] text-[#999]">{subtitle}</p>
    </div>
  )
}

// ─── Department card ─────────────────────────────────────

function DepartmentCard({
  stats,
  period,
  isAdmin,
  onMemberClick,
}: {
  stats: DepartmentStats
  period: { year: number; month: number }
  isAdmin: boolean
  onMemberClick: (id: string) => void
}) {
  const color = departmentColor(stats.department)
  const label = departmentLabel(stats.department)
  const { data: kpi } = useDepartmentKpi(stats.department, period.year, period.month)
  const [showAssignHead, setShowAssignHead] = useState(false)

  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-6 flex flex-col gap-5">
      {/* Department header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center"
            style={{ backgroundColor: color + "15" }}
          >
            <Buildings size={18} weight="bold" style={{ color }} />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-[#141414]" style={{ letterSpacing: "-0.4px" }}>
              {label}
            </h3>
            <p className="text-[11px] text-[#999]">
              {stats.total_employees} ta hodim · {stats.active_employees} faol
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {stats.head_name && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-[#F5F5F5] rounded-[6px]">
              <Crown size={12} weight="fill" className="text-[#F59E0B]" />
              <span className="text-[11px] font-bold text-[#666]">{stats.head_name}</span>
            </div>
          )}
          {isAdmin && stats.members.length > 0 && (
            <button
              onClick={() => setShowAssignHead(true)}
              className="text-[11px] font-bold text-[#666] hover:text-[#141414] underline transition-colors"
            >
              {stats.head_user_id ? "O'zgartirish" : "Boshliq tayinlash"}
            </button>
          )}
        </div>
      </div>

      {/* KPI summary */}
      {kpi && kpi.members_with_targets > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <KpiMiniCard
            label="Tushum"
            actual={kpi.total_revenue_actual}
            target={kpi.total_revenue_target}
            progress={kpi.revenue_progress}
            isCurrency
          />
          <KpiMiniCard
            label="Yopilgan lidlar"
            actual={kpi.total_leads_closed}
            target={kpi.total_leads_target}
            progress={kpi.leads_progress}
          />
        </div>
      ) : stats.total_employees > 0 ? (
        <div className="py-3 text-center bg-[#FBFBFB] rounded-[8px] border border-dashed border-[#E5E5E5]">
          <p className="text-[11px] text-[#999]">
            Bu davr uchun KPI maqsadlari belgilanmagan
          </p>
        </div>
      ) : null}

      {/* Members */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold text-[#666] uppercase tracking-wide">Hodimlar</span>
          <span className="text-[10px] text-[#999]">{stats.members.length} ta</span>
        </div>

        {stats.members.length === 0 ? (
          <p className="text-[12px] text-[#999] py-3 text-center bg-[#FBFBFB] rounded-[8px]">
            Bu bo'limda hodim yo'q
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {stats.members.slice(0, 5).map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                isHead={m.id === stats.head_user_id}
                onClick={() => onMemberClick(m.id)}
              />
            ))}
            {stats.members.length > 5 && (
              <p className="text-[11px] text-[#999] text-center pt-1">
                +{stats.members.length - 5} ta hodim
              </p>
            )}
          </div>
        )}
      </div>

      <AssignHeadModal
        isOpen={showAssignHead}
        department={stats.department}
        members={stats.members}
        currentHeadId={stats.head_user_id}
        onClose={() => setShowAssignHead(false)}
      />
    </div>
  )
}

// ─── KPI mini card ───────────────────────────────────────

function KpiMiniCard({
  label,
  actual,
  target,
  progress,
  isCurrency,
}: {
  label: string
  actual: number
  target: number
  progress: number
  isCurrency?: boolean
}) {
  const color = progressColor(progress)
  return (
    <div className="bg-[#FBFBFB] border border-[#F0F0F0] rounded-[8px] p-3">
      <p className="text-[10px] text-[#999] mb-1.5">{label}</p>
      <div className="mb-2">
        <span className="text-[14px] font-bold text-[#141414]">{fmtSom(actual)}</span>
        <span className="text-[10px] text-[#999] ml-1">
          / {fmtSom(target)}{isCurrency ? " so'm" : ""}
        </span>
      </div>
      <div className="h-1 bg-[#F0F0F0] rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[10px] font-bold mt-1.5" style={{ color }}>{progress}%</p>
    </div>
  )
}

// ─── Member row ──────────────────────────────────────────

function MemberRow({
  member,
  isHead,
  onClick,
}: {
  member: UserProfile
  isHead: boolean
  onClick: () => void
}) {
  const initials = getInitials(member.full_name)
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 p-2 rounded-[8px] hover:bg-[#F9F9F8] transition-colors text-left"
    >
      {member.avatar_url ? (
        <img
          src={member.avatar_url}
          alt={member.full_name}
          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-[#141414] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold text-[#141414] truncate">{member.full_name}</span>
          {isHead && <Crown size={11} weight="fill" className="text-[#F59E0B] flex-shrink-0" />}
        </div>
        {member.position && <p className="text-[10px] text-[#999] truncate">{member.position}</p>}
      </div>
      {!member.is_active && (
        <span className="text-[10px] text-red-500 flex-shrink-0">Faol emas</span>
      )}
    </button>
  )
}

// ─── Assign head modal ───────────────────────────────────

function AssignHeadModal({
  isOpen,
  onClose,
  department,
  members,
  currentHeadId,
}: {
  isOpen: boolean
  onClose: () => void
  department: Department
  members: UserProfile[]
  currentHeadId: string | null
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <AssignHeadForm
          key={department}
          onClose={onClose}
          department={department}
          members={members}
          currentHeadId={currentHeadId}
        />
      )}
    </AnimatePresence>
  )
}

function AssignHeadForm({
  onClose,
  department,
  members,
  currentHeadId,
}: {
  onClose: () => void
  department: Department
  members: UserProfile[]
  currentHeadId: string | null
}) {
  const [selected, setSelected] = useState<string>(currentHeadId ?? "")
  const [error, setError] = useState<string | null>(null)
  const setHead = useSetDepartmentHead()
  const saving = setHead.isPending

  async function handleSave() {
    setError(null)
    if (!selected) {
      setError("Hodim tanlanmagan")
      return
    }
    try {
      await setHead.mutateAsync({ department, userId: selected })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik")
    }
  }

  async function handleRemove() {
    setError(null)
    try {
      await setHead.mutateAsync({ department, userId: null })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik")
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
          className="bg-white rounded-[12px] w-full max-w-md shadow-2xl pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[16px] font-bold text-[#141414]">Bo'lim boshlig'i</h2>
              <span className="text-[11px] text-[#999]">{departmentLabel(department)} bo'limi</span>
            </div>
            <button onClick={onClose} disabled={saving} className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors">
              <X size={20} className="text-[#999]" weight="bold" />
            </button>
          </div>

          <div className="p-5 flex flex-col gap-4">
            {error && (
              <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#999]">Hodim</label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={saving}
                className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
              >
                <option value="">— Tanlang —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}{m.position ? ` · ${m.position}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#F0F0F0]">
            {currentHeadId ? (
              <button
                onClick={handleRemove}
                disabled={saving}
                className="text-[12px] font-bold text-red-600 hover:text-red-700 transition-colors"
              >
                Boshliqni olib tashlash
              </button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-[8px] text-[13px] font-medium text-[#999] hover:text-[#666] transition-colors"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-5 py-2 rounded-[8px] text-[13px] font-bold text-white transition-colors ${
                  saving ? "bg-[#CCC] cursor-not-allowed" : "bg-[#141414] hover:bg-[#333]"
                }`}
              >
                {saving ? "Saqlanmoqda..." : "Tayinlash"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  )
}
