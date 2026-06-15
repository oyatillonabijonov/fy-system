import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, MagnifyingGlass, CaretLeft, Check, Warning } from "@phosphor-icons/react"
import { searchContacts, type ClientContact } from "@/lib/supabase/queries/events"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { useClientParticipations, useAddPayment } from "@/hooks/usePayments"
import { useAuth } from "@/context/AuthContext"
import { formatMoney, formatNumber, formatPhone } from "@/lib/format"

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const amountNum = amount ? Number(amount) : 0
  const noParticipations = !!client && !loadingParts && participations.length === 0
  const canSubmit = !!client && !!selectedPart && amountNum > 0 && !addMutation.isPending

  function handleSubmit() {
    if (!client) { setError("Mijozni tanlang"); return }
    if (participations.length === 0) { setError("Bu mijoz hech qaysi tadbirda ishtirokchi emas"); return }
    if (!selectedPart) { setError("Tadbirni tanlang"); return }
    if (amountNum <= 0) { setError("To'lov summasi 0 dan katta bo'lishi kerak"); return }
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
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-white rounded-[12px] shadow-2xl w-full max-w-md relative overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between">
              <h3 className="text-[16px] font-bold text-[#141414]">To'lov qo'shish</h3>
              <button onClick={onClose} className="p-1 hover:bg-[#F5F5F5] rounded-full transition-all">
                <X size={20} className="text-[#999999]" weight="bold" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 flex flex-col gap-4 overflow-y-auto">
              {error && (
                <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                  {error}
                </div>
              )}

              {/* 1. Client */}
              {!client ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">Mijoz *</label>
                  <div className="relative">
                    <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" weight="bold" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Ism yoki telefon bo'yicha qidirish..."
                      autoFocus
                      className="w-full border border-[#E0E0E0] rounded-[8px] pl-9 pr-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
                    />
                  </div>
                  {results.length > 0 && (
                    <div className="flex flex-col max-h-[240px] overflow-y-auto no-scrollbar mt-1">
                      {results.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { setClient(c); setQuery(""); setResults([]); setError(null) }}
                          className="w-full flex items-center gap-2.5 p-2 rounded-[8px] hover:bg-[#F5F5F5] transition-colors text-left"
                        >
                          {c.image ? (
                            <img src={c.image} alt={c.full_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-[#EBEBEB] text-[#666] text-[11px] font-bold flex items-center justify-center shrink-0">
                              {initials(c.full_name)}
                            </span>
                          )}
                          <span className="flex flex-col min-w-0">
                            <span className="text-[13px] font-medium text-[#141414] truncate">{c.full_name}</span>
                            <span className="text-[11px] text-[#999]">{formatPhone(c.phone)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {query.trim() && results.length === 0 && (
                    <p className="text-[12px] text-[#999] py-2">Mijoz topilmadi</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">Mijoz *</label>
                  <div className="flex items-center gap-2.5 border border-[#E0E0E0] rounded-[8px] p-2">
                    {client.image ? (
                      <img src={client.image} alt={client.full_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-[#EBEBEB] text-[#666] text-[11px] font-bold flex items-center justify-center shrink-0">
                        {initials(client.full_name)}
                      </span>
                    )}
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-[#141414] truncate">{client.full_name}</span>
                      <span className="text-[11px] text-[#999]">{formatPhone(client.phone)}</span>
                    </span>
                    <button
                      onClick={() => { setClient(null); setParticipationId(null) }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#999] hover:text-[#141414] transition-colors"
                    >
                      <CaretLeft size={12} weight="bold" /> O'zgartirish
                    </button>
                  </div>
                </div>
              )}

              {/* 2. Event picker */}
              {client && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">Tadbir *</label>
                  {loadingParts ? (
                    <div className="py-3 flex justify-center">
                      <div className="w-4 h-4 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : noParticipations ? (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-[8px] bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
                      <Warning size={15} weight="bold" className="shrink-0 mt-0.5" />
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
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[8px] border text-left transition-colors ${
                              sel ? "border-[#141414] bg-[#FBFBFB]" : "border-[#E0E0E0] hover:bg-[#F9F9F8]"
                            }`}
                          >
                            <span className="flex flex-col min-w-0">
                              <span className="text-[13px] font-medium text-[#141414] truncate">{p.event_name}</span>
                              <span className="text-[11px] text-[#999]">
                                Narx: {formatMoney(p.price)} · To'langan: {formatMoney(p.paid)}
                              </span>
                            </span>
                            {sel && <Check size={15} weight="bold" className="text-[#141414] shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Context */}
              {selectedPart && (
                <div className="flex items-center justify-between px-3 py-2 rounded-[8px] bg-[#FBFBFB] border border-[#F0F0F0] text-[12px]">
                  <span className="text-[#999]">Qolgan qarz</span>
                  <span className="font-bold" style={{ color: selectedPart.price - selectedPart.paid > 0 ? "#D13328" : "#1E7E34" }}>
                    {formatMoney(Math.max(selectedPart.price - selectedPart.paid, 0))}
                  </span>
                </div>
              )}

              {/* 3. Amount */}
              {selectedPart && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-[#999999]">To'lov summasi *</label>
                    <div className="relative">
                      <input
                        inputMode="numeric"
                        value={amount ? formatNumber(Number(amount)) : ""}
                        onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                        placeholder="100,000"
                        autoFocus
                        className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 pr-12 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#999] pointer-events-none">UZS</span>
                    </div>
                  </div>

                  {/* 4. Method */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-[#999999]">To'lov turi *</label>
                    <div className="flex gap-2">
                      {METHODS.map((m) => (
                        <button
                          key={m.value}
                          onClick={() => setMethod(m.value)}
                          className={`flex-1 py-2 rounded-[8px] text-[12px] font-semibold border transition-colors ${
                            method === m.value
                              ? "bg-[#141414] text-white border-[#141414]"
                              : "bg-white text-[#666] border-[#E0E0E0] hover:bg-[#F5F5F5]"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 5. Note */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-[#999999]">Izoh</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="Ixtiyoriy..."
                      className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors resize-none"
                    />
                  </div>

                  {/* 6. Responsible (read-only) */}
                  <div className="text-[11px] text-[#999]">
                    Mas'ul: <span className="font-semibold text-[#141414]">{user?.full_name ?? "—"}</span>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 pt-0 flex gap-3">
              <button
                onClick={onClose}
                disabled={addMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[8px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`flex-1 px-4 py-2.5 rounded-[8px] text-[13px] font-bold transition-all flex items-center justify-center gap-2 ${
                  canSubmit ? "bg-[#141414] text-white hover:bg-black active:scale-95" : "bg-[#E0E0E0] text-[#999] cursor-not-allowed"
                }`}
              >
                {addMutation.isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
