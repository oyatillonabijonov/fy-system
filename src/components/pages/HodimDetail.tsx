import { useState, useRef, useEffect } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  PencilSimple,
  Phone,
  Envelope,
  MapPin,
  Calendar,
  Briefcase,
  Buildings,
  ChartBar,
  Ticket,
  PaperPlaneRight,
  Gear,
  Power,
  Camera,
  Target,
  TrendUp,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react"
import {
  useUser,
  useUserStats,
  useDeactivateUser,
  useActivateUser,
  USERS_KEY,
} from "@/hooks/useUsers"
import { useAuth } from "@/context/AuthContext"
import { EditProfileModal } from "@/components/hodimlar/EditProfileModal"
import { SetKpiTargetsModal } from "@/components/hodimlar/SetKpiTargetsModal"
import { UserPermissionsModal } from "@/components/sozlamalar/UserPermissionsModal"
import { useKpiSummary } from "@/hooks/useKpi"
import { ImageCropModal } from "@/components/ui/ImageCropModal"
import {
  ROLE_LABELS,
  ROLE_BADGE_VARIANT,
  uploadUserAvatar,
  updateUserAvatar,
  deleteUserAvatar,
  type UserProfile,
} from "@/lib/supabase/queries/auth"
import { departmentLabel, departmentColor } from "@/lib/constants/employee"
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate, formatNumber, formatPhone } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
}

