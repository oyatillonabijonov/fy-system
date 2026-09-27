import { useState, useEffect, useId, useRef } from "react"
import { X, MagnifyingGlass, CaretLeft, Plus } from "@phosphor-icons/react"
import { searchContacts, ClientExistsError, type ClientContact } from "@/lib/supabase/queries/events"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { useEvents, useEventTariffs } from "@/hooks/useEvents"
import { useClientParticipations } from "@/hooks/usePayments"
import { useRecordPayment } from "@/hooks/useFinance"
import { useUsers } from "@/hooks/useUsers"
import { useDialog } from "@/hooks/useDialog"
import { tashkentToday } from "@/lib/period"
import { formatMoney, formatNumber, formatPhone } from "@/lib/format"

export type PickedClient = Pick<ClientContact, "id" | "full_name" | "phone" | "image">

export interface RecordPaymentPreset {
  client: PickedClient
  eventId: string
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "naqd", label: "Naqd" },
  { value: "karta", label: "Karta" },
  { value: "transfer", label: "Transfer" },
]

const INPUT =
  "w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
const LABEL = "text-[12px] font-medium text-[#999999]"

function onlyDigits(v: string): string {
  return v.replace(/\D/g, "")
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
}

function ClientAvatar({ c }: { c: PickedClient }) {
  return c.image ? (
    <img src={c.image} alt={c.full_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
  ) : (
    <span className="w-8 h-8 rounded-full bg-[#EBEBEB] text-[#666] text-[11px] font-bold flex items-center justify-center shrink-0">
      {initials(c.full_name)}
    </span>
  )
}

function MoneyInput({ id, value, onChange, invalid, placeholder }: { id: string; value: string; onChange: (digits: string) => void; invalid?: boolean; placeholder?: string }) {
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="numeric"
        value={value ? formatNumber(Number(value)) : ""}
        onChange={(e) => onChange(onlyDigits(e.target.value))}
        placeholder={placeholder}
        aria-invalid={invalid}
        className={`${INPUT} pr-12 ${invalid ? "border-[#D13328]" : ""}`}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#999] pointer-events-none">UZS</span>
    </div>
  )
}

