import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, UploadSimple, CaretDown, MagnifyingGlass, Check, Image as ImageIcon } from "@phosphor-icons/react"
import {
  createEvent,
  updateEvent,
  uploadEventCover,
  type Event,
} from "@/lib/supabase/queries/events"
import { useUsers } from "@/hooks/useUsers"
import type { UserProfile } from "@/lib/supabase/queries/auth"
import { ImageCropModal } from "@/components/ui/ImageCropModal"
import { EventBanner } from "@/components/events/EventBanner"
import { formatNumber, formatDate } from "@/lib/format"

interface CreateEventDrawerProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
  editEvent?: Event | null
}

const LABEL = "text-[12px] font-medium text-[#999999]"
const INPUT =
  "w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
}

function toDateInput(value: string | null): string {
  if (!value) return ""
  return value.slice(0, 10)
}

// ─── Manager combobox ──────────────────────────────────────────────────────────
function ManagerSelect({
  value,
  onChange,
  managers,
  invalid,
}: {
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
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 border rounded-[8px] px-3 py-2 text-[13px] transition-colors ${
          invalid ? "border-[#D13328]" : "border-[#E0E0E0] focus:border-[#141414]"
        }`}
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <Avatar name={selected.full_name} url={selected.avatar_url} size={20} />
            <span className="text-[#141414] font-medium truncate">{selected.full_name}</span>
          </span>
        ) : (
          <span className="text-[#CCCCCC]">Menejer tanlang</span>
        )}
        <CaretDown size={14} className="text-[#999] shrink-0" weight="bold" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-[#F0F0F0] rounded-[8px] shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#F0F0F0]">
            <MagnifyingGlass size={14} className="text-[#999]" weight="bold" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Qidirish..."
              className="flex-1 text-[12px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none"
            />
          </div>
          <div className="max-h-[220px] overflow-y-auto no-scrollbar">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-[#999]">Xodim topilmadi</div>
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
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#F5F5F5] transition-colors text-left"
                >
                  <Avatar name={m.full_name} url={m.avatar_url} size={24} />
                  <span className="flex flex-col min-w-0">
                    <span className="text-[12px] font-medium text-[#141414] truncate">{m.full_name}</span>
                    {m.position && <span className="text-[10px] text-[#999] truncate">{m.position}</span>}
                  </span>
                  {m.id === value && <Check size={14} className="text-[#141414] ml-auto" weight="bold" />}
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
      className="rounded-full bg-[#EBEBEB] text-[#666] font-bold flex items-center justify-center shrink-0"
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

  const [name, setName] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [cashbackPercent, setCashbackPercent] = useState("5")
  const [location, setLocation] = useState("")
  const [totalValue, setTotalValue] = useState("") // digits only
  const [managerId, setManagerId] = useState<string | null>(null)
  const [hasTariffs, setHasTariffs] = useState(false)

  const [bannerBlob, setBannerBlob] = useState<Blob | null>(null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      setHasTariffs(editEvent.has_tariffs)
      setBannerPreview(editEvent.cover_image ?? null)
    } else {
      setName("")
      setStartDate("")
      setEndDate("")
      setCashbackPercent("5")
      setLocation("")
      setTotalValue("")
      setManagerId(null)
      setHasTariffs(false)
      setBannerPreview(null)
    }
    setBannerBlob(null)
    setError(null)
    setTouched(false)
  }, [editEvent, isOpen])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !cropSrc) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose, cropSrc])

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError("Rasm hajmi 5MB dan oshmasligi kerak")
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => setCropSrc(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  function handleCropped(blob: Blob) {
    setBannerBlob(blob)
    setBannerPreview(URL.createObjectURL(blob))
    setCropSrc(null)
  }

  const cbValue = Number(cashbackPercent)
  const cbValid = Number.isFinite(cbValue) && cbValue >= 0 && cbValue <= 100
  const nameValid = name.trim().length > 0
  const startValid = startDate.length > 0
  const managerValid = !!managerId
  const endValid = !endDate || !startDate || endDate >= startDate

  async function handleSubmit() {
    setTouched(true)
    if (!nameValid || !startValid || !managerValid || !cbValid) {
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
        has_tariffs: hasTariffs,
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
          has_tariffs: hasTariffs,
        }
        if (bannerBlob) {
          updates.cover_image = await uploadEventCover(blobToFile(bannerBlob), editEvent.id)
        }
        await updateEvent(editEvent.id, updates)
      } else {
        const event = await createEvent(fields)
        if (bannerBlob) {
          const url = await uploadEventCover(blobToFile(bannerBlob), event.id)
          await updateEvent(event.id, { cover_image: url })
        }
      }

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
              initial={{ x: 460 }}
              animate={{ x: 0 }}
              exit={{ x: 460 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 w-[460px] bg-white border-l border-[#F0F0F0] z-50 flex flex-col shadow-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 pb-4 border-b border-[#F0F0F0]">
                <h2 className="text-[16px] font-bold text-[#141414]">
                  {isEdit ? "Tadbirni tahrirlash" : "Yangi tadbir"}
                </h2>
                <button onClick={onClose} className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors">
                  <X size={20} className="text-[#999999]" weight="bold" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                {error && (
                  <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                    {error}
                  </div>
                )}

                {/* 1. Banner */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative h-[140px] rounded-[8px] overflow-hidden cursor-pointer border border-[#E0E0E0] group"
                >
                  {bannerPreview ? (
                    <img src={bannerPreview} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <EventBanner name={name} coverImage={null} className="absolute inset-0" />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white/90 text-[12px] font-bold text-[#141414] opacity-0 group-hover:opacity-100 transition-opacity">
                      {bannerPreview ? <ImageIcon size={14} weight="bold" /> : <UploadSimple size={14} weight="bold" />}
                      {bannerPreview ? "Rasmni o'zgartirish" : "Banner yuklash"}
                    </span>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickFile} />
                {!bannerPreview && (
                  <span className="text-[11px] text-[#999] -mt-2">
                    Rasm yuklamasangiz, tadbir nomidan avtomatik banner yaratiladi
                  </span>
                )}

                {/* 2. Name */}
                <Field label="Tadbir nomi" required>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Masalan: Biznes Nonushta #5"
                    className={`${INPUT} ${touched && !nameValid ? "border-[#D13328]" : ""}`}
                  />
                </Field>

                {/* 3. Date range */}
                <Field label="O'tkazilish sanasi" required>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className={`${INPUT} ${touched && !startValid ? "border-[#D13328]" : ""}`}
                    />
                    <span className="text-[#999] text-[12px]">—</span>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={`${INPUT} ${touched && !endValid ? "border-[#D13328]" : ""}`}
                    />
                  </div>
                  <span className="text-[11px] text-[#999]">
                    {startDate
                      ? endDate
                        ? `${formatDate(startDate)} — ${formatDate(endDate)} (ko'p kunlik)`
                        : `${formatDate(startDate)} (bir kunlik)`
                      : "Tugash sanasi ixtiyoriy"}
                  </span>
                </Field>

                {/* 4. Cashback */}
                <Field label="Umumiy keshbek" required>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={cashbackPercent}
                      onChange={(e) => setCashbackPercent(e.target.value)}
                      className={`${INPUT} pr-9 ${touched && !cbValid ? "border-[#D13328]" : ""}`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#999] pointer-events-none">%</span>
                  </div>
                  <span className="text-[11px] text-[#999]">Har bir ishtirokchiga avtomatik keshbek shu foizda hisoblanadi</span>
                </Field>

                {/* 5. Location */}
                <Field label="Tadbir lokatsiyasi">
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Masalan: Toshkent, Hilton Hotel"
                    className={INPUT}
                  />
                </Field>

                {/* 6. Total value */}
                <Field label="Tadbir qiymati">
                  <div className="relative">
                    <input
                      inputMode="numeric"
                      value={totalValue ? formatNumber(Number(totalValue)) : ""}
                      onChange={(e) => setTotalValue(e.target.value.replace(/\D/g, ""))}
                      placeholder="600,000,000"
                      className={`${INPUT} pr-12`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#999] pointer-events-none">UZS</span>
                  </div>
                </Field>

                {/* 7. Manager */}
                <Field label="Loyiha menejeri" required>
                  <ManagerSelect
                    value={managerId}
                    onChange={setManagerId}
                    managers={managers}
                    invalid={touched && !managerValid}
                  />
                </Field>

                {/* 8. Tariffs */}
                <button
                  type="button"
                  onClick={() => setHasTariffs((v) => !v)}
                  className="flex items-center gap-2.5 text-left"
                >
                  <span
                    className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition-colors ${
                      hasTariffs ? "bg-[#141414] border-[#141414]" : "border-[#D0D0D0]"
                    }`}
                  >
                    {hasTariffs && <Check size={12} className="text-white" weight="bold" />}
                  </span>
                  <span className="text-[13px] text-[#141414]">Tadbir uchun tariflar mavjudmi?</span>
                </button>
                {hasTariffs && (
                  <span className="text-[11px] text-[#999] -mt-2">
                    Tariflar (Presale / Gold / Platinum) ishtirokchi qo'shilganda belgilanadi — narx baribir har kim uchun alohida.
                  </span>
                )}
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
                    saving ? "bg-[#CCCCCC] cursor-not-allowed" : "bg-[#141414] hover:bg-[#333333]"
                  }`}
                >
                  {saving ? (isEdit ? "Saqlanmoqda..." : "Yaratilmoqda...") : isEdit ? "Saqlash" : "Yaratish"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ImageCropModal
        isOpen={!!cropSrc}
        imageSrc={cropSrc ?? ""}
        onClose={() => setCropSrc(null)}
        onCropped={handleCropped}
        aspect={16 / 9}
        circular={false}
        outputWidth={1280}
        outputHeight={720}
      />
    </>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={LABEL}>
        {label} {required && <span className="text-[#D13328]">*</span>}
      </label>
      {children}
    </div>
  )
}

function blobToFile(blob: Blob): File {
  return new File([blob], "cover.jpg", { type: "image/jpeg" })
}
