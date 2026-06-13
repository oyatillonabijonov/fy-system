import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import { useUpsertKpiTarget } from "@/hooks/useKpi"
import type { KpiTarget } from "@/lib/supabase/queries/kpi"
import type { UserProfile } from "@/lib/supabase/queries/auth"

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
  "w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCC] focus:outline-none focus:border-[#141414] transition-colors"

function formatThousands(s: string): string {
  // Strip non-digits, group by 3
  const digits = s.replace(/\D/g, "")
  if (!digits) return ""
  return new Intl.NumberFormat("uz-UZ").format(Number(digits))
}

function SetForm({ onClose, user, period, existingTarget, onSuccess }: InnerProps) {
  const [revenueTarget, setRevenueTarget] = useState<string>(
    existingTarget ? formatThousands(String(existingTarget.revenue_target)) : "",
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
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[16px] font-bold text-[#141414]">KPI maqsadlari</h2>
              <span className="text-[11px] text-[#999]">
                {user.full_name} · {MONTHS[period.month - 1]} {period.year}
              </span>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors"
            >
              <X size={20} className="text-[#999]" weight="bold" />
            </button>
          </div>

          {/* Form */}
          <div className="p-5 flex flex-col gap-4">
            {error && (
              <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#999]">Tushum maqsadi (so'm)</label>
              <input
                type="text"
                inputMode="numeric"
                value={revenueTarget}
                onChange={(e) => setRevenueTarget(formatThousands(e.target.value))}
                placeholder="10 000 000"
                autoFocus
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#999]">Yopilishi kerak lidlar</label>
                <input
                  type="number"
                  min={0}
                  value={leadsTarget}
                  onChange={(e) => setLeadsTarget(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#999]">Tadbirlar maqsadi</label>
                <input
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
              <label className="text-[12px] font-medium text-[#999]">Izoh (ixtiyoriy)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Maxsus eslatmalar..."
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F0F0F0]">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-[8px] text-[13px] font-medium text-[#999] hover:text-[#666] transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className={`px-5 py-2 rounded-[8px] text-[13px] font-bold text-white transition-colors ${
                saving ? "bg-[#CCC] cursor-not-allowed" : "bg-[#141414] hover:bg-[#333]"
              }`}
            >
              {saving ? "Saqlanmoqda..." : "Saqlash"}
            </button>
          </div>
        </div>
      </motion.div>
    </>
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