// Mounted only while open (the parent renders it conditionally), so every open starts fresh.
export function RecordPaymentModal({ preset, onClose }: { preset?: RecordPaymentPreset; onClose: () => void }) {
  const record = useRecordPayment()
  const { data: events = [] } = useEvents()
  const { data: users = [] } = useUsers()
  const sellers = users.filter((u) => u.is_active && u.department === "sotuv")
  const guardedClose = () => !record.isPending && onClose()
  const panelRef = useDialog<HTMLDivElement>(guardedClose, true)

  const titleId = useId()
  const searchId = useId()
  const nameId = useId()
  const phoneId = useId()
  const eventFieldId = useId()
  const tariffFieldId = useId()
  const priceId = useId()
  const sellerFieldId = useId()
  const amountId = useId()
  const dateId = useId()
  const dueId = useId()
  const noteId = useId()

  const [mode, setMode] = useState<"search" | "new">("search")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ClientContact[]>([])
  const [client, setClient] = useState<PickedClient | null>(preset?.client ?? null)
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [suggestion, setSuggestion] = useState<PickedClient | null>(null)
  const [eventId, setEventId] = useState(preset?.eventId ?? "")
  const [tariffId, setTariffId] = useState("")
  const [price, setPrice] = useState("")
  const [sellerId, setSellerId] = useState("")
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("naqd")
  const [date, setDate] = useState(() => tashkentToday())
  const [due, setDue] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced client search (search mode, while no client is picked)
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

  const existing = mode === "search" ? client : null
  const { data: participations = [], isLoading: loadingParts } = useClientParticipations(existing?.id ?? "")
  const { data: tariffs = [] } = useEventTariffs(eventId)
  const enrolled = existing ? (participations.find((p) => p.event_id === eventId) ?? null) : null
  const checking = !!existing && loadingParts
  const needsEnroll = !!eventId && !enrolled && !checking

  const debt = enrolled ? Math.max(enrolled.price - enrolled.paid, 0) : price ? Number(price) : 0
  const amountNum = amount ? Number(amount) : 0
  const overDebt = amountNum > debt
  const remaining = Math.max(debt - amountNum, 0)
  const hasClient = existing ? true : mode === "new" && fullName.trim().length > 0 && onlyDigits(phone).length >= 9
  const enrollValid = !needsEnroll || (!!tariffId && !!sellerId && price !== "")
  const canSubmit = hasClient && !!eventId && !checking && enrollValid && amountNum > 0 && !overDebt && !record.isPending

  function pickTariff(id: string) {
    setTariffId(id)
    const t = tariffs.find((x) => x.id === id)
    if (t) setPrice(String(Math.round(t.price)))
  }

  function pick(c: PickedClient) {
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
    record.mutate(
      {
        eventId,
        amount: amountNum,
        method,
        // Today → the real moment; a back-dated entry → noon of that Tashkent day.
        paidAt: date === tashkentToday() ? new Date().toISOString() : `${date}T12:00:00+05:00`,
        client: existing ? { clientId: existing.id } : { fullName: fullName.trim(), phone },
        enroll: needsEnroll ? { tariffId, sellerId, price: Number(price) } : null,
        nextDueDate: remaining > 0 && due ? due : null,
        note: note.trim(),
      },
      {
        onSuccess: onClose,
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div onClick={guardedClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white rounded-[12px] shadow-2xl w-full max-w-md relative overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between">
          <h3 id={titleId} className="text-[16px] font-bold text-[#141414]">To'lov qo'shish</h3>
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

          {/* 1. Client */}
          {mode === "search" && !client && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={searchId} className={LABEL}>Mijoz *</label>
                <button onClick={startNew} className="flex items-center gap-1 text-[11px] font-semibold text-[#666] hover:text-[#141414] transition-colors">
                  <Plus size={11} weight="bold" /> Yangi mijoz
                </button>
              </div>
              <div className="relative">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" weight="bold" />
                <input
                  id={searchId}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ism yoki telefon bo'yicha qidirish..."
                  autoFocus
                  className={`${INPUT} pl-9`}
                />
              </div>
              {results.length > 0 && (
                <div className="flex flex-col max-h-[200px] overflow-y-auto no-scrollbar mt-1">
                  {results.map((c) => (
                    <button key={c.id} onClick={() => pick(c)} className="w-full flex items-center gap-2.5 p-2 rounded-[8px] hover:bg-[#F5F5F5] transition-colors text-left">
                      <ClientAvatar c={c} />
                      <span className="flex flex-col min-w-0 flex-1">
                        <span className="text-[13px] font-medium text-[#141414] truncate">{c.full_name}</span>
                        <span className="text-[11px] text-[#999]">{formatPhone(c.phone)}</span>
                      </span>
                    </button>
                  ))}
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
                <button onClick={() => setClient(null)} className="flex items-center gap-1 text-[11px] font-semibold text-[#999] hover:text-[#141414] transition-colors">
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

          {/* 2. Event */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={eventFieldId} className={LABEL}>Tadbir *</label>
            <select
              id={eventFieldId}
              value={eventId}
              onChange={(e) => { setEventId(e.target.value); setTariffId(""); setPrice("") }}
              className={INPUT}
            >
              <option value="" disabled>Tadbirni tanlang</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          {/* 3a. Already in the event → current state */}
          {enrolled && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-[8px] bg-[#FBFBFB] border border-[#F0F0F0] text-[12px]">
              <span className="text-[#999]">Kelishuv {formatMoney(enrolled.price)} · to'langan {formatMoney(enrolled.paid)}</span>
              <span className="font-bold whitespace-nowrap" style={{ color: debt > 0 ? "#D13328" : "#1E7E34" }}>
                {debt > 0 ? `Qarz ${formatMoney(debt)}` : "Qarz yo'q"}
              </span>
            </div>
          )}

          {/* 3b. Not in the event yet → enrolled in the same call */}
          {needsEnroll && (
            <div className="flex flex-col gap-3 p-3 rounded-[8px] border border-dashed border-[#E0E0E0]">
              <span className="text-[11px] font-bold text-[#999]">Mijoz bu tadbirda yo'q — to'lov bilan birga yoziladi</span>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={tariffFieldId} className={LABEL}>Tarif *</label>
                <select id={tariffFieldId} value={tariffId} onChange={(e) => pickTariff(e.target.value)} disabled={tariffs.length === 0} className={INPUT}>
                  <option value="" disabled>{tariffs.length === 0 ? "Bu tadbirda tarif yo'q" : "Tarifni tanlang"}</option>
                  {tariffs.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} — {formatMoney(t.price)}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={priceId} className={LABEL}>Kelishuv summasi *</label>
                <MoneyInput id={priceId} value={price} onChange={setPrice} placeholder="17,000,000" />
                <span className="text-[11px] text-[#999]">Tarif narxi qo'yiladi; chegirma bo'lsa o'zgartiring</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={sellerFieldId} className={LABEL}>Sotuvchi *</label>
                <select id={sellerFieldId} value={sellerId} onChange={(e) => setSellerId(e.target.value)} className={INPUT}>
                  <option value="" disabled>Sotuvchini tanlang</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 4. Payment */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={amountId} className={LABEL}>To'lov summasi *</label>
            <MoneyInput id={amountId} value={amount} onChange={setAmount} invalid={overDebt} placeholder="17,000,000" />
            {overDebt && <span className="text-[11px] text-[#D13328]">Qarzdan ko'p. Qolgan qarz: {formatMoney(debt)}</span>}
          </div>

          <div className="flex gap-2" role="group" aria-label="To'lov usuli">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                aria-pressed={method === m.value}
                className={`flex-1 py-2 rounded-[8px] text-[12px] font-semibold border transition-colors ${
                  method === m.value ? "bg-[#141414] text-white border-[#141414]" : "bg-white text-[#666] border-[#E0E0E0] hover:bg-[#F5F5F5]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label htmlFor={dateId} className={LABEL}>To'lov sanasi</label>
              <input id={dateId} type="date" value={date} max={tashkentToday()} onChange={(e) => setDate(e.target.value || tashkentToday())} className={INPUT} />
            </div>
            {amountNum > 0 && !overDebt && remaining > 0 && (
              <div className="flex flex-col gap-1.5 flex-1">
                <label htmlFor={dueId} className={LABEL}>Keyingi to'lov sanasi</label>
                <input id={dueId} type="date" value={due} min={date} onChange={(e) => setDue(e.target.value)} className={INPUT} />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={noteId} className={LABEL}>Izoh</label>
            <input id={noteId} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} placeholder="Ixtiyoriy" />
          </div>

          {amountNum > 0 && !overDebt && (
            <div className="flex items-center justify-between px-3 py-2 rounded-[8px] bg-[#FBFBFB] border border-[#F0F0F0] text-[12px]">
              <span className="text-[#999]">To'lovdan keyin qarz</span>
              <span className="font-bold" style={{ color: remaining > 0 ? "#D13328" : "#1E7E34" }}>{formatMoney(remaining)}</span>
            </div>
          )}
        </div>

        <div className="p-5 pt-0 flex gap-3">
          <button
            onClick={onClose}
            disabled={record.isPending}
            className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[8px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all disabled:opacity-50"
          >
            Bekor qilish
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex-1 px-4 py-2.5 rounded-[8px] text-[13px] font-bold transition-all ${
              canSubmit ? "bg-[#141414] text-white hover:bg-black active:scale-95" : "bg-[#E0E0E0] text-[#999] cursor-not-allowed"
            }`}
          >
            {record.isPending ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </div>
    </div>
  )
}