export function HodimDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user: currentUser } = useAuth()

  const { data: user, isLoading } = useUser(id)
  const { data: stats } = useUserStats(id)

  const [editingProfile, setEditingProfile] = useState(false)
  const [editingPermissions, setEditingPermissions] = useState(false)

  // KPI period (defaults to current month)
  const now = new Date()
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [showSetTargets, setShowSetTargets] = useState(false)
  const { data: kpi, isLoading: kpiLoading } = useKpiSummary(id, period.year, period.month)

  // Avatar upload + crop
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tempImageSrc, setTempImageSrc] = useState("")
  const [showCrop, setShowCrop] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showToast(message: string, type: "success" | "error" = "success") {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      showToast("Rasm 5MB dan kichik bo'lishi kerak", "error")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setTempImageSrc(reader.result as string)
      setShowCrop(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  async function handleAvatarCrop(blob: Blob) {
    if (!user) return
    setShowCrop(false)
    setUploading(true)
    try {
      const url = await uploadUserAvatar(blob, user.id)
      await updateUserAvatar(user.id, url)
      qc.invalidateQueries({ queryKey: [...USERS_KEY, user.id] })
      qc.invalidateQueries({ queryKey: USERS_KEY })
      showToast("Rasm yangilandi")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Rasm yuklashda xatolik", "error")
    } finally {
      setUploading(false)
    }
  }

  async function handleAvatarDelete() {
    if (!user) return
    if (!confirm("Rasmni o'chirishni tasdiqlaysizmi?")) return
    try {
      await deleteUserAvatar(user.id, user.avatar_url)
      qc.invalidateQueries({ queryKey: [...USERS_KEY, user.id] })
      qc.invalidateQueries({ queryKey: USERS_KEY })
      showToast("Rasm o'chirildi")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Xatolik", "error")
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-base text-ink-muted">Yuklanmoqda...</div>
  }

  if (!user) {
    return (
      <div className="p-12 text-center flex flex-col items-center gap-3">
        <p className="text-md font-bold text-ink">Xodim topilmadi</p>
        <Link to="/hodimlar" className="text-base text-ink-muted hover:text-ink underline">
          ← Hodimlar ro'yxatiga qaytish
        </Link>
      </div>
    )
  }

  const isSelf = currentUser?.id === user.id
  const adminUser = currentUser?.role === "admin"
  const canEditAvatar = adminUser || isSelf

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Top: Back button */}
      <button
        onClick={() => navigate("/hodimlar")}
        className="flex items-center gap-2 text-base text-ink-muted hover:text-ink w-fit transition-colors"
      >
        <ArrowLeft size={16} weight="bold" />
        Hodimlar
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleAvatarPick}
        className="hidden"
      />

      {/* Profile header */}
      <ProfileHeader
        user={user}
        canEditAvatar={canEditAvatar}
        uploading={uploading}
        onAvatarClick={() => fileInputRef.current?.click()}
        onAvatarDelete={handleAvatarDelete}
        onEdit={() => setEditingProfile(true)}
        onPermissions={() => setEditingPermissions(true)}
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<ChartBar size={20} weight="bold" />}
          label="CRM-N lidlar"
          value={stats?.leads_handled.toString() ?? "—"}
        />
        <StatCard
          icon={<Ticket size={20} weight="bold" />}
          label="Tadbirlar"
          value={stats?.events_organized.toString() ?? "0"}
        />
        <StatCard
          icon={<Briefcase size={20} weight="bold" />}
          label="Mijozlar"
          value={stats?.clients_added.toString() ?? "0"}
        />
      </div>

      {/* KPI section */}
      <KpiSection
        kpi={kpi ?? null}
        loading={kpiLoading}
        period={period}
        onPeriodChange={setPeriod}
        canEdit={adminUser}
        onEdit={() => setShowSetTargets(true)}
      />

      {/* Two columns: Work info + Personal info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface border border-line rounded-surface p-6">
          <h2 className="text-base font-bold text-ink mb-4">Ish ma'lumotlari</h2>
          <div className="flex flex-col gap-3">
            <InfoRow icon={<Buildings size={14} weight="bold" />} label="Bo'lim" value={departmentLabel(user.department)} />
            <InfoRow icon={<Briefcase size={14} weight="bold" />} label="Lavozim" value={user.position} />
            <InfoRow icon={<Calendar size={14} weight="bold" />} label="Ish boshlangan" value={formatDate(user.hire_date)} />
          </div>
        </div>

        <div className="bg-surface border border-line rounded-surface p-6">
          <h2 className="text-base font-bold text-ink mb-4">Shaxsiy ma'lumotlar</h2>
          <div className="flex flex-col gap-3">
            <InfoRow icon={<Calendar size={14} weight="bold" />} label="Tug'ilgan sana" value={formatDate(user.birth_date)} />
            <InfoRow icon={<MapPin size={14} weight="bold" />} label="Manzil" value={user.address} />
            <InfoRow icon={<Phone size={14} weight="bold" />} label="Favqulodda kontakt" value={user.emergency_contact} />
          </div>
        </div>
      </div>

      {/* Bio */}
      {user.bio && (
        <div className="bg-surface border border-line rounded-surface p-6">
          <h2 className="text-base font-bold text-ink mb-3">Haqida</h2>
          <p className="text-base text-ink-muted leading-relaxed whitespace-pre-wrap">{user.bio}</p>
        </div>
      )}

      {/* Admin notes — visible to admins, not to self */}
      {user.notes && adminUser && !isSelf && (
        <div className="bg-warning-soft border border-line rounded-surface p-6">
          <h2 className="text-base font-bold text-warning-dark mb-3">Admin yozuvlari</h2>
          <p className="text-base text-warning-dark leading-relaxed whitespace-pre-wrap">{user.notes}</p>
        </div>
      )}

      {/* Danger zone — admin only, not self */}
      {adminUser && !isSelf && (
        <DangerZone user={user} onSuccess={(msg) => showToast(msg)} onError={(msg) => showToast(msg, "error")} />
      )}

      {/* Modals */}
      <EditProfileModal
        isOpen={editingProfile}
        user={user}
        onClose={() => setEditingProfile(false)}
        onSuccess={(msg) => showToast(msg)}
      />
      <SetKpiTargetsModal
        isOpen={showSetTargets}
        user={user}
        period={period}
        existingTarget={kpi?.target ?? null}
        onClose={() => setShowSetTargets(false)}
        onSuccess={(msg) => showToast(msg)}
      />
      <UserPermissionsModal
        isOpen={editingPermissions}
        user={user}
        onClose={() => setEditingPermissions(false)}
        onSuccess={(msg) => showToast(msg)}
      />

      <ImageCropModal
        isOpen={showCrop}
        imageSrc={tempImageSrc}
        onClose={() => setShowCrop(false)}
        onCropped={handleAvatarCrop}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`fixed top-6 right-6 z-[200] px-4 py-2.5 rounded-control text-sm font-bold ${
              toast.type === "success"
                ? "bg-surface-sunken text-ink border border-line"
                : "bg-danger-soft text-danger-dark border border-line"
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────

function ProfileHeader({
  user,
  canEditAvatar,
  uploading,
  onAvatarClick,
  onAvatarDelete,
  onEdit,
  onPermissions,
}: {
  user: UserProfile
  canEditAvatar: boolean
  uploading: boolean
  onAvatarClick: () => void
  onAvatarDelete: () => void
  onEdit: () => void
  onPermissions: () => void
}) {
  const initials = getInitials(user.full_name)
  return (
    <div className="bg-surface border border-line rounded-surface p-6">
      <div className="flex items-start gap-6 flex-wrap">
        {/* Avatar */}
        <div className="flex-shrink-0 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={canEditAvatar ? onAvatarClick : undefined}
            disabled={!canEditAvatar}
            aria-label="Rasmni o'zgartirish"
            className={`relative w-24 h-24 rounded-full overflow-hidden ${
              canEditAvatar ? "cursor-pointer group" : ""
            }`}
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.full_name}
                className="w-full h-full object-cover border border-line rounded-full"
              />
            ) : (
              <span className="w-full h-full rounded-full bg-accent flex items-center justify-center text-2xl font-bold text-ink-on-accent">
                {initials}
              </span>
            )}
            {canEditAvatar && (
              <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                <Camera size={20} weight="bold" className="text-white" />
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 bg-surface/80 flex items-center justify-center rounded-full">
                <ThinkingOrb state="shaping" size={20} theme="light" />
              </span>
            )}
          </button>
          {user.avatar_url && canEditAvatar && (
            <button
              onClick={onAvatarDelete}
              className="text-xs text-danger-text hover:text-danger-dark transition-colors"
            >
              Rasmni o'chirish
            </button>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-xl font-bold text-ink" style={{ letterSpacing: "-0.6px" }}>
              {user.full_name}
            </h1>
            <StatusBadge label={ROLE_LABELS[user.role]} variant={ROLE_BADGE_VARIANT[user.role]} />
            <StatusBadge label={user.is_active ? "Faol" : "Faol emas"} variant={user.is_active ? 'success' : 'danger'} dot />
          </div>

          {user.position && <p className="text-md text-ink mb-1">{user.position}</p>}
          {user.department && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold mb-3"
              style={{
                backgroundColor: departmentColor(user.department) + "15",
                color: departmentColor(user.department),
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: departmentColor(user.department) }}
              />
              {departmentLabel(user.department)} bo'limi
            </span>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
            <ContactItem icon={<Envelope size={14} weight="bold" />} value={user.email} />
            {user.phone && <ContactItem icon={<Phone size={14} weight="bold" />} value={formatPhone(user.phone)} />}
            {user.telegram && (
              <ContactItem
                icon={<PaperPlaneRight size={14} weight="bold" />}
                value={user.telegram.startsWith("@") ? user.telegram : `@${user.telegram}`}
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-3 h-control-sm border border-line rounded-control text-sm font-bold hover:bg-mute-ghost-hover transition-colors"
          >
            <PencilSimple size={14} weight="bold" />
            Tahrirlash
          </button>
          <button
            onClick={onPermissions}
            className="flex items-center gap-2 px-3 h-control-sm border border-line rounded-control text-sm font-bold hover:bg-mute-ghost-hover transition-colors"
          >
            <Gear size={14} weight="bold" />
            Ruxsatlar
          </button>
        </div>
      </div>
    </div>
  )
}

function ContactItem({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-ink-muted">{icon}</span>
      {value}
    </span>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface border border-line rounded-surface p-5 flex flex-col gap-3">
      <div className="w-9 h-9 rounded-control-sm bg-surface-sunken flex items-center justify-center text-ink-muted">
        {icon}
      </div>
      <div>
        <p className="text-xs text-ink-muted mb-1">{label}</p>
        <p className="text-lg font-bold text-ink" style={{ letterSpacing: "-0.4px" }}>{value}</p>
      </div>
    </div>
  )
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-ink-muted mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ink-muted mb-0.5">{label}</p>
        <p className="text-base text-ink">
          {value || <span className="text-ink-faint">—</span>}
        </p>
      </div>
    </div>
  )
}

function DangerZone({
  user,
  onSuccess,
  onError,
}: {
  user: UserProfile
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const deactivate = useDeactivateUser()
  const activate = useActivateUser()
  const [confirm, setConfirm] = useState(false)

  const busy = deactivate.isPending || activate.isPending

  async function handleToggle() {
    try {
      if (user.is_active) {
        await deactivate.mutateAsync(user.id)
        onSuccess("Foydalanuvchi faolsizlantirildi")
      } else {
        await activate.mutateAsync(user.id)
        onSuccess("Foydalanuvchi qayta faollashtirildi")
      }
      setConfirm(false)
    } catch (err) {
      onError(err instanceof Error ? err.message : "Xatolik")
    }
  }

  return (
    <div className="bg-surface border border-line rounded-surface p-6">
      <h2 className="text-base font-bold text-danger-text mb-1">Xavfli amallar</h2>
      <p className="text-sm text-ink-muted mb-4">
        {user.is_active
          ? "Faolsizlantirilgan foydalanuvchi tizimga kira olmaydi, lekin ma'lumotlari saqlanadi."
          : "Foydalanuvchini qayta faollashtirsangiz, u darhol tizimga kira oladi."}
      </p>
      <div className="flex gap-3">
        {confirm ? (
          <>
            <button
              onClick={() => setConfirm(false)}
              disabled={busy}
              className="px-4 py-2 rounded-control text-sm font-medium text-ink-muted hover:text-ink"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleToggle}
              disabled={busy}
              className={`flex items-center gap-2 px-4 py-2 rounded-control text-sm font-bold transition-colors ${
                busy ? "bg-mute-soft text-ink-faint cursor-not-allowed" : user.is_active ? "bg-danger text-white" : "bg-accent text-ink-on-accent hover:bg-accent-hover"
              }`}
            >
              <Power size={14} weight="bold" />
              {busy ? "..." : user.is_active ? "Ha, faolsizlantir" : "Ha, faollashtir"}
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-control text-sm font-bold transition-colors ${
              user.is_active
                ? "border border-line text-danger-text hover:bg-danger-soft"
                : "border border-line text-ink hover:bg-surface-sunken"
            }`}
          >
            <Power size={14} weight="bold" />
            {user.is_active ? "Faolsizlantirish" : "Qayta faollashtirish"}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── KPI section ─────────────────────────────────────────

