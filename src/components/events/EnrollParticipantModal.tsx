import { useState, useEffect, useId, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, MagnifyingGlass, CaretLeft, Plus, Warning } from "@phosphor-icons/react"
import { searchContacts, ClientExistsError, type ClientContact } from "@/lib/supabase/queries/events"
import { useEnrollParticipant, useEventTariffs } from "@/hooks/useEvents"
import { useUsers } from "@/hooks/useUsers"
import { useDialog } from "@/hooks/useDialog"
import { formatMoney, formatPhone } from "@/lib/format"

interface EnrollParticipantModalProps {
  isOpen: boolean
  eventId: string
  existingContactIds: Set<string>
  onClose: () => void
  onAdded: () => void
}

type PickedClient = Pick<ClientContact, "id" | "full_name" | "phone" | "image">

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
}

const INPUT =
  "w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
const LABEL = "text-[12px] font-medium text-[#999999]"

function ClientAvatar({ c }: { c: PickedClient }) {
  return c.image ? (
    <img src={c.image} alt={c.full_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
  ) : (
    <span className="w-8 h-8 rounded-full bg-[#EBEBEB] text-[#666] text-[11px] font-bold flex items-center justify-center shrink-0">
      {initials(c.full_name)}
    </span>
  )
}

// State lives here; the parent remounts this modal (via key) on each open.
export function EnrollParticipantModal({ isOpen, eventId, existingContactIds, onClose, onAdded }: EnrollParticipantModalProps) {
  const enroll = useEnrollParticipant(eventId)
  const { data: tariffs = [], isLoading: loadingTariffs } = useEventTariffs(eventId)
  const { data: users = [] } = useUsers()
  const sellers = users.filter((u) => u.is_active && u.department === "sotuv")

  const titleId = useId()
  const clientSearchId = useId()
  const nameId = useId()
  const phoneId = useId()
  const tariffId = useId()
  const sellerId = useId()
  const panelRef = useDialog<HTMLDivElement>(onClose, isOpen)

  const [mode, setMode] = useState<"search" | "new">("search")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ClientContact[]>([])
  const [client, setClient] = useState<PickedClient | null>(null)
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [suggestion, setSuggestion] = useState<PickedClient | null>(null)
  const [tariff, setTariff] = useState("")
  const [seller, setSeller] = useState("")
  const [error, setError] = useState<string | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced client search (only in search mode, while no client picked)
  useEffect(() => {
    if (client || mode !== "search") return
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
  }, [query, client, mode])

  const phoneDigits = phone.replace(/\D/g, "")
  const newClientValid = fullName.trim().length > 0 && phoneDigits.length >= 9
  const hasClient = mode === "search" ? !!client : newClientValid
  const blocked = !loadingTariffs && (tariffs.length === 0 || sellers.length === 0)
  const canSubmit = hasClient && !!tariff && !!seller && !blocked && !enroll.isPending

  function pick(c: PickedClient) {
    if (existingContactIds.has(c.id)) {
      setError("Bu mijoz allaqachon ushbu tadbirga qo'shilgan")
      return
    }
    setMode("search")
    setClient(c)
    setSuggestion(null)
    setQuery("")
    setResults([])
    setError(null)
  }

  function startNew() {
    setMode("new")
    setClient(null)
    // A typed phone-looking query pre-fills the phone, anything else the name.
    if (/^[\d\s+()-]+$/.test(query.trim())) setPhone(query.trim())
    else setFullName(query.trim())
    setError(null)
  }

  function handleSubmit() {
    if (!canSubmit) return
    setError(null)
    setSuggestion(null)
    enroll.mutate(
      {
        tariffId: tariff,
        sellerId: seller,
        client: mode === "search" && client ? { clientId: client.id } : { fullName: fullName.trim(), phone },
      },
      {
        onSuccess: () => { onAdded(); onClose() },
        onError: (err) => {
          if (err instanceof ClientExistsError) {
            setSuggestion({ id: err.clientId, full_name: err.clientName, phone, image: null })
            return
          }
          setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
        },
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
            className="bg-white rounded-[12px] shadow-2xl w-full max-w-md relative overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between">
              <h3 id={titleId} className="text-[16px] font-bold text-[#141414]">Ishtirokchi qo'shish</h3>
              <button onClick={onClose} aria-label="Yopish" className="p-1 hover:bg-[#F5F5F5] rounded-full transition-all">
                <X size={20} className="text-[#999999]" weight="bold" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4 overflow-y-auto">
              {error && (
                <div role="alert" className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                  {error}
                </div>
              )}

              {blocked && (
                <div role="alert" className="flex items-start gap-2 px-3 py-2 rounded-[8px] text-[12px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  <Warning size={14} weight="bold" className="mt-0.5 shrink-0" />
                  {tariffs.length === 0
                    ? "Bu tadbirda tarif yo'q. Avval tadbirni tahrirlab, tarif qo'shing."
                    : "Sotuv bo'limida faol hodim yo'q. Hodimlar bo'limida hodimga \"Sotuv\" bo'limini belgilang."}
                </div>
              )}

              {/* 1. Client */}
              {mode === "search" && !client && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor={clientSearchId} className={LABEL}>Mijoz *</label>
                    <button onClick={startNew} className="flex items-center gap-1 text-[11px] font-semibold text-[#666] hover:text-[#141414] transition-colors">
                      <Plus size={11} weight="bold" /> Yangi mijoz
                    </button>
                  </div>
                  <div className="relative">
                    <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" weight="bold" />
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
                            onClick={() => pick(c)}
                            className={`w-full flex items-center gap-2.5 p-2 rounded-[8px] transition-colors text-left ${added ? "opacity-50 cursor-not-allowed" : "hover:bg-[#F5F5F5]"}`}
                          >
                            <ClientAvatar c={c} />
                            <span className="flex flex-col min-w-0 flex-1">
                              <span className="text-[13px] font-medium text-[#141414] truncate">{c.full_name}</span>
                              <span className="text-[11px] text-[#999]">{formatPhone(c.phone)}</span>
                            </span>
                            {added && <span className="text-[10px] font-bold text-[#999]">qo'shilgan</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {query.trim() && results.length === 0 && (
                    <button onClick={startNew} className="text-left text-[12px] text-[#666] py-2 hover:text-[#141414]">
                      Mijoz topilmadi — <span className="font-semibold underline">yangi mijoz qo'shish</span>
                    </button>
                  )}
                </div>
              )}

              {mode === "search" && client && (
                <div className="flex flex-col gap-1.5">
                  <span className={LABEL}>Mijoz *</span>
                  <div className="flex items-center gap-2.5 border border-[#E0E0E0] rounded-[8px] p-2">
                    <ClientAvatar c={client} />
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-[#141414] truncate">{client.full_name}</span>
                      <span className="text-[11px] text-[#999]">{formatPhone(client.phone)}</span>
                    </span>
                    <button
                      onClick={() => setClient(null)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#999] hover:text-[#141414] transition-colors"
                    >
                      <CaretLeft size={12} weight="bold" /> O'zgartirish
                    </button>
                  </div>
                </div>
              )}

              {mode === "new" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-[#141414]">Yangi mijoz</span>
                    <button
                      onClick={() => { setMode("search"); setSuggestion(null) }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#999] hover:text-[#141414] transition-colors"
                    >
                      <CaretLeft size={12} weight="bold" /> Mavjudlardan tanlash
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={nameId} className={LABEL}>Ism Familiya *</label>
                    <input id={nameId} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Aliyev Vali" autoFocus className={INPUT} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={phoneId} className={LABEL}>Telefon *</label>
                    <input
                      id={phoneId}
                      type="tel"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setSuggestion(null) }}
                      placeholder="+998 90 123 45 67"
                      className={INPUT}
                    />
                  </div>
                  {suggestion && (
                    <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2 rounded-[8px] bg-[#FBFBFB] border border-[#E0E0E0] text-[12px]">
                      <span className="text-[#666]">Bu raqam <span className="font-bold text-[#141414]">{suggestion.full_name}</span>ga tegishli.</span>
                      <button onClick={() => pick(suggestion)} className="shrink-0 font-bold text-[#141414] underline">Shu mijozni tanlash</button>
                    </div>
                  )}
                </div>
              )}

              {/* 2. Tariff */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={tariffId} className={LABEL}>Tarif *</label>
                <select id={tariffId} value={tariff} onChange={(e) => setTariff(e.target.value)} disabled={tariffs.length === 0} className={INPUT}>
                  <option value="" disabled>Tarifni tanlang</option>
                  {tariffs.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} — {formatMoney(t.price)}</option>
                  ))}
                </select>
              </div>

              {/* 3. Seller */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={sellerId} className={LABEL}>Sotuvchi *</label>
                <select id={sellerId} value={seller} onChange={(e) => setSeller(e.target.value)} disabled={sellers.length === 0} className={INPUT}>
                  <option value="" disabled>Sotuvchini tanlang</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-5 pt-0 flex gap-3">
              <button
                onClick={onClose}
                disabled={enroll.isPending}
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
                {enroll.isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
