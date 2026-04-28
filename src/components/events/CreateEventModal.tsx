import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { XMarkIcon, ArrowUpTrayIcon } from "@heroicons/react/24/solid"
import {
  createEvent,
  updateEvent,
  uploadEventCover,
  type Event,
} from "@/lib/supabase/queries/events"

interface CreateEventModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
  editEvent?: Event | null
}

export function CreateEventModal({
  isOpen,
  onClose,
  onCreated,
  editEvent,
}: CreateEventModalProps) {
  const [name, setName] = useState("")
  const [date, setDate] = useState("")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEdit = !!editEvent

  // Populate form when editing; reset to blank when opened in create mode
  useEffect(() => {
    if (!isOpen) return
    if (editEvent) {
      setName(editEvent.name)
      setDate(editEvent.date ?? "")
      setLocation(editEvent.location ?? "")
      setDescription(editEvent.description ?? "")
      setPreview(editEvent.cover_image ?? null)
    } else {
      setName("")
      setDate("")
      setLocation("")
      setDescription("")
      setPreview(null)
    }
    setCoverFile(null)
    setError(null)
  }, [editEvent, isOpen])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setError("Rasm hajmi 5MB dan oshmasligi kerak")
      return
    }

    setCoverFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)

    try {
      if (isEdit) {
        // Snapshot the current edit target so a parent prop change mid-submit can't crash us.
        const target = editEvent
        if (!target) return

        const updates: Parameters<typeof updateEvent>[1] = {
          name: name.trim(),
          date: date || null,
          location: location.trim() || null,
          description: description.trim() || null,
        }

        if (coverFile) {
          const coverUrl = await uploadEventCover(coverFile, target.id)
          updates.cover_image = coverUrl
        }

        await updateEvent(target.id, updates)
      } else {
        // Create new event
        const event = await createEvent({
          name: name.trim(),
          date: date || undefined,
          location: location.trim() || undefined,
          description: description.trim() || undefined,
        })

        // Upload cover if selected
        if (coverFile) {
          const coverUrl = await uploadEventCover(coverFile, event.id)
          await updateEvent(event.id, { cover_image: coverUrl })
        }
      }

      onCreated()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    setName("")
    setDate("")
    setLocation("")
    setDescription("")
    setCoverFile(null)
    setPreview(null)
    setError(null)
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div
              className="bg-white rounded-[12px] w-full max-w-md shadow-2xl pointer-events-auto max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 pb-4 border-b border-[#F0F0F0]">
                <h2 className="text-[16px] font-bold text-[#141414]">
                  {isEdit ? "Tadbirni tahrirlash" : "Yangi tadbir yaratish"}
                </h2>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors"
                >
                  <XMarkIcon className="w-5 h-5 text-[#999999]" />
                </button>
              </div>

              {/* Form */}
              <div className="p-5 flex flex-col gap-4">
                {error && (
                  <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">
                    Tadbir nomi *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Masalan: Biznes Nonushta #5"
                    autoFocus
                    className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">
                    Sana
                  </label>
                  <input
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">
                    Joyi
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Masalan: Toshkent, Hilton Hotel"
                    className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">
                    Tavsif
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tadbir haqida qisqacha..."
                    rows={3}
                    className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors resize-none"
                  />
                </div>

                {/* Cover image upload */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">
                    Muqova rasmi
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-[#E0E0E0] rounded-[8px] p-6 cursor-pointer hover:bg-[#F9F9F8] transition-colors"
                  >
                    {preview ? (
                      <img
                        src={preview}
                        alt="Muqova"
                        className="w-full h-32 object-cover rounded-[8px]"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-[#999]">
                        <ArrowUpTrayIcon className="w-6 h-6" />
                        <span className="text-[13px]">
                          Rasm yuklash uchun bosing
                        </span>
                        <span className="text-[11px] text-[#CCC]">
                          JPG, PNG — max 5MB
                        </span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F0F0F0]">
                <button
                  onClick={handleClose}
                  disabled={saving}
                  className="px-4 py-2 rounded-[8px] text-[13px] font-medium text-[#999] hover:text-[#666] transition-colors"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || !name.trim()}
                  className={`px-5 py-2 rounded-[8px] text-[13px] font-bold text-white transition-colors ${
                    saving || !name.trim()
                      ? "bg-[#CCCCCC] cursor-not-allowed"
                      : "bg-[#141414] hover:bg-[#333333]"
                  }`}
                >
                  {saving
                    ? isEdit
                      ? "Saqlanmoqda..."
                      : "Yaratilmoqda..."
                    : isEdit
                      ? "Saqlash"
                      : "Yaratish"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
