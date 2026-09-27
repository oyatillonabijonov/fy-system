import { useMemo, useState } from "react"
import { TrendUp, PencilSimple, Coins } from "@phosphor-icons/react"
import { type Event, type Participant } from "@/lib/supabase/queries/events"
import { useParticipants, useUpdateParticipant } from "@/hooks/useEvents"
import {
  useSetEventCashbackPercent,
  useSetParticipantCashbackPercent,
  useClientCashbackBalance,
} from "@/hooks/useCashback"
import { ParticipantPaymentModal } from "@/components/events/ParticipantPaymentModal"
import { ApplyCashbackModal } from "@/components/cashback/ApplyCashbackModal"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { eventTint } from "@/lib/eventTint"
import { formatMoney, formatDate, formatNumber } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

export function EventFinance({ event }: { event: Event }) {
  const [payTarget, setPayTarget] = useState<Participant | null>(null)
  const [payKey, setPayKey] = useState(0)

  const { data: participants = [], isLoading } = useParticipants(event.id)

  const updatePart = useUpdateParticipant(event.id)
  const setEventCb = useSetEventCashbackPercent()
  const setPartCb = useSetParticipantCashbackPercent(event.id)

  const defaultPercent = Number(event.cashback_percent ?? 0)

  const totalPaid = useMemo(() => participants.reduce((s, p) => s + (p.paid ?? 0), 0), [participants])
  const totalEarned = useMemo(() => participants.reduce((s, p) => s + (p.cashback_earned ?? 0), 0), [participants])
  const totalUsed = useMemo(() => participants.reduce((s, p) => s + (p.cashback_used ?? 0), 0), [participants])

  const valuePct = event.total_value > 0 ? Math.round((totalPaid / event.total_value) * 100) : null

  const dateLabel = event.date
    ? event.end_date
      ? `${formatDate(event.date)} — ${formatDate(event.end_date)}`
      : formatDate(event.date)
    : "Sana belgilanmagan"

  function openPay(p: Participant) {
    setPayTarget(p)
    setPayKey((k) => k + 1)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Compact header — editing/deleting the event lives on Boshqaruv */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-surface border border-line bg-surface min-w-0">
        <span className="w-3.5 h-3.5 rounded-checkbox shrink-0" style={{ backgroundColor: eventTint(event.name) }} />
        <span className="text-base font-semibold text-ink truncate">{event.name}</span>
        <span className="text-sm text-ink-muted whitespace-nowrap hidden sm:inline">· {dateLabel}</span>
      </div>

      {/* Value progress */}
      <div className="bg-surface border border-line rounded-surface p-4 flex flex-col gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
          <TrendUp size={15} weight="bold" /> Qiymat bajarilishi
        </span>
        {valuePct === null ? (
          <div className="flex flex-col gap-2">
            <span className="text-base font-bold text-success-text tabular-nums">{formatMoney(totalPaid)}</span>
            <span className="text-sm text-ink-muted">Qiymat belgilanmagan</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold text-ink leading-none tabular-nums">{valuePct}%</span>
              <span className="text-sm text-ink-muted text-right tabular-nums">
                {formatMoney(totalPaid)}<br />/ {formatMoney(event.total_value)}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-sunken overflow-hidden">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(valuePct, 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Finance table */}
      <div className="bg-surface border border-line rounded-surface overflow-hidden">
        <div className="flex flex-col gap-1.5 px-4 py-3 border-b border-line">
          <span className="text-base font-semibold text-ink">Ishtirokchilar moliyasi ({participants.length})</span>
          <div className="flex items-center gap-3 flex-wrap text-xs text-ink-muted">
            <DefaultCashbackEditor
              percent={defaultPercent}
              saving={setEventCb.isPending}
              onSave={(p) => setEventCb.mutate({ eventId: event.id, percent: p })}
            />
            <span>Berildi: <strong className="text-ink tabular-nums">{formatMoney(totalEarned)}</strong></span>
            <span>Ishlatildi: <strong className="text-ink tabular-nums">{formatMoney(totalUsed)}</strong></span>
          </div>
        </div>
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <ThinkingOrb state="searching" size={20} theme="light" />
          </div>
        ) : participants.length === 0 ? (
          <div className="py-10 text-center text-base text-ink-muted">Hali ishtirokchi qo'shilmagan</div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-medium text-ink-muted border-b border-line">
                  <th className="px-4 py-2.5 font-medium">Mijoz ismi</th>
                  <th className="px-4 py-2.5 font-medium text-right">Jami to'lanishi kerak</th>
                  <th className="px-4 py-2.5 font-medium text-right">Hozirgacha to'langan</th>
                  <th className="px-4 py-2.5 font-medium text-right">Qolayotgan qarzdorlik</th>
                  <th className="px-4 py-2.5 font-medium text-right">Keshbek</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amal</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => {
                  const debt = (p.price ?? 0) - (p.paid ?? 0)
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0 hover:bg-mute-ghost-hover transition-colors">
                      <td className="px-4 py-2.5 text-base font-medium text-ink whitespace-nowrap">{p.full_name}</td>
                      <td className="px-4 py-2.5 text-right">
                        <PriceCell value={p.price ?? 0} onSave={(price) => updatePart.mutate({ id: p.id, updates: { price } })} />
                      </td>
                      <td className="px-4 py-2.5 text-base text-success-text text-right tabular-nums whitespace-nowrap">{formatMoney(p.paid)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {debt <= 0 ? (
                          <span className="inline-flex justify-end"><StatusBadge label="To'langan" variant="success" dot /></span>
                        ) : (
                          <span className="text-base font-bold text-danger-text tabular-nums">{formatMoney(debt)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <CashbackPercentCell
                          participant={p}
                          defaultPercent={defaultPercent}
                          onSet={(percent) => setPartCb.mutate({ participantId: p.id, percent })}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <SpendCell participant={p} />
                          <button
                            onClick={() => openPay(p)}
                            title="To'lov qo'shish"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-tag text-xs font-semibold text-ink border border-line hover:bg-mute-ghost-hover transition-colors"
                          >
                            <Coins size={13} weight="bold" /> To'lov
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ParticipantPaymentModal
        key={`pay-${payKey}`}
        isOpen={!!payTarget}
        participant={payTarget}
        onClose={() => setPayTarget(null)}
        onPaid={() => setPayTarget(null)}
      />
    </div>
  )
}

// ── Inline editors / cells (moved verbatim from EventOverview) ────────────────

function PriceCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(value ? String(Math.round(value)) : ""); setEditing(true) }}
        className="group/price inline-flex items-center gap-1 text-base text-ink tabular-nums"
        title="Narxni tahrirlash"
      >
        {formatMoney(value)}
        <PencilSimple size={12} weight="bold" className="text-ink-faint opacity-0 group-hover/price:opacity-100 transition-opacity" />
      </button>
    )
  }

  function commit() {
    const next = val ? Number(val) : 0
    setEditing(false)
    if (next !== value) onSave(next)
  }

  return (
    <input
      autoFocus
      inputMode="numeric"
      value={val ? formatNumber(Number(val)) : ""}
      onChange={(e) => setVal(e.target.value.replace(/\D/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit()
        if (e.key === "Escape") setEditing(false)
      }}
      className="w-28 border border-line-focus rounded-control px-2 py-1 text-base text-right text-ink tabular-nums focus:outline-none"
    />
  )
}

// Per-participant cashback % (override). Empty = use the event default.
function CashbackPercentCell({
  participant,
  defaultPercent,
  onSet,
}: {
  participant: Participant
  defaultPercent: number
  onSet: (percent: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")

  const effective = participant.cashback_percent ?? defaultPercent
  const isCustom = participant.cashback_percent !== null

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(participant.cashback_percent !== null ? String(participant.cashback_percent) : ""); setEditing(true) }}
        className="inline-flex items-center gap-1.5 justify-end"
        title="Keshbek foizini tahrirlash (bo'sh = standart)"
      >
        <StatusBadge label={`${effective}%`} variant={isCustom ? "warning" : "neutral"} />
        {participant.cashback_earned > 0 && (
          <span className="text-xs text-ink-muted tabular-nums">{formatMoney(participant.cashback_earned)}</span>
        )}
      </button>
    )
  }

  function commit() {
    setEditing(false)
    const trimmed = val.trim()
    if (trimmed === "") { onSet(null); return }
    const n = Number(trimmed)
    if (Number.isFinite(n) && n >= 0 && n <= 100) onSet(n)
  }

  return (
    <div className="relative inline-block">
      <input
        autoFocus
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={val}
        placeholder={`${defaultPercent}`}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") setEditing(false)
        }}
        className="w-16 border border-line-focus rounded-control px-2 py-1 pr-5 text-base text-right text-ink focus:outline-none"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-muted pointer-events-none">%</span>
    </div>
  )
}

