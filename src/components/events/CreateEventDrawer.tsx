import { useState, useRef, useEffect, useId, useMemo } from "react"
import { toast } from "@/lib/toast"
import { motion, AnimatePresence } from "framer-motion"
import { X, CaretDown, MagnifyingGlass, Check, Plus, Trash, ImageSquare } from "@phosphor-icons/react"
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
import { useMedia } from "@/hooks/useMedia"
import { formatNumber, formatDate } from "@/lib/format"
import { Switch } from "@/components/ui/Switch"
import { usePipelines } from "@/hooks/useSotuv"
import { APP_CATEGORIES, uploadEventCover } from "@/lib/supabase/queries/fyApp"
import { FY_PUSH_KEY } from "@/components/events/FyApp"

interface CreateEventDrawerProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
  editEvent?: Event | null
  /** Opened from the Ilova page to put the event in the app: the switch starts on */
  forApp?: boolean
}

const LABEL = "text-sm font-medium text-ink-muted"
const INPUT =
  "w-full border border-line rounded-control px-3 py-2 max-sm:h-12 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors max-sm:bg-surface-sunken max-sm:border-transparent max-sm:focus:border-line-focus"

interface TariffRow {
  key: string
  id?: string
  name: string
  price: string // digits only
}

/** The voronka select's "no leads" choice; "" = untouched, so the voronka linked to the event is offered */
const NO_PIPELINE = "none"

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
        className={`w-full flex items-center justify-between gap-2 border rounded-control px-3 py-2 max-sm:h-12 text-base transition-colors ${
          invalid ? "border-danger" : "border-line focus:border-line-focus max-sm:bg-surface-sunken max-sm:border-transparent max-sm:focus:border-line-focus"
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

export function CreateEventDrawer({ isOpen, onClose, onCreated, editEvent, forApp = false }: CreateEventDrawerProps) {
  const isEdit = !!editEvent
  const { data: users = [] } = useUsers()
  const managers = users.filter((u) => u.is_active)
  const titleId = useId()
  const nameId = useId()
  const startDateId = useId()
  const cashbackId = useId()
  const locationId = useId()
  const totalValueId = useId()
  const seatsPlanId = useId()
  const managerFieldId = useId()
  const startTimeId = useId()
  const aboutId = useId()
  const categoryId = useId()
  const capacityId = useId()
  const pipelineFieldId = useId()

  const [name, setName] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [cashbackPercent, setCashbackPercent] = useState("5")
  const [location, setLocation] = useState("")
  const [totalValue, setTotalValue] = useState("") // digits only
  const [seatsPlan, setSeatsPlan] = useState("") // digits only
  const [managerId, setManagerId] = useState<string | null>(null)
  const [startTime, setStartTime] = useState("") // "HH:MM"
  // 105: the FY members' app
  const [showInApp, setShowInApp] = useState(false)
  const [about, setAbout] = useState("")
  const [category, setCategory] = useState("")
  const [capacity, setCapacity] = useState("") // digits only
  const [pipelineId, setPipelineId] = useState("")
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const { data: pipelines = [] } = usePipelines()
  const qc = useQueryClient()
  const { data: savedTariffs } = useEventTariffs(editEvent?.id ?? "")
  const [tariffs, setTariffs] = useState<TariffRow[]>([blankTariff()])
  const tariffsLoadedFor = useRef<string | null>(null)

  const panelRef = useDialog<HTMLDivElement>(onClose, isOpen)
  const phone = useMedia("(width < 40rem)")

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
      setSeatsPlan(editEvent.seats_plan ? String(editEvent.seats_plan) : "")
      setManagerId(editEvent.manager_id)
      setStartTime(editEvent.start_time?.slice(0, 5) ?? "")
      setShowInApp(editEvent.show_in_app || forApp)
      setAbout(editEvent.description ?? "")
      setCategory(editEvent.app_category ?? "")
      setCapacity(editEvent.app_capacity ? String(editEvent.app_capacity) : "")
      // Already set up for the app: keep its choice, "no voronka" included
      setPipelineId(editEvent.app_pipeline_id ?? (editEvent.show_in_app ? NO_PIPELINE : ""))
      setCoverUrl(editEvent.cover_image)
      setCoverFile(null)
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
      setSeatsPlan("")
      setManagerId(null)
      setStartTime("")
      setShowInApp(false)
      setAbout("")
      setCategory("")
      setCapacity("")
      setPipelineId("")
      setCoverUrl(null)
      setCoverFile(null)
      setTariffs([blankTariff()])
    }
    setError(null)
    setTouched(false)
  }, [editEvent, isOpen, forApp])

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
  // The app shows the start hour, so a shown event needs one
  const timeValid = !showInApp || startTime.length > 0
  // A voronka linked to this event (Voronka sozlamalari → Tadbir) is the natural default
  const linkedPipeline = editEvent ? pipelines.find((p) => p.event_id === editEvent.id)?.id ?? "" : ""
  const pipelineChoice = pipelineId || linkedPipeline || NO_PIPELINE
  const coverPreview = useMemo(() => (coverFile ? URL.createObjectURL(coverFile) : coverUrl), [coverFile, coverUrl])
  useEffect(() => () => { if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview) }, [coverPreview])

  async function handleSubmit() {
    setTouched(true)
    if (!nameValid || !startValid || !managerValid || !cbValid || !tariffsValid || !timeValid) {
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
      const sp = Number(seatsPlan) || null
      const app = {
        start_time: startTime || null,
        show_in_app: showInApp,
        app_category: category || null,
        app_capacity: Number(capacity) || null,
        app_pipeline_id: pipelineChoice === NO_PIPELINE ? null : pipelineChoice,
      }
      const fields = {
        name: name.trim(),
        description: about.trim() || undefined,
        date: startDate,
        end_date: endDate || null,
        location: location.trim() || undefined,
        cashback_percent: cb,
        total_value: tv,
        seats_plan: sp,
        manager_id: managerId,
        ...app,
      }

      let eventId: string
      if (isEdit && editEvent) {
        eventId = editEvent.id
        const updates: Parameters<typeof updateEvent>[1] = {
          name: fields.name,
          description: about.trim() || null,
          date: fields.date,
          end_date: fields.end_date,
          location: location.trim() || null,
          cashback_percent: cb,
          total_value: tv,
          seats_plan: sp,
          manager_id: managerId,
          ...app,
          ...(coverUrl === null && editEvent.cover_image ? { cover_image: null } : {}),
        }
        await updateEvent(editEvent.id, updates)
        await saveEventTariffs(editEvent.id, tariffs.map((t) => ({ id: t.id, name: t.name, price: Number(t.price) })))
      } else {
        const event = await createEvent(fields)
        eventId = event.id
        await saveEventTariffs(event.id, tariffs.map((t) => ({ name: t.name, price: Number(t.price) })))
      }
      // The event is saved either way; a failed upload only leaves the old cover
      if (coverFile) {
        try {
          await updateEvent(eventId, { cover_image: await uploadEventCover(eventId, coverFile) })
        } catch (err) {
          toast.error("Rasm yuklanmadi", err instanceof Error ? err.message : undefined)
        }
      }

      qc.invalidateQueries({ queryKey: TARIFFS_KEY })
      qc.invalidateQueries({ queryKey: FY_PUSH_KEY })

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
              {...(phone
                ? { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" }, transition: { duration: 0.22, ease: [0.2, 0, 0, 1] as const } }
                : { initial: { x: 460 }, animate: { x: 0 }, exit: { x: 460 }, transition: { type: "spring" as const, damping: 30, stiffness: 300 } })}
              className="fixed top-0 right-0 bottom-0 w-full max-w-[460px] max-sm:top-3 max-sm:max-w-none max-sm:rounded-t-[20px] bg-surface-raised border-l max-sm:border-l-0 border-line z-50 flex flex-col "
            >
              <div className="sm:hidden mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-mute-soft" />
              {/* Header */}
              <div className="flex items-center justify-between p-5 pb-4 max-sm:px-4 max-sm:pt-2 max-sm:pb-3 sm:border-b border-line">
                <h2 id={titleId} className="text-md max-sm:text-lg font-bold text-ink">
                  {isEdit ? "Tadbirni tahrirlash" : "Yangi tadbir"}
                </h2>
                <button onClick={onClose} aria-label="Yopish" className="p-2 -m-0.5 max-sm:size-10 max-sm:m-0 max-sm:-mr-2 max-sm:flex max-sm:items-center max-sm:justify-center sm:p-1.5 sm:m-0 rounded-item max-sm:rounded-full hover:bg-mute-ghost-hover transition-colors">
                  <X size={20} className="text-ink-muted" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto overscroll-contain p-5 max-sm:px-4 flex flex-col gap-4">
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
                      className={`${INPUT} min-w-0 ${touched && !startValid ? "border-danger" : ""}`}
                    />
                    <span className="text-ink-muted text-sm">—</span>
                    <input
                      type="date"
                      aria-label="Tugash sanasi"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={`${INPUT} min-w-0 ${touched && !endValid ? "border-danger" : ""}`}
                    />
                  </div>
                  <span className="text-xs max-sm:text-sm text-ink-muted">
                    {startDate
                      ? endDate
                        ? `${formatDate(startDate)} — ${formatDate(endDate)} (ko'p kunlik)`
                        : `${formatDate(startDate)} (bir kunlik)`
                      : "Tugash sanasi ixtiyoriy"}
                  </span>
                </Field>

                <Field label="Boshlanish vaqti" required={showInApp} htmlFor={startTimeId}>
                  <input
                    id={startTimeId}
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={`${INPUT} ${touched && !timeValid ? "border-danger" : ""}`}
                  />
                  {showInApp && <span className="text-xs text-ink-muted max-sm:hidden">Ilovada shu vaqt ko'rsatiladi (Toshkent vaqti)</span>}
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
                  <span className="text-xs text-ink-muted max-sm:hidden">Har bir ishtirokchiga avtomatik keshbek shu foizda hisoblanadi</span>
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

                <Field label="Joylar plani" htmlFor={seatsPlanId}>
                  <input
                    id={seatsPlanId}
                    inputMode="numeric"
                    value={seatsPlan}
                    onChange={(e) => setSeatsPlan(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    placeholder="Masalan: 60"
                    className={INPUT}
                  />
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
                      <div key={t.key} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                        <input
                          aria-label={`${i + 1}-tarif nomi`}
                          value={t.name}
                          onChange={(e) => setTariffs((rows) => rows.map((r) => (r.key === t.key ? { ...r, name: e.target.value } : r)))}
                          placeholder="Standart"
                          className={`${INPUT} basis-full sm:basis-0 sm:flex-1 ${touched && !t.name.trim() ? "border-danger" : ""}`}
                        />
                        <div className="relative flex-1 min-w-0 sm:flex-none sm:w-[170px] sm:shrink-0">
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
                          className="shrink-0 size-9 max-sm:size-11 flex items-center justify-center rounded-full text-ink-faint hover:text-danger-text hover:bg-danger-soft transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTariffs((rows) => [...rows, blankTariff()])}
                      className="self-start flex items-center gap-1.5 text-sm max-sm:h-10 font-medium text-ink-muted hover:text-ink transition-colors"
                    >
                      <Plus size={12} weight="bold" /> Tarif qo'shish
                    </button>
                    <span className="text-xs text-ink-muted max-sm:hidden">
                      Narx mijoz tadbirga yozilganda unga qo'yiladi. Keyin tarif narxini o'zgartirsangiz, avval yozilganlarga ta'sir qilmaydi.
                    </span>
                  </div>
                </Field>

                {/* 9. The FY members' app (105) */}
                <div className="flex flex-col gap-4 pt-4 border-t border-line">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-base font-medium text-ink">Ilovada ko'rsatish</span>
                      <span className="text-xs max-sm:text-sm text-ink-muted">
                        FY ilovasida chiqadi. Narx — eng arzon tarif, 0 so'm = bepul. Pullik arizalar tanlangan voronkaga lid bo'lib tushadi.
                      </span>
                    </div>
                    <Switch on={showInApp} label="Ilovada ko'rsatish" onChange={setShowInApp} />
                  </div>

                  {showInApp && (
                    <>
                      <Field label="Rasm">
                        <div className="flex items-center gap-3">
                          <div className="size-20 shrink-0 rounded-control bg-surface-sunken overflow-hidden flex items-center justify-center text-ink-faint">
                            {coverPreview ? <img src={coverPreview} alt="" className="w-full h-full object-cover" /> : <ImageSquare size={28} weight="light" />}
                          </div>
                          <div className="flex flex-col items-start gap-1.5">
                            <label className="px-3 h-control-sm inline-flex items-center rounded-full bg-mute-soft hover:bg-mute-soft-hover text-sm font-medium text-ink cursor-pointer transition-colors">
                              {coverPreview ? "Almashtirish" : "Rasm tanlash"}
                              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) setCoverFile(f); e.target.value = "" }} />
                            </label>
                            {coverPreview && (
                              <button type="button" onClick={() => { setCoverFile(null); setCoverUrl(null) }} className="text-sm text-ink-muted hover:text-danger-text">
                                Olib tashlash
                              </button>
                            )}
                          </div>
                        </div>
                      </Field>

                      <Field label="Tavsif" htmlFor={aboutId}>
                        <textarea
                          id={aboutId}
                          value={about}
                          onChange={(e) => setAbout(e.target.value)}
                          rows={4}
                          placeholder="Tadbir nima haqida, kimlar uchun, dastur"
                          className={`${INPUT} max-sm:h-auto resize-y`}
                        />
                      </Field>

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Kategoriya" htmlFor={categoryId}>
                          <select id={categoryId} value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT}>
                            <option value="">Tanlanmagan</option>
                            {APP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </Field>
                        <Field label="Sig'im" htmlFor={capacityId}>
                          <input
                            id={capacityId}
                            inputMode="numeric"
                            value={capacity}
                            onChange={(e) => setCapacity(e.target.value.replace(/\D/g, "").slice(0, 5))}
                            placeholder="Cheksiz"
                            className={INPUT}
                          />
                        </Field>
                      </div>

                      <Field label="Arizalar voronkasi" htmlFor={pipelineFieldId}>
                        <select id={pipelineFieldId} value={pipelineChoice} onChange={(e) => setPipelineId(e.target.value)} className={INPUT}>
                          <option value={NO_PIPELINE}>Lid yuborilmasin</option>
                          {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </Field>
                    </>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-4 max-sm:p-4 max-sm:pb-[calc(16px+env(safe-area-inset-bottom))] border-t border-line">
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2 max-sm:h-12 max-sm:bg-mute-soft max-sm:text-ink rounded-full text-base font-medium text-ink-muted hover:text-ink transition-colors"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className={`px-5 py-2 max-sm:h-12 max-sm:flex-1 rounded-full text-base font-bold transition-colors ${
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
