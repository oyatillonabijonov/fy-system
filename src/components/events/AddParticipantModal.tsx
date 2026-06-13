import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, MagnifyingGlass, Check } from "@phosphor-icons/react"
import {
  searchContacts,
  addExistingContactToEvent,
  type ClientContact,
} from "@/lib/supabase/queries/events"

interface AddParticipantModalProps {
  isOpen: boolean
  eventId: string
  existingContactIds?: Set<string>
  onClose: () => void
  onAdded: () => void
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function ClientRow({
  client,
  disabled,
  onSelect,
}: {
  client: ClientContact
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`w-full flex items-center gap-3 p-2.5 rounded-[8px] transition-colors text-left ${
        disabled
          ? "opacity-50 cursor-not-allowed bg-[#F9F9F8]"
          : "hover:bg-[#F9F9F8]"
      }`}
    >
      {client.image ? (
        <img
          src={client.image}
          alt={client.full_name}
          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-[#F5F5F5] flex items-center justify-center text-[12px] font-bold text-[#999] flex-shrink-0">
          {getInitials(client.full_name)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-[#141414] truncate">
          {client.full_name}
        </p>
        <p className="text-[11px] text-[#999] truncate">
          {client.activity || client.company || ""}
        </p>
      </div>
      {disabled ? (
        <span className="text-[11px] font-bold text-green-600 flex-shrink-0 flex items-center gap-1">
          <Check size={12} weight="bold" /> qo'shilgan
        </span>
      ) : (
        client.phone && (
          <span className="text-[11px] text-[#CCCCCC] flex-shrink-0">
            {client.phone}
          </span>
        )
      )}
    </button>
  )
}

export function AddParticipantModal({
  isOpen,
  eventId,
  existingContactIds,
  onClose,
  onAdded,
}: AddParticipantModalProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ClientContact[]>([])
  const [queue, setQueue] = useState<ClientContact[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Set of all IDs that should NOT be re-addable: already in event + currently queued
  const blockedIds = useMemo(() => {
    const s = new Set<string>(existingContactIds ?? [])
    for (const c of queue) s.add(c.id)
    return s
  }, [existingContactIds, queue])

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await searchContacts("")
      setResults(data)
    } catch {
      setResults([])
    }
  }, [])

  // Reset state when modal opens / closes
  useEffect(() => {
    if (isOpen) {
      setQueue([])
      setQuery("")
      setError(null)
      loadSuggestions()
    }
  }, [isOpen, loadSuggestions])

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)

    if (!query.trim()) {
      loadSuggestions()
      return
    }

    searchTimeout.current = setTimeout(async () => {
      try {
        const data = await searchContacts(query)
        setResults(data)
      } catch {
        setResults([])
      }
    }, 200)

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
    }
  }, [query, loadSuggestions])

  function handleClose() {
    if (saving) return
    setQuery("")
    setResults([])
    setQueue([])
    setError(null)
    onClose()
  }

  function addToQueue(client: ClientContact) {
    if (blockedIds.has(client.id)) return
    setQueue((prev) => [...prev, client])
    setQuery("")
    setError(null)
    // Refocus input for the next search
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  function removeFromQueue(id: string) {
    setQueue((prev) => prev.filter((c) => c.id !== id))
  }

  async function handleSaveAll() {
    if (queue.length === 0) return
    setSaving(true)
    setError(null)

    const settled = await Promise.allSettled(
      queue.map((c) => addExistingContactToEvent(eventId, c)),
    )

    const failedItems: { client: ClientContact; reason: string }[] = []
    let succeeded = 0
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") succeeded++
      else failedItems.push({
        client: queue[i],
        reason: r.reason instanceof Error ? r.reason.message : "Xatolik",
      })
    })

    if (succeeded > 0) {
      onAdded()
      setToast(`${succeeded} ta ishtirokchi qo'shildi`)
      setTimeout(() => setToast(null), 3000)
    }

    if (failedItems.length === 0) {
      setSaving(false)
      handleClose()
      return
    }

    // Keep only failed entries in the queue so the user can retry / remove them
    setQueue(failedItems.map((f) => f.client))
    setError(
      failedItems.length === 1
        ? `Xatolik: ${failedItems[0].client.full_name} — ${failedItems[0].reason}`
        : `${failedItems.length} ta ishtirokchi saqlanmadi (oxirgi: ${failedItems[failedItems.length - 1].client.full_name})`,
    )
    setSaving(false)
  }

  const inputClass =
    "w-full px-4 py-2 bg-[#F5F5F5] border-transparent rounded-[8px] text-[13px] outline-hidden focus:bg-white focus:ring-1 focus:ring-[#141414]/10"

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
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
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-[16px] font-bold text-[#141414]">
                    Ishtirokchilar qo'shish
                  </h3>
                  <p className="text-[11px] text-[#999]">
                    Bir nechta mijozni tanlab birga saqlang
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  disabled={saving}
                  className="p-1 hover:bg-[#F5F5F5] rounded-full transition-all disabled:opacity-50"
                >
                  <X size={20} className="text-[#999999]" weight="bold" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 flex flex-col gap-4 overflow-y-auto">
                {error && (
                  <div className="px-4 py-2.5 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                    {error}
                  </div>
                )}

                {/* Search input */}
                <div className="relative">
                  <MagnifyingGlass
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#999]"
                    weight="bold"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setError(null)
                    }}
                    placeholder="Mijoz ismini yoki telefonini kiriting..."
                    autoFocus
                    disabled={saving}
                    className={`${inputClass} pl-10`}
                  />
                </div>

                {/* Results */}
                {results.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] text-[#999999] mb-1 px-1">
                      {query.trim()
                        ? `"${query}" bo'yicha natijalar`
                        : "Oxirgi mijozlar"}
                    </p>
                    <div className="max-h-[240px] overflow-y-auto">
                      {results.map((c) => (
                        <ClientRow
                          key={c.id}
                          client={c}
                          disabled={blockedIds.has(c.id) || saving}
                          onSelect={() => addToQueue(c)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {query.trim() && results.length === 0 && (
                  <p className="text-[13px] text-[#999] text-center py-4">
                    Mijoz topilmadi
                  </p>
                )}

                {/* Queue */}
                {queue.length > 0 && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-[#F0F0F0]">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[11px] font-bold text-[#666] uppercase tracking-wider">
                        Qo'shiladiganlar · {queue.length} ta
                      </p>
                      <button
                        onClick={() => setQueue([])}
                        disabled={saving}
                        className="text-[11px] text-[#999] hover:text-[#666] transition-colors disabled:opacity-50"
                      >
                        Tozalash
                      </button>
                    </div>
                    <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto">
                      {queue.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center gap-2.5 p-2 bg-green-50 border border-green-100 rounded-[8px]"
                        >
                          {c.image ? (
                            <img
                              src={c.image}
                              alt={c.full_name}
                              className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-[#666] flex-shrink-0">
                              {getInitials(c.full_name)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-[#141414] truncate">
                              {c.full_name}
                            </p>
                            {c.phone && (
                              <p className="text-[10px] text-[#666] truncate">{c.phone}</p>
                            )}
                          </div>
                          <button
                            onClick={() => removeFromQueue(c.id)}
                            disabled={saving}
                            className="p-1 hover:bg-white rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
                            title="Olib tashlash"
                          >
                            <X size={12} className="text-[#666]" weight="bold" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-5 pt-0 flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[8px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all disabled:opacity-50"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={handleSaveAll}
                  disabled={saving || queue.length === 0}
                  className={`flex-1 px-4 py-2.5 rounded-[8px] text-[13px] font-bold transition-all flex items-center justify-center gap-2 ${
                    saving || queue.length === 0
                      ? "bg-[#E0E0E0] text-[#999] cursor-not-allowed"
                      : "bg-[#141414] text-white hover:bg-black shadow-md active:scale-95"
                  }`}
                >
                  {saving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saqlanmoqda...
                    </>
                  ) : queue.length === 0 ? (
                    "Saqlash"
                  ) : (
                    `Saqlash (${queue.length} ta)`
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 bg-[#141414] text-white text-[13px] font-bold rounded-[8px] shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
