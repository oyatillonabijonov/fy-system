import { useState, useEffect, useId, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, MagnifyingGlass, CaretLeft, Plus } from "@phosphor-icons/react"
import { searchContacts, ClientExistsError, type ClientContact } from "@/lib/supabase/queries/events"
import { useEnrollParticipant, useEventTariffs } from "@/hooks/useEvents"
import { useUsers } from "@/hooks/useUsers"
import { useDialog } from "@/hooks/useDialog"
import { formatMoney, formatPhone } from "@/lib/format"
import { MoneyInput } from "@/components/moliya/RecordPaymentModal"

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
  "w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
const LABEL = "text-sm font-medium text-ink-muted"

function ClientAvatar({ c }: { c: PickedClient }) {
  return c.image ? (
    <img src={c.image} alt={c.full_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
  ) : (
    <span className="w-8 h-8 rounded-full bg-mute-soft text-ink-muted text-xs font-semibold flex items-center justify-center shrink-0">
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
  const [price, setPrice] = useState("")
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
  // No tariffs on the event → "Individual kelishuv" with a typed price; seller is optional
  const noTariffs = !loadingTariffs && tariffs.length === 0
  const canSubmit = hasClient && !loadingTariffs && (noTariffs ? price !== "" : !!tariff) && !enroll.isPending

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
        tariffId: noTariffs ? null : tariff,
        sellerId: seller || null,
        price: noTariffs ? Number(price) : undefined,
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
            onClick={onClose} className="absolute inset-0 bg-surface-overlay backdrop-blur-sm"
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
                <div role="alert" className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark">
                  {error}
                </div>
              )}

              {/* 1. Client */}
              {mode === "search" && !client && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor={clientSearchId} className={LABEL}>Mijoz *</label>
                    <button onClick={startNew} className="flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink transition-colors">
                      <Plus size={11} weight="bold" /> Yangi mijoz
                    </button>
                  </div>
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
                            onClick={() => pick(c)}
                            className={`w-full flex items-center gap-2.5 p-2 rounded-item transition-colors text-left ${added ? "opacity-50 cursor-not-allowed" : "hover:bg-mute-ghost-hover"}`}
                          >
                            <ClientAvatar c={c} />
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
                    <button onClick={startNew} className="text-left text-sm text-ink-muted py-2 hover:text-ink">
                      Mijoz topilmadi — <span className="font-semibold underline">yangi mijoz qo'shish</span>
                    </button>
                  )}
                </div>
              )}

              {mode === "search" && client && (
                <div className="flex flex-col gap-1.5">
                  <span className={LABEL}>Mijoz *</span>
                  <div className="flex items-center gap-2.5 border border-line rounded-control p-2">
                    <ClientAvatar c={client} />
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-base font-medium text-ink truncate">{client.full_name}</span>
                      <span className="text-xs text-ink-muted">{formatPhone(client.phone)}</span>
                    </span>
                    <button
                      onClick={() => setClient(null)}
                      className="flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
                    >
                      <CaretLeft size={12} weight="bold" /> O'zgartirish
                    </button>
                  </div>
                </div>
              )}

              {mode === "new" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">Yangi mijoz</span>
                    <button
                      onClick={() => { setMode("search"); setSuggestion(null) }}
                      className="flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
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
                    <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2 rounded-control bg-surface-sunken border border-line text-sm">
                      <span className="text-ink-muted">Bu raqam <span className="font-bold text-ink">{suggestion.full_name}</span>ga tegishli.</span>
                      <button onClick={() => pick(suggestion)} className="shrink-0 font-bold text-ink underline">Shu mijozni tanlash</button>
                    </div>
                  )}
                </div>
              )}

              {/* 2. Tariff — or the agreed price when the event has no tariffs */}
              {noTariffs ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={tariffId} className={LABEL}>Kelishilgan narx *</label>
                  <MoneyInput id={tariffId} value={price} onChange={setPrice} placeholder="17,000,000" />
                  <span className="text-xs text-ink-muted">Bu tadbirda tarif yo'q — individual narx yoziladi</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={tariffId} className={LABEL}>Tarif *</label>
                  <select id={tariffId} value={tariff} onChange={(e) => setTariff(e.target.value)} className={INPUT}>
                    <option value="" disabled>Tarifni tanlang</option>
                    {tariffs.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} — {formatMoney(t.price)}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 3. Seller */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={sellerId} className={LABEL}>Sotuvchi</label>
                <select id={sellerId} value={seller} onChange={(e) => setSeller(e.target.value)} className={INPUT}>
                  <option value="">Belgilanmagan</option>
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
                className="flex-1 px-4 py-2.5 bg-mute-soft text-ink rounded-full text-base font-bold hover:bg-mute-soft-hover transition-all disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`flex-1 px-4 py-2.5 rounded-full text-base font-bold transition-all flex items-center justify-center gap-2 ${
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