// "Cashback ishlatish" — spend accumulated cashback against this participant's debt.
function SpendCell({ participant }: { participant: Participant }) {
  const { data: balance = 0 } = useClientCashbackBalance(participant.contact_id)
  const [open, setOpen] = useState(false)

  const debt = Math.max(0, Number(participant.price) - Number(participant.paid))
  const eligible = !!participant.contact_id && balance > 0 && debt > 0
  if (!eligible) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`Cashback balansi: ${formatMoney(balance)}`}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-tag text-xs font-semibold text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors"
      >
        Cashback
      </button>
      <ApplyCashbackModal isOpen={open} onClose={() => setOpen(false)} participant={participant} balance={balance} />
    </>
  )
}

// Editable event-default cashback %.
function DefaultCashbackEditor({
  percent,
  saving,
  onSave,
}: {
  percent: number
  saving: boolean
  onSave: (p: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(String(percent)); setEditing(true) }}
        className="group/cb inline-flex items-center gap-1"
        title="Standart keshbekni tahrirlash"
      >
        Standart keshbek: <strong className="text-ink">{percent}%</strong>
        <PencilSimple size={11} weight="bold" className="text-ink-faint opacity-0 group-hover/cb:opacity-100 transition-opacity" />
      </button>
    )
  }

  function commit() {
    setEditing(false)
    const n = Number(val)
    if (Number.isFinite(n) && n >= 0 && n <= 100 && n !== percent) onSave(n)
  }

  return (
    <span className="inline-flex items-center gap-1">
      Standart keshbek:
      <input
        autoFocus
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={val}
        disabled={saving}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") setEditing(false)
        }}
        className="w-14 border border-line-focus rounded-control px-1.5 py-0.5 text-xs text-right text-ink focus:outline-none"
      />
      %
    </span>
  )
}
