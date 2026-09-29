import { useState, useRef, useEffect, useId } from "react"
import { toast } from "@/lib/toast"
import { motion, AnimatePresence } from "framer-motion"
import { X, CaretDown, MagnifyingGlass, Check, Plus, Trash } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import {
  createEvent,
  updateEvent,
  type Event,
} from "@/lib/supabase/queries/events"
import { saveEventTariffs } from "@/lib/supabase/queries/tariffs"
import { useUsers } from "@/hooks/useUsers"
import { useEventTariffs, TARIFFS_KEY } from "@/hooks/useEvents"
import type { UserProfile } from "@/lib/supabase/queries/auth"
import { useDialog } from "@/hooks/useDialog"
import { formatNumber, formatDate } from "@/lib/format"

interface CreateEventDrawerProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
  editEvent?: Event | null
}

const LABEL = "text-sm font-medium text-ink-muted"
const INPUT =
  "w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"

interface TariffRow {
  key: string
  id?: string
  name: string
  price: string // digits only
}

function blankTariff(): TariffRow {
  return { key: crypto.randomUUID(), name: "", price: "" }
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
}

function toDateInput(value: string | null): string {
  if (!value) return ""
  return value.slice(0, 10)
}

// ─── Manager combobox ──────────────────────────────────────────────────────────
function ManagerSelect({
  id,
  value,
  onChange,
  managers,
  invalid,
}: {
  id?: string
  value: string | null
  onChange: (id: string) => void
  managers: UserProfile[]
  invalid: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const selected = managers.find((m) => m.id === value) ?? null
  const filtered = query.trim()
    ? managers.filter((m) => m.full_name.toLowerCase().includes(query.trim().toLowerCase()))
    : managers

  return (
    <div className="relative" ref={ref}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 border rounded-control px-3 py-2 text-base transition-colors ${
          invalid ? "border-danger" : "border-line focus:border-line-focus"
        }`}
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <Avatar name={selected.full_name} url={selected.avatar_url} size={20} />
            <span className="text-ink font-medium truncate">{selected.full_name}</span>
          </span>
        ) : (
          <span className="text-ink-faint">Menejer tanlang</span>
        )}
        <CaretDown size={16} className="text-ink-muted shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-surface-raised border border-line rounded-menu overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
            <MagnifyingGlass size={16} className="text-ink-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Qidirish..."
              className="flex-1 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
          <div className="max-h-[220px] overflow-y-auto no-scrollbar">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-ink-muted">Xodim topilmadi</div>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m.id)
                    setOpen(false)
                    setQuery("")
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-mute-ghost-hover transition-colors text-left"
                >
                  <Avatar name={m.full_name} url={m.avatar_url} size={24} />
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-ink truncate">{m.full_name}</span>
                    {m.position && <span className="text-xs text-ink-muted truncate">{m.position}</span>}
                  </span>
                  {m.id === value && <Check size={16} className="text-ink ml-auto" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  if (url) {
    return (
      <img src={url} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    )
  }
  return (
    <span
      className="rounded-full bg-mute-soft text-ink-muted font-bold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  )
}

export function CreateEventDrawer({ isOpen, onClose, onCreated, editEvent }: CreateEventDrawerProps) {
  const isEdit = !!editEvent
  const { data: users = [] } = useUsers()
  const managers = users.filter((u) => u.is_active)
  const titleId = useId()
  const nameId = useId()
  const startDateId = useId()
  const cashbackId = useId()
  const locationId = useId()
  const totalValueId = useId()
  const managerFieldId = useId()

  const [name, setName] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [cashbackPercent, setCashbackPercent] = useState("5")
  const [location, setLocation] = useState("")
  const [totalValue, setTotalValue] = useState("") // digits only
  const [managerId, setManagerId] = useState<string | null>(null)
  const qc = useQueryClient()
  const { data: savedTariffs } = useEventTariffs(editEvent?.id ?? "")
  const [tariffs, setTariffs] = useState<TariffRow[]>([blankTariff()])
  const tariffsLoadedFor = useRef<string | null>(null)

  const panelRef = useDialog<HTMLDivElement>(onClose, isOpen)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (editEvent) {
      setName(editEvent.name)
      setStartDate(toDateInput(editEvent.date))
      setEndDate(toDateInput(editEvent.end_date))
      setCashbackPercent(String(editEvent.cashback_percent ?? 5))
      setLocation(editEvent.location ?? "")
      setTotalValue(editEvent.total_value ? String(Math.round(editEvent.total_value)) : "")
      setManagerId(editEvent.manager_id)
      // Empty until the saved list arrives (effect below): saving is blocked
      // meanwhile, so a half-loaded form can't wipe the event's tariffs.
      tariffsLoadedFor.current = null
      setTariffs([])
    } else {
      setName("")
      setStartDate("")
      setEndDate("")
      setCashbackPercent("5")
      setLocation("")
      setTotalValue("")
      setManagerId(null)
      setTariffs([blankTariff()])
    }
    setError(null)
    setTouched(false)
  }, [editEvent, isOpen])

  // Load saved tariffs once per open — a late fetch or refetch must not clobber
  // what the user has already typed.
  useEffect(() => {
    if (!isOpen || !editEvent || !savedTariffs || tariffsLoadedFor.current === editEvent.id) return
    tariffsLoadedFor.current = editEvent.id
    setTariffs(
      savedTariffs.length > 0
        ? savedTariffs.map((t) => ({ key: t.id, id: t.id, name: t.name, price: String(Math.round(t.price)) }))
        : [blankTariff()],
    )
  }, [isOpen, editEvent, savedTariffs])

  const cbValue = Number(cashbackPercent)
  const cbValid = Number.isFinite(cbValue) && cbValue >= 0 && cbValue <= 100
  const nameValid = name.trim().length > 0
  const startValid = startDate.length > 0
  const managerValid = !!managerId
  const endValid = !endDate || !startDate || endDate >= startDate
  const tariffsValid = tariffs.length > 0 && tariffs.every((t) => t.name.trim() && t.price !== "")

  async function handleSubmit() {
    setTouched(true)
    if (!nameValid || !startValid || !managerValid || !cbValid || !tariffsValid) {
      setError("Yulduzcha (*) bilan belgilangan maydonlarni to'ldiring")
      return
    }
    if (!endValid) {
      setError("Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const cb = Math.round(cbValue * 100) / 100
      const tv = totalValue ? Number(totalValue) : 0
      const fields = {
        name: name.trim(),
        date: startDate,
        end_date: endDate || null,
        location: location.trim() || undefined,
        cashback_percent: cb,
        total_value: tv,
        manager_id: managerId,
      }

      if (isEdit && editEvent) {
        const updates: Parameters<typeof updateEvent>[1] = {
          name: fields.name,
          date: fields.date,
          end_date: fields.end_date,
          location: location.trim() || null,
          cashback_percent: cb,
          total_value: tv,
          manager_id: managerId,
        }
        await updateEvent(editEvent.id, updates)
        await saveEventTariffs(editEvent.id, tariffs.map((t) => ({ id: t.id, name: t.name, price: Number(t.price) })))
      } else {
        const event = await createEvent(fields)
        await saveEventTariffs(event.id, tariffs.map((t) => ({ name: t.name, price: Number(t.price) })))
      }

      qc.invalidateQueries({ queryKey: TARIFFS_KEY })

      toast.success(isEdit ? "Tadbir saqlandi" : "Tadbir yaratildi")
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/30 z-40"
              onClick={onClose}
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              initial={{ x: 460 }}
              animate={{ x: 0 }}
              exit={{ x: 460 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 w-[460px] bg-surface-raised border-l border-line z-50 flex flex-col "
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 pb-4 border-b border-line">
                <h2 id={titleId} className="text-md font-bold text-ink">
                  {isEdit ? "Tadbirni tahrirlash" : "Yangi tadbir"}
                </h2>
                <button onClick={onClose} aria-label="Yopish" className="p-1.5 rounded-item hover:bg-mute-ghost-hover transition-colors">
                  <X size={20} className="text-ink-muted" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                {error && (
                  <div className="px-3 py-2 rounded-surface text-sm font-medium bg-danger-soft text-danger-dark border border-danger-soft">
                    {error}
                  </div>
                )}

                {/* 2. Name */}
                <Field label="Tadbir nomi" required htmlFor={nameId}>
                  <input
                    id={nameId}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Masalan: Biznes Nonushta #5"
                    className={`${INPUT} ${touched && !nameValid ? "border-danger" : ""}`}
                  />
                </Field>

                {/* 3. Date range */}
                <Field label="O'tkazilish sanasi" required htmlFor={startDateId}>
                  <div className="flex items-center gap-2">
                    <input
                      id={startDateId}
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className={`${INPUT} ${touched && !startValid ? "border-danger" : ""}`}
                    />
                    <span className="text-ink-muted text-sm">—</span>
                    <input
                      type="date"
                      aria-label="Tugash sanasi"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={`${INPUT} ${touched && !endValid ? "border-danger" : ""}`}
                    />
                  </div>
                  <span className="text-xs text-ink-muted">
                    {startDate
                      ? endDate
                        ? `${formatDate(startDate)} — ${formatDate(endDate)} (ko'p kunlik)`
                        : `${formatDate(startDate)} (bir kunlik)`
                      : "Tugash sanasi ixtiyoriy"}
                  </span>
                </Field>

                {/* 4. Cashback */}
                <Field label="Umumiy keshbek" required htmlFor={cashbackId}>
                  <div className="relative">
                    <input
                      id={cashbackId}
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={cashbackPercent}
                      onChange={(e) => setCashbackPercent(e.target.value)}
                      className={`${INPUT} pr-9 ${touched && !cbValid ? "border-danger" : ""}`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted pointer-events-none">%</span>
                  </div>
                  <span className="text-xs text-ink-muted">Har bir ishtirokchiga avtomatik keshbek shu foizda hisoblanadi</span>
                </Field>

                {/* 5. Location */}
                <Field label="Tadbir lokatsiyasi" htmlFor={locationId}>
                  <input
                    id={locationId}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Masalan: Toshkent, Hilton Hotel"
                    className={INPUT}
                  />
                </Field>

                {/* 6. Total value */}
                <Field label="Tadbir qiymati" htmlFor={totalValueId}>
                  <div className="relative">
                    <input
                      id={totalValueId}
                      inputMode="numeric"
                      value={totalValue ? formatNumber(Number(totalValue)) : ""}
                      onChange={(e) => setTotalValue(e.target.value.replace(/\D/g, ""))}
                      placeholder="600,000,000"
                      className={`${INPUT} pr-12`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted pointer-events-none">UZS</span>
                  </div>
                </Field>

                {/* 7. Manager */}
                <Field label="Loyiha menejeri" required htmlFor={managerFieldId}>
                  <ManagerSelect
                    id={managerFieldId}
                    value={managerId}
                    onChange={setManagerId}
                    managers={managers}
                    invalid={touched && !managerValid}
                  />
                </Field>

                {/* 8. Tariffs */}
                <Field label="Tariflar" required>
                  <div className="flex flex-col gap-2">
                    {tariffs.map((t, i) => (
                      <div key={t.key} className="flex items-center gap-2">
                        <input
                          aria-label={`${i + 1}-tarif nomi`}
                          value={t.name}
                          onChange={(e) => setTariffs((rows) => rows.map((r) => (r.key === t.key ? { ...r, name: e.target.value } : r)))}
                          placeholder="Standart"
                          className={`${INPUT} flex-1 ${touched && !t.name.trim() ? "border-danger" : ""}`}
                        />
                        <div className="relative w-[170px] shrink-0">
                          <input
                            aria-label={`${i + 1}-tarif narxi`}
                            inputMode="numeric"
                            value={t.price ? formatNumber(Number(t.price)) : ""}
                            onChange={(e) => setTariffs((rows) => rows.map((r) => (r.key === t.key ? { ...r, price: e.target.value.replace(/\D/g, "") } : r)))}
                            placeholder="17,000,000"
                            className={`${INPUT} pr-12 ${touched && t.price === "" ? "border-danger" : ""}`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted pointer-events-none">UZS</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTariffs((rows) => rows.filter((r) => r.key !== t.key))}
                          disabled={tariffs.length === 1}
                          aria-label={`${i + 1}-tarifni o'chirish`}
                          className="shrink-0 size-9 flex items-center justify-center rounded-control text-ink-faint hover:text-danger-text hover:bg-danger-soft transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTariffs((rows) => [...rows, blankTariff()])}
                      className="self-start flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
                    >
                      <Plus size={12} weight="bold" /> Tarif qo'shish
                    </button>
                    <span className="text-xs text-ink-muted">
                      Narx mijoz tadbirga yozilganda unga qo'yiladi. Keyin tarif narxini o'zgartirsangiz, avval yozilganlarga ta'sir qilmaydi.
                    </span>
                  </div>
                </Field>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line">
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2 rounded-control text-base font-medium text-ink-muted hover:text-ink transition-colors"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className={`px-5 py-2 rounded-control text-base font-bold transition-colors ${
                    saving ? "bg-mute-soft text-ink-muted cursor-not-allowed" : "bg-accent text-ink-on-accent hover:bg-accent-hover"
                  }`}
                >
                  {saving ? (isEdit ? "Saqlanmoqda..." : "Yaratilmoqda...") : isEdit ? "Saqlash" : "Yaratish"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </>
  )
}

function Field({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string
  required?: boolean
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={LABEL}>
        {label} {required && <span className="text-danger-text">*</span>}
      </label>
      {children}
    </div>
  )
}
