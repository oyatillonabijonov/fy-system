import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import { useUpsertKpiTarget } from "@/hooks/useKpi"
import { useDialog } from "@/hooks/useDialog"
import { useMedia } from "@/hooks/useMedia"
import { sheet, sheetMotion } from "@/components/ui/sheetStyles"
import type { KpiTarget } from "@/lib/supabase/queries/kpi"
import type { UserProfile } from "@/lib/supabase/queries/auth"
import { formatNumber } from "@/lib/format"

interface SetKpiTargetsModalProps {
  isOpen: boolean
  onClose: () => void
  user: UserProfile
  period: { year: number; month: number }
  existingTarget: KpiTarget | null
  onSuccess?: (msg: string) => void
}

interface InnerProps {
  onClose: () => void
  user: UserProfile
  period: { year: number; month: number }
  existingTarget: KpiTarget | null
  onSuccess?: (msg: string) => void
}

const MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr",
]

const inputCls =
  "w-full border border-line rounded-control px-3 py-2 max-sm:h-12 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors max-sm:bg-surface-sunken max-sm:border-transparent max-sm:focus:border-line-focus"

function SetForm({ onClose, user, period, existingTarget, onSuccess }: InnerProps) {
  const [revenueTarget, setRevenueTarget] = useState<string>(
    existingTarget ? formatNumber(existingTarget.revenue_target) : "",
  )
  const [leadsTarget, setLeadsTarget] = useState<string>(
    existingTarget ? String(existingTarget.leads_target) : "",
  )
  const [eventsTarget, setEventsTarget] = useState<string>(
    existingTarget ? String(existingTarget.events_target) : "",
  )
  const [notes, setNotes] = useState<string>(existingTarget?.notes ?? "")
  const [error, setError] = useState<string | null>(null)

  const upsertMutation = useUpsertKpiTarget()
  const saving = upsertMutation.isPending
  const uid = useId()
  const titleId = useId()
  const panelRef = useDialog<HTMLDivElement>(() => !saving && onClose())
  const onPhone = useMedia("(width < 40rem)")

  async function handleSubmit() {
    setError(null)

    const revenueNum = Number(revenueTarget.replace(/\D/g, ""))
    const leadsNum = Number(leadsTarget) || 0
    const eventsNum = Number(eventsTarget) || 0

    if (revenueNum < 0 || leadsNum < 0 || eventsNum < 0) {
      setError("Salbiy son kiritib bo'lmaydi")
      return
    }

    try {
      await upsertMutation.mutateAsync({
        userId: user.id,
        year: period.year,
        month: period.month,
        revenue_target: revenueNum,
        leads_target: leadsNum,
        events_target: eventsNum,
        notes: notes.trim() || undefined,
      })
      onSuccess?.(existingTarget ? "Maqsadlar yangilandi" : "Maqsadlar belgilandi")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    }
  }

  return (
    <div className={sheet.wrap}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-surface-overlay backdrop-blur-[2px]"
        onClick={() => !saving && onClose()}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        {...sheetMotion(onPhone)}
        className={`${sheet.panel} sm:max-w-md`}
      >
          <div className={sheet.grabber} />
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 sm:border-b border-line shrink-0">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h2 id={titleId} className="text-lg font-bold text-ink">KPI maqsadlari</h2>
              <span className="text-xs max-sm:text-sm text-ink-muted">
                {user.full_name} · {MONTHS[period.month - 1]} {period.year}
              </span>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              aria-label="Yopish"
              className="size-10 sm:size-auto -mr-2 sm:mr-0 flex items-center justify-center sm:p-1.5 shrink-0 rounded-full sm:rounded-item hover:bg-mute-ghost-hover transition-colors"
            >
              <X size={20} className="text-ink-muted" />
            </button>
          </div>

          {/* Form */}
          <div className="p-4 sm:p-5 flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {error && (
              <div className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark border border-line">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-revenue`} className="text-sm font-medium text-ink-muted">Tushum maqsadi (so'm)</label>
              <input
                id={`${uid}-revenue`}
                type="text"
                inputMode="numeric"
                value={revenueTarget}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "")
                  setRevenueTarget(digits ? formatNumber(Number(digits)) : "")
                }}
                placeholder="10 000 000"
                autoFocus
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${uid}-leads`} className="text-sm font-medium text-ink-muted">Yopilishi kerak lidlar</label>
                <input
                  id={`${uid}-leads`}
                  type="number"
                  min={0}
                  value={leadsTarget}
                  onChange={(e) => setLeadsTarget(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${uid}-events`} className="text-sm font-medium text-ink-muted">Tadbirlar maqsadi</label>
                <input
                  id={`${uid}-events`}
                  type="number"
                  min={0}
                  value={eventsTarget}
                  onChange={(e) => setEventsTarget(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-notes`} className="text-sm font-medium text-ink-muted">Izoh (ixtiyoriy)</label>
              <textarea
                id={`${uid}-notes`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Maxsus eslatmalar..."
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 sm:px-5 py-4 max-sm:pb-[calc(16px+env(safe-area-inset-bottom))] border-t border-line shrink-0">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 max-sm:h-12 max-sm:bg-mute-soft max-sm:text-ink rounded-full text-base font-medium whitespace-nowrap text-ink-muted hover:text-ink transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className={`px-5 py-2 max-sm:h-12 max-sm:flex-1 rounded-full text-base font-bold whitespace-nowrap transition-colors ${
                saving ? "bg-mute-soft text-ink-faint cursor-not-allowed" : "bg-accent text-ink-on-accent hover:bg-accent-hover"
              }`}
            >
              {saving ? "Saqlanmoqda..." : "Saqlash"}
            </button>
          </div>
      </motion.div>
    </div>
  )
}

export function SetKpiTargetsModal({
  isOpen,
  onClose,
  user,
  period,
  existingTarget,
  onSuccess,
}: SetKpiTargetsModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <SetForm
          key={`${user.id}-${period.year}-${period.month}`}
          onClose={onClose}
          user={user}
          period={period}
          existingTarget={existingTarget}
          onSuccess={onSuccess}
        />
      )}
    </AnimatePresence>
  )
}
