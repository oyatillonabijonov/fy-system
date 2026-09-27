import { useState, useEffect, useId, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, MagnifyingGlass, CaretLeft } from "@phosphor-icons/react"
import { searchContacts, type ClientContact } from "@/lib/supabase/queries/events"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { useEnrollParticipant } from "@/hooks/useEvents"
import { useAuth } from "@/context/AuthContext"
import { useDialog } from "@/hooks/useDialog"
import { formatMoney, formatNumber, formatPhone } from "@/lib/format"

interface EnrollParticipantModalProps {
  isOpen: boolean
  eventId: string
  existingContactIds: Set<string>
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

const INPUT =
  "w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"

export function EnrollParticipantModal({ isOpen, eventId, existingContactIds, onClose, onAdded }: EnrollParticipantModalProps) {
  const { user } = useAuth()
  const enroll = useEnrollParticipant(eventId)
  const titleId = useId()
  const clientSearchId = useId()
  const priceId = useId()
  const initialAmountId = useId()
  const panelRef = useDialog<HTMLDivElement>(onClose, isOpen)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ClientContact[]>([])
  const [client, setClient] = useState<ClientContact | null>(null)
  const [price, setPrice] = useState("")          // agreed amount, digits
  const [initialAmount, setInitialAmount] = useState("") // optional first payment, digits
  const [method, setMethod] = useState<PaymentMethod>("naqd")
  const [error, setError] = useState<string | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced client search (while no client picked)
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

  const priceNum = price ? Number(price) : 0
  const initNum = initialAmount ? Number(initialAmount) : 0
  const canSubmit = !!client && !enroll.isPending

  function handleSubmit() {
    if (!client) { setError("Mijozni tanlang"); return }
    // `priceNum > 0` used to guard this check, which disabled it exactly when the
    // price was left blank — a payment against a 0 price awards cashback on a
    // participation that is nominally free.
    if (initNum > 0 && priceNum <= 0) {
      setError("Boshlang'ich to'lov uchun avval kelishilgan summani kiriting")
      return
    }
    if (initNum > priceNum) {
      setError("Boshlang'ich to'lov kelishilgan summadan oshib ketdi")
      return
    }
    setError(null)
    enroll.mutate(
      { client, price: priceNum, initialAmount: initNum, method },
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
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-surface-raised rounded-overlay w-full max-w-md relative overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-5 border-b border-line flex items-center justify-between">
              <h3 id={titleId} className="text-md font-bold text-ink">Ishtirokchi qo'shish</h3>
              <button onClick={onClose} aria-label="Yopish" className="p-1 hover:bg-mute-ghost-hover rounded-full transition-all">
                <X size={20} className="text-ink-muted" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4 overflow-y-auto">
              {error && (
                <div className="px-3 py-2 rounded-surface text-sm font-medium bg-danger-soft text-danger-dark border border-danger-soft">
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
                      className={`${INPUT} pl-9`}
                    />
                  </div>
                  {results.length > 0 && (
                    <div className="flex flex-col max-h-[240px] overflow-y-auto no-scrollbar mt-1">
                      {results.map((c) => {
                        const added = existingContactIds.has(c.id)
                        return (
                          <button
                            key={c.id}
                            disabled={added}
                            onClick={() => { setClient(c); setQuery(""); setResults([]); setError(null) }}
                            className={`w-full flex items-center gap-2.5 p-2 rounded-item transition-colors text-left ${added ? "opacity-50 cursor-not-allowed" : "hover:bg-mute-ghost-hover"}`}
                          >
                            {c.image ? (
                              <img src={c.image} alt={c.full_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                            ) : (
                              <span className="w-8 h-8 rounded-full bg-mute-soft text-ink-muted text-xs font-bold flex items-center justify-center shrink-0">
                                {initials(c.full_name)}
                              </span>
                            )}
                            <span className="flex flex-col min-w-0 flex-1">
                              <span className="text-base font-medium text-ink truncate">{c.full_name}</span>
                              <span className="text-xs text-ink-muted">{formatPhone(c.phone)}</span>
                            </span>
                            {added && <span className="text-xs font-bold text-ink-muted">qo'shilgan</span>}
                          </button>
                        )
                      })}
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
                      <span className="w-8 h-8 rounded-full bg-mute-soft text-ink-muted text-xs font-bold flex items-center justify-center shrink-0">
                        {initials(client.full_name)}
                      </span>
                    )}
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-base font-medium text-ink truncate">{client.full_name}</span>
                      <span className="text-xs text-ink-muted">{formatPhone(client.phone)}</span>
                    </span>
                    <button
                      onClick={() => setClient(null)}
                      className="flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
                    >
                      <CaretLeft size={12} /> O'zgartirish
                    </button>
                  </div>
                </div>
              )}

              {client && (
                <>
                  {/* 2. Agreed amount */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={priceId} className="text-sm font-medium text-ink-muted">Kelishilgan summa</label>
                    <div className="relative">
                      <input
                        id={priceId}
                        inputMode="numeric"
                        value={price ? formatNumber(Number(price)) : ""}
                        onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
                        placeholder="15,000,000"
                        autoFocus
                        className={`${INPUT} pr-12`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted pointer-events-none">UZS</span>
                    </div>
                    <span className="text-xs text-ink-muted">Mijoz jami to'lashi kerak bo'lgan summa (0 = bepul)</span>
                  </div>

                  {/* 3. Optional first payment */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={initialAmountId} className="text-sm font-medium text-ink-muted">Boshlang'ich to'lov (ixtiyoriy)</label>
                    <div className="relative">
                      <input
                        id={initialAmountId}
                        inputMode="numeric"
                        value={initialAmount ? formatNumber(Number(initialAmount)) : ""}
                        onChange={(e) => setInitialAmount(e.target.value.replace(/\D/g, ""))}
                        placeholder="0"
                        className={`${INPUT} pr-12`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted pointer-events-none">UZS</span>
                    </div>
                  </div>

                  {initNum > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-ink-muted">To'lov turi</label>
                      <div className="flex gap-2">
                        {METHODS.map((m) => (
                          <button
                            key={m.value}
                            onClick={() => setMethod(m.value)}
                            aria-pressed={method === m.value}
                            className={`flex-1 py-2 rounded-control text-sm font-semibold border transition-colors ${
                              method === m.value ? "bg-accent text-ink-on-accent border-accent" : "bg-surface-raised text-ink-muted border-line hover:bg-mute-ghost-hover"
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="flex items-center justify-between px-3 py-2 rounded-control bg-surface-sunken border border-line text-sm">
                    <span className="text-ink-muted">Qoladigan qarz</span>
                    <span className="font-bold" style={{ color: priceNum - initNum > 0 ? "var(--ds-color-danger-text)" : "var(--ds-color-success-text)" }}>
                      {formatMoney(Math.max(priceNum - initNum, 0))}
                    </span>
                  </div>

                  {initNum > 0 && (
                    <div className="text-xs text-ink-muted">
                      Mas'ul: <span className="font-semibold text-ink">{user?.full_name ?? "—"}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-5 pt-0 flex gap-3">
              <button
                onClick={onClose}
                disabled={enroll.isPending}
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
                {enroll.isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Saqlanmoqda...
                  </>
                ) : (
                  "Qo'shish"
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
