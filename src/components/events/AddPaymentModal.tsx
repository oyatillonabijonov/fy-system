import { useState, useEffect, useId, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, MagnifyingGlass, CaretLeft, Check, Warning } from "@phosphor-icons/react"
import { searchContacts, type ClientContact } from "@/lib/supabase/queries/events"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { useClientParticipations, useAddPayment } from "@/hooks/usePayments"
import { useAuth } from "@/context/AuthContext"
import { useDialog } from "@/hooks/useDialog"
import { formatMoney, formatNumber, formatPhone } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

interface AddPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onAdded: () => void
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "naqd", label: "Naqd" },
  { value: "karta", label: "Karta" },
  { value: "transfer", label: "Transfer" },
]

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
}

// State lives here; the parent remounts this modal (via key) on each open, so
// every open starts fresh — no reset effect needed.
export function AddPaymentModal({ isOpen, onClose, onAdded }: AddPaymentModalProps) {
  const { user } = useAuth()
  const titleId = useId()
  const clientSearchId = useId()
  const amountLabelId = useId()
  const noteLabelId = useId()
  const panelRef = useDialog<HTMLDivElement>(onClose, isOpen)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ClientContact[]>([])
  const [client, setClient] = useState<ClientContact | null>(null)
  const [participationId, setParticipationId] = useState<string | null>(null)
  const [amount, setAmount] = useState("") // digits only
  const [method, setMethod] = useState<PaymentMethod>("naqd")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: participations = [], isLoading: loadingParts } = useClientParticipations(client?.id ?? "")
  const selectedPart = participations.find((p) => p.participant_id === participationId) ?? null
  const addMutation = useAddPayment(selectedPart?.participant_id ?? "")

  // Debounced client search (only while no client picked)
  useEffect(() => {
    if (client) return
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      try {
        setResults(await searchContacts(query))
      } catch {
        setResults([])
      }
    }, 300)
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
    }
  }, [query, client])

  const amountNum = amount ? Number(amount) : 0
  const selectedDebt = selectedPart ? Math.max(selectedPart.price - selectedPart.paid, 0) : 0
  const noParticipations = !!client && !loadingParts && participations.length === 0
  const canSubmit = !!client && !!selectedPart && amountNum > 0 && !addMutation.isPending

  function handleSubmit() {
    if (!client) { setError("Mijozni tanlang"); return }
    if (participations.length === 0) { setError("Bu mijoz hech qaysi tadbirda ishtirokchi emas"); return }
    if (!selectedPart) { setError("Tadbirni tanlang"); return }
    if (amountNum <= 0) { setError("To'lov summasi 0 dan katta bo'lishi kerak"); return }
    // Paying past the debt drives it negative and awards cashback on money that
    // was never owed — the trigger chain has no way to tell it was a typo.
    if (selectedDebt <= 0) {
      setError("Bu tadbirda qarz yo'q. Avval kelishilgan narxni belgilang")
      return
    }
    if (amountNum > selectedDebt) {
      setError(`To'lov qarzdan ko'p. Qolgan qarz: ${formatMoney(selectedDebt)}`)
      return
    }
    setError(null)
    addMutation.mutate(
      {
        participantId: selectedPart.participant_id,
        amount: amountNum,
        method,
        paidAt: new Date().toISOString(),
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => { onAdded(); onClose() },
        onError: (err) => setError(err instanceof Error ? err.message : "Xatolik yuz berdi"),
      },
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-surface-overlay backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-surface-raised rounded-overlay w-full max-w-md relative overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-5 border-b border-line flex items-center justify-between">
              <h3 id={titleId} className="text-md font-semibold text-ink">To'lov qo'shish</h3>
              <button onClick={onClose} aria-label="Yopish" className="p-1 hover:bg-mute-ghost-hover rounded-full transition-all">
                <X size={20} className="text-ink-muted" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 flex flex-col gap-4 overflow-y-auto">
              {error && (
                <div className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark">
                  {error}
                </div>
              )}

              {/* 1. Client */}
              {!client ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={clientSearchId} className="text-sm font-medium text-ink-muted">Mijoz *</label>
                  <div className="relative">
                    <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                    <input
                      id={clientSearchId}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Ism yoki telefon bo'yicha qidirish..."
                      autoFocus
                      className="w-full border border-line rounded-control pl-9 pr-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
                    />
                  </div>
                  {results.length > 0 && (
                    <div className="flex flex-col max-h-[240px] overflow-y-auto no-scrollbar mt-1">
                      {results.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { setClient(c); setQuery(""); setResults([]); setError(null) }}
                          className="w-full flex items-center gap-2.5 p-2 rounded-control hover:bg-mute-ghost-hover transition-colors text-left"
                        >
                          {c.image ? (
                            <img src={c.image} alt={c.full_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-mute-soft text-ink-muted text-xs font-semibold flex items-center justify-center shrink-0">
                              {initials(c.full_name)}
                            </span>
                          )}
                          <span className="flex flex-col min-w-0">
                            <span className="text-base font-medium text-ink truncate">{c.full_name}</span>
                            <span className="text-xs text-ink-muted">{formatPhone(c.phone)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {query.trim() && results.length === 0 && (
                    <p className="text-sm text-ink-muted py-2">Mijoz topilmadi</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-muted">Mijoz *</label>
                  <div className="flex items-center gap-2.5 border border-line rounded-control p-2">
                    {client.image ? (
                      <img src={client.image} alt={client.full_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-mute-soft text-ink-muted text-xs font-semibold flex items-center justify-center shrink-0">
                        {initials(client.full_name)}
                      </span>
                    )}
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-base font-medium text-ink truncate">{client.full_name}</span>
                      <span className="text-xs text-ink-muted">{formatPhone(client.phone)}</span>
                    </span>
                    <button
                      onClick={() => { setClient(null); setParticipationId(null) }}
                      className="flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
                    >
                      <CaretLeft size={12} /> O'zgartirish
                    </button>
                  </div>
                </div>
              )}

              {/* 2. Event picker */}
              {client && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-muted">Tadbir *</label>
                  {loadingParts ? (
                    <div className="py-3 flex justify-center">
                      <ThinkingOrb state="searching" size={20} theme="light" />
                    </div>
                  ) : noParticipations ? (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-control bg-warning-soft text-sm text-warning-dark">
                      <Warning size={15} className="shrink-0 mt-0.5" />
                      Bu mijoz hech qaysi tadbirda ishtirokchi emas. Avval tadbirga qo'shing.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {participations.map((p) => {
                        const sel = p.participant_id === participationId
                        return (
                          <button
                            key={p.participant_id}
                            onClick={() => { setParticipationId(p.participant_id); setError(null) }}
                            aria-pressed={sel}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-control border text-left transition-colors ${
                              sel ? "border-line bg-surface-sunken" : "border-line hover:bg-mute-ghost-hover"
                            }`}
                          >
                            <span className="flex flex-col min-w-0">
                              <span className="text-base font-medium text-ink truncate">{p.event_name}</span>
                              <span className="text-xs text-ink-muted tabular-nums">
                                Narx: {formatMoney(p.price)} · To'langan: {formatMoney(p.paid)}
                              </span>
                            </span>
                            {sel && <Check size={15} className="text-ink shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Context */}
              {selectedPart && (
                <div className="flex items-center justify-between px-3 py-2 rounded-control bg-surface-sunken border border-line text-sm">
                  <span className="text-ink-muted">Qolgan qarz</span>
                  <span className={`font-bold tabular-nums ${selectedPart.price - selectedPart.paid > 0 ? "text-danger-text" : "text-success-text"}`}>
                    {formatMoney(Math.max(selectedPart.price - selectedPart.paid, 0))}
                  </span>
                </div>
              )}

              {/* 3. Amount */}
              {selectedPart && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={amountLabelId} className="text-sm font-medium text-ink-muted">To'lov summasi *</label>
                    <div className="relative">
                      <input
                        id={amountLabelId}
                        inputMode="numeric"
                        value={amount ? formatNumber(Number(amount)) : ""}
                        onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                        placeholder="100,000"
                        autoFocus
                        className="w-full border border-line rounded-control px-3 py-2 pr-12 text-base text-ink tabular-nums placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted pointer-events-none">UZS</span>
                    </div>
                  </div>

                  {/* 4. Method */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-ink-muted">To'lov turi *</label>
                    <div className="flex gap-2">
                      {METHODS.map((m) => (
                        <button
                          key={m.value}
                          onClick={() => setMethod(m.value)}
                          aria-pressed={method === m.value}
                          className={`flex-1 py-2 rounded-control text-sm font-semibold border transition-colors ${
                            method === m.value
                              ? "bg-accent text-ink-on-accent border-transparent"
                              : "bg-surface text-ink-muted border-line hover:bg-mute-ghost-hover"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 5. Note */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={noteLabelId} className="text-sm font-medium text-ink-muted">Izoh</label>
                    <textarea
                      id={noteLabelId}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="Ixtiyoriy..."
                      className="w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors resize-none"
                    />
                  </div>

                  {/* 6. Responsible (read-only) */}
                  <div className="text-xs text-ink-muted">
                    Mas'ul: <span className="font-semibold text-ink">{user?.full_name ?? "—"}</span>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 pt-0 flex gap-3">
              <button
                onClick={onClose}
                disabled={addMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-mute-soft text-ink rounded-control text-base font-bold hover:bg-mute-soft-hover transition-all disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`flex-1 px-4 py-2.5 rounded-control text-base font-bold transition-all flex items-center justify-center gap-2 ${
                  canSubmit ? "bg-accent text-ink-on-accent hover:bg-accent-hover active:scale-95" : "bg-mute-soft text-ink-muted cursor-not-allowed"
                }`}
              >
                {addMutation.isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Saqlanmoqda...
                  </>
                ) : (
                  "Saqlash"
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