const MONTH_NAMES = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr",
]

function KpiSection({
  kpi,
  loading,
  period,
  onPeriodChange,
  canEdit,
  onEdit,
}: {
  kpi: import("@/lib/supabase/queries/kpi").KpiSummary | null
  loading: boolean
  period: { year: number; month: number }
  onPeriodChange: (p: { year: number; month: number }) => void
  canEdit: boolean
  onEdit: () => void
}) {
  return (
    <div className="bg-surface border border-line rounded-surface p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-control-sm bg-surface-sunken flex items-center justify-center">
            <Target size={18} weight="bold" className="text-ink" />
          </div>
          <div>
            <h2 className="text-md font-bold text-ink" style={{ letterSpacing: "-0.4px" }}>
              KPI ko'rsatkichlari
            </h2>
            <p className="text-sm text-ink-muted">Oylik maqsadlar va natijalar</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PeriodSelector period={period} onChange={onPeriodChange} />
          {canEdit && (
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 h-control-sm border border-line rounded-control text-sm font-bold hover:bg-mute-ghost-hover transition-colors"
            >
              <PencilSimple size={12} weight="bold" />
              {kpi?.target ? "Maqsadlarni tahrirlash" : "Maqsad belgilash"}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="py-8 text-center text-sm text-ink-muted italic">Yuklanmoqda...</div>
      )}

      {!loading && !kpi?.target && (
        <div className="py-8 text-center">
          <Target size={32} className="mx-auto text-ink-faint mb-3" weight="bold" />
          <p className="text-base font-bold text-ink mb-1">Maqsadlar belgilanmagan</p>
          <p className="text-sm text-ink-muted">
            {canEdit
              ? "Bu hodim uchun ushbu oy maqsadlarini belgilang"
              : "Administrator hali maqsadlar belgilamadi"}
          </p>
        </div>
      )}

      {!loading && kpi?.target && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiProgressCard
            icon={<TrendUp size={18} weight="bold" />}
            label="Tushum"
            target={kpi.target.revenue_target}
            actual={kpi.actual.revenue_actual}
            progress={kpi.revenue_progress}
            unit="so'm"
            formatNumber={formatNumber}
          />
          <KpiProgressCard
            icon={<Target size={18} weight="bold" />}
            label="Yopilgan lidlar"
            target={kpi.target.leads_target}
            actual={kpi.actual.leads_closed}
            progress={kpi.leads_progress}
            unit="ta"
          />
          <KpiProgressCard
            icon={<Calendar size={18} weight="bold" />}
            label="Tadbirlar"
            target={kpi.target.events_target}
            actual={kpi.actual.events_managed}
            progress={kpi.events_progress}
            unit="ta"
          />
        </div>
      )}
    </div>
  )
}

