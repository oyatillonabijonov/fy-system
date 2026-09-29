import { useState, useRef } from "react"
import { toast as notify } from "@/lib/toast"
import { useParams, useNavigate, Link } from "react-router-dom"
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
  uploadUserAvatar,
  updateUserAvatar,
  deleteUserAvatar,
  type UserProfile,
} from "@/lib/supabase/queries/auth"
import { departmentLabel, departmentColor } from "@/lib/constants/employee"
import { formatDate, formatNumber, formatPhone } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

const softBtn =
  "flex items-center gap-2 px-3.5 h-control-md rounded-control bg-mute-soft text-base font-medium text-ink hover:bg-mute-soft-hover transition-colors disabled:opacity-50"

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

  // App-wide notification (components/ui/Toaster)
  function showToast(message: string, type: "success" | "error" = "success") {
    if (type === "success") notify.success(message)
    else notify.error(message)
  }

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
    <div className="flex flex-col gap-8 pb-10">
      {/* Top: Back button */}
      <button
        type="button"
        onClick={() => navigate("/hodimlar")}
        className="flex items-center gap-2 h-control-sm -ml-1 px-1 text-base text-ink-muted hover:text-ink w-fit transition-colors"
      >
        <ArrowLeft size={16} />
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<ChartBar size={16} />}
          label="CRM-N lidlar"
          value={stats?.leads_handled.toString() ?? "—"}
        />
        <StatCard
          icon={<Ticket size={16} />}
          label="Tadbirlar"
          value={stats?.events_organized.toString() ?? "—"}
        />
        <StatCard
          icon={<Briefcase size={16} />}
          label="Mijozlar"
          value={stats?.clients_added.toString() ?? "—"}
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
        <div className="bg-surface-sunken rounded-surface p-5">
          <h2 className="text-base font-semibold text-ink mb-2">Ish ma'lumotlari</h2>
          <div className="flex flex-col">
            <InfoRow icon={<Buildings size={16} />} label="Bo'lim" value={departmentLabel(user.department)} />
            <InfoRow icon={<Briefcase size={16} />} label="Lavozim" value={user.position} />
            <InfoRow icon={<Calendar size={16} />} label="Ish boshlangan" value={formatDate(user.hire_date)} />
          </div>
        </div>

        <div className="bg-surface-sunken rounded-surface p-5">
          <h2 className="text-base font-semibold text-ink mb-2">Shaxsiy ma'lumotlar</h2>
          <div className="flex flex-col">
            <InfoRow icon={<Calendar size={16} />} label="Tug'ilgan sana" value={formatDate(user.birth_date)} />
            <InfoRow icon={<MapPin size={16} />} label="Manzil" value={user.address} />
            <InfoRow icon={<Phone size={16} />} label="Favqulodda kontakt" value={user.emergency_contact} />
          </div>
        </div>
      </div>

      {/* Bio */}
      {user.bio && (
        <div className="bg-surface-sunken rounded-surface p-5">
          <h2 className="text-base font-semibold text-ink mb-2">Haqida</h2>
          <p className="text-base text-ink-muted leading-relaxed whitespace-pre-wrap">{user.bio}</p>
        </div>
      )}

      {/* Admin notes — visible to admins, not to self */}
      {user.notes && adminUser && !isSelf && (
        <div className="bg-warning-soft rounded-surface p-5">
          <h2 className="text-base font-semibold text-warning-dark mb-2">Admin yozuvlari</h2>
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
    <div className="flex items-start gap-5 flex-wrap">
      {/* Avatar */}
      <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={canEditAvatar ? onAvatarClick : undefined}
          disabled={!canEditAvatar}
          aria-label="Rasmni o'zgartirish"
          className={`relative size-20 rounded-full overflow-hidden ${canEditAvatar ? "cursor-pointer group" : ""}`}
        >
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full bg-mute-soft flex items-center justify-center text-xl font-semibold text-ink-muted">
              {initials}
            </span>
          )}
          {canEditAvatar && (
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera size={20} className="text-white" />
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 bg-surface/80 flex items-center justify-center">
              <ThinkingOrb state="shaping" size={20} theme="light" />
            </span>
          )}
        </button>
        {user.avatar_url && canEditAvatar && (
          <button type="button" onClick={onAvatarDelete} className="text-xs text-ink-faint hover:text-danger-text transition-colors">
            O'chirish
          </button>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-[260px] flex flex-col gap-2 pt-1">
        <h1 className="text-xl font-semibold text-ink" style={{ letterSpacing: "-0.4px" }}>
          {user.full_name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
          <span className="text-ink">{ROLE_LABELS[user.role]}</span>
          {user.position && <><span className="text-ink-faint">·</span><span className="text-ink-muted">{user.position}</span></>}
          {user.department && (
            <>
              <span className="text-ink-faint">·</span>
              <span className="flex items-center gap-1.5 text-ink-muted">
                <span className="size-2 rounded-full" style={{ backgroundColor: departmentColor(user.department) }} />
                {departmentLabel(user.department)}
              </span>
            </>
          )}
          <span className="text-ink-faint">·</span>
          <span className={`flex items-center gap-1.5 ${user.is_active ? "text-ink" : "text-ink-muted"}`}>
            <span className={`size-2 rounded-full ${user.is_active ? "bg-success" : "bg-mute-soft-hover"}`} />
            {user.is_active ? "Faol" : "Faol emas"}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-base text-ink-muted">
          <ContactItem icon={<Envelope size={16} />} value={user.email} />
          {user.phone && <ContactItem icon={<Phone size={16} />} value={formatPhone(user.phone)} />}
          {user.telegram && (
            <ContactItem
              icon={<PaperPlaneRight size={16} />}
              value={user.telegram.startsWith("@") ? user.telegram : `@${user.telegram}`}
            />
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button type="button" onClick={onPermissions} className={softBtn}>
          <Gear size={16} />
          Ruxsatlar
        </button>
        <button type="button" onClick={onEdit} className={softBtn}>
          <PencilSimple size={16} />
          Tahrirlash
        </button>
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
    <div className="bg-surface-sunken rounded-surface px-5 py-4 flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-ink-muted">{icon}{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
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
    <div className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
      <span className="text-ink-muted">{icon}</span>
      <span className="text-base text-ink-muted w-36 flex-shrink-0">{label}</span>
      <span className="text-base text-ink min-w-0 break-words">
        {value || <span className="text-ink-faint">—</span>}
      </span>
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
    <div className="bg-surface-sunken rounded-surface p-5 flex flex-wrap items-center justify-between gap-4">
      <div>
      <h2 className="text-base font-semibold text-ink mb-1">Hisobni {user.is_active ? "faolsizlantirish" : "qayta faollashtirish"}</h2>
      <p className="text-sm text-ink-muted">
        {user.is_active
          ? "Faolsizlantirilgan foydalanuvchi tizimga kira olmaydi, lekin ma'lumotlari saqlanadi."
          : "Foydalanuvchini qayta faollashtirsangiz, u darhol tizimga kira oladi."}
      </p>
      </div>
      <div className="flex gap-2">
        {confirm ? (
          <>
            <button
              onClick={() => setConfirm(false)}
              disabled={busy}
              className={softBtn}
            >
              Bekor qilish
            </button>
            <button
              onClick={handleToggle}
              disabled={busy}
              className={`flex items-center gap-2 px-4 h-control-md rounded-control text-base font-medium transition-colors disabled:opacity-50 ${
                user.is_active ? "bg-danger text-white" : "bg-accent text-ink-on-accent hover:bg-accent-hover"
              }`}
            >
              <Power size={16} />
              {busy ? "..." : user.is_active ? "Ha, faolsizlantir" : "Ha, faollashtir"}
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            className={`${softBtn} ${user.is_active ? "text-danger-text" : ""}`}
          >
            <Power size={16} />
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
    <section className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3 px-1">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-md font-semibold text-ink">KPI ko'rsatkichlari</h2>
          <p className="text-sm text-ink-muted">Oylik maqsadlar va natijalar</p>
        </div>

        <div className="flex items-center gap-2">
          <PeriodSelector period={period} onChange={onPeriodChange} />
          {canEdit && (
            <button
              onClick={onEdit}
              className={softBtn}
            >
              <PencilSimple size={16} />
              {kpi?.target ? "Maqsadlarni tahrirlash" : "Maqsad belgilash"}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="bg-surface-sunken rounded-surface py-10 text-center text-base text-ink-muted">Yuklanmoqda…</div>
      )}

      {!loading && !kpi?.target && (
        <div className="bg-surface-sunken rounded-surface py-10 text-center">
          <Target size={32} weight="thin" className="mx-auto text-ink-faint mb-3" />
          <p className="text-base font-semibold text-ink mb-1">Maqsadlar belgilanmagan</p>
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
            icon={<TrendUp size={18} />}
            label="Tushum"
            target={kpi.target.revenue_target}
            actual={kpi.actual.revenue_actual}
            progress={kpi.revenue_progress}
            unit="so'm"
            formatNumber={formatNumber}
          />
          <KpiProgressCard
            icon={<Target size={18} />}
            label="Yopilgan lidlar"
            target={kpi.target.leads_target}
            actual={kpi.actual.leads_closed}
            progress={kpi.leads_progress}
            unit="ta"
          />
          <KpiProgressCard
            icon={<Calendar size={18} />}
            label="Tadbirlar"
            target={kpi.target.events_target}
            actual={kpi.actual.events_managed}
            progress={kpi.events_progress}
            unit="ta"
          />
        </div>
      )}
    </section>
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
    <div className="bg-surface-sunken rounded-surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-ink-muted">{icon}</div>
        <span className="text-sm text-ink-muted font-medium">{label}</span>
      </div>

      <div className="mb-2">
        <span className="text-xl font-semibold tabular-nums text-ink">
          {fmt(actual)}
        </span>
        <span className="text-sm text-ink-muted ml-1">
          / {fmt(target)} {unit}
        </span>
      </div>

      <div className="h-1.5 bg-surface rounded-full overflow-hidden mb-2">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${Math.min(progress, 100)}%`,
            backgroundColor: progressColor,
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tabular-nums" style={{ color: progressColor }}>
          {progress}%
        </span>
        {progress >= 100 && (
          <span className="text-sm font-medium text-success-text">
            Maqsad bajarildi
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
    <div className="flex items-center h-control-md rounded-full bg-mute-soft">
      <button
        type="button"
        onClick={prev}
        className="size-9 rounded-full flex items-center justify-center hover:bg-mute-soft-hover transition-colors"
        title="Oldingi oy"
        aria-label="Oldingi oy"
      >
        <CaretLeft size={16} className="text-ink-muted" />
      </button>
      <span className="px-1 text-base font-medium text-ink min-w-[120px] text-center tabular-nums">
        {MONTH_NAMES[period.month - 1]} {period.year}
      </span>
      <button
        type="button"
        onClick={next}
        className="size-9 rounded-full flex items-center justify-center hover:bg-mute-soft-hover transition-colors"
        title="Keyingi oy"
        aria-label="Keyingi oy"
      >
        <CaretRight size={16} className="text-ink-muted" />
      </button>
    </div>
  )
}