function KpiProgressCard({
  icon,
  label,
  target,
  actual,
  progress,
  unit,
  formatNumber,
}: {
  icon: React.ReactNode
  label: string
  target: number
  actual: number
  progress: number
  unit: string
  formatNumber?: (n: number) => string
}) {
  const fmt = formatNumber ?? ((n: number) => n.toString())

  let progressColor = "var(--ds-color-success-default)"
  if (progress < 50) progressColor = "var(--ds-color-danger-default)"
  else if (progress < 80) progressColor = "var(--ds-color-warning-default)"
  else if (progress < 100) progressColor = "var(--ds-color-info-default)"

  return (
    <div className="bg-surface-sunken border border-line rounded-control-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-ink-muted">{icon}</div>
        <span className="text-sm text-ink-muted font-medium">{label}</span>
      </div>

      <div className="mb-2">
        <span className="text-lg font-bold text-ink" style={{ letterSpacing: "-0.4px" }}>
          {fmt(actual)}
        </span>
        <span className="text-sm text-ink-muted ml-1">
          / {fmt(target)} {unit}
        </span>
      </div>

      <div className="h-1.5 bg-surface-sunken-hover rounded-full overflow-hidden mb-2">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${Math.min(progress, 100)}%`,
            backgroundColor: progressColor,
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: progressColor }}>
          {progress}%
        </span>
        {progress >= 100 && (
          <span className="text-xs font-bold text-ink">
            ✓ Maqsad bajarildi
          </span>
        )}
      </div>
    </div>
  )
}

function PeriodSelector({
  period,
  onChange,
}: {
  period: { year: number; month: number }
  onChange: (p: { year: number; month: number }) => void
}) {
  function prev() {
    const m = period.month - 1
    if (m < 1) onChange({ year: period.year - 1, month: 12 })
    else onChange({ year: period.year, month: m })
  }
  function next() {
    const m = period.month + 1
    if (m > 12) onChange({ year: period.year + 1, month: 1 })
    else onChange({ year: period.year, month: m })
  }
  return (
    <div className="flex items-center gap-1 border border-line rounded-control">
      <button
        onClick={prev}
        className="px-2 py-1.5 hover:bg-mute-ghost-hover transition-colors"
        title="Oldingi oy"
        aria-label="Oldingi oy"
      >
        <CaretLeft size={12} weight="bold" className="text-ink-muted" />
      </button>
      <span className="px-2 text-sm font-bold text-ink min-w-[110px] text-center">
        {MONTH_NAMES[period.month - 1]} {period.year}
      </span>
      <button
        onClick={next}
        className="px-2 py-1.5 hover:bg-mute-ghost-hover transition-colors"
        title="Keyingi oy"
        aria-label="Keyingi oy"
      >
        <CaretRight size={12} weight="bold" className="text-ink-muted" />
      </button>
    </div>
  )
}
