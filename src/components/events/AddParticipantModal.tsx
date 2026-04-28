import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { XMarkIcon, MagnifyingGlassIcon } from "@heroicons/react/24/solid"
import {
  searchContacts,
  addExistingContactToEvent,
  type ClientContact,
} from "@/lib/supabase/queries/events"

interface AddParticipantModalProps {
  isOpen: boolean
  eventId: string
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
  onSelect,
}: {
  client: ClientContact
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-[#F9F9F8] transition-colors text-left"
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
      {client.phone && (
        <span className="text-[11px] text-[#CCCCCC] flex-shrink-0">
          {client.phone}
        </span>
      )}
    </button>
  )
}

export function AddParticipantModal({
  isOpen,
  eventId,
  onClose,
  onAdded,
}: AddParticipantModalProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ClientContact[]>([])
  const [selected, setSelected] = useState<ClientContact | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await searchContacts("")
      setResults(data)
    } catch {
      setResults([])
    }
  }, [])

  // Load suggestions on modal open
  useEffect(() => {
    if (isOpen) {
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
    setQuery("")
    setResults([])
    setSelected(null)
    setError(null)
    onClose()
  }

  async function handleAdd() {
    if (!selected) return
    setAdding(true)
    setError(null)

    try {
      await addExistingContactToEvent(eventId, selected)
      onAdded()
      handleClose()
      setToast("Ishtirokchi qo'shildi")
      setTimeout(() => setToast(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    } finally {
      setAdding(false)
    }
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
              className="bg-white rounded-[12px] shadow-2xl w-full max-w-md relative overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-[#141414]">
                  Ishtirokchi qo'shish
                </h3>
                <button
                  onClick={handleClose}
                  className="p-1 hover:bg-[#F5F5F5] rounded-full transition-all"
                >
                  <XMarkIcon className="w-5 h-5 text-[#999999]" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 flex flex-col gap-4">
                {error && (
                  <div className="px-4 py-2.5 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                    {error}
                  </div>
                )}

                {/* Search input */}
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setSelected(null)
                      setError(null)
                    }}
                    placeholder="Mijoz qidiring..."
                    autoFocus
                    className={`${inputClass} pl-10`}
                  />
                </div>

                {/* Results / Suggestions */}
                {!selected && results.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] text-[#999999] mb-1 px-1">
                      {query.trim()
                        ? `"${query}" bo'yicha natijalar`
                        : "Oxirgi mijozlar"}
                    </p>
                    <div className="max-h-[280px] overflow-y-auto">
                      {results.map((c) => (
                        <ClientRow
                          key={c.id}
                          client={c}
                          onSelect={() => {
                            setSelected(c)
                            setResults([])
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state — only when searching */}
                {!selected && query.trim() && results.length === 0 && (
                  <p className="text-[13px] text-[#999] text-center py-4">
                    Mijoz topilmadi
                  </p>
                )}

                {/* Selected client preview */}
                {selected && (
                  <div className="bg-[#F9F9F9] rounded-[8px] p-4 flex items-start gap-3">
                    <div className="w-14 h-14 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden flex-shrink-0">
                      {selected.image ? (
                        <img
                          src={selected.image}
                          alt={selected.full_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[14px] font-bold text-[#999]">
                          {getInitials(selected.full_name)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <span className="text-[15px] font-bold text-[#141414]">
                        {selected.full_name}
                      </span>
                      {selected.activity && (
                        <span className="text-[12px] text-[#666]">
                          {selected.activity}
                        </span>
                      )}
                      {selected.phone && (
                        <span className="text-[12px] text-[#999]">
                          {selected.phone}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSelected(null)
                        setError(null)
                        loadSuggestions()
                      }}
                      className="p-1 hover:bg-[#F0F0F0] rounded-full transition-colors flex-shrink-0"
                    >
                      <XMarkIcon className="w-4 h-4 text-[#999]" />
                    </button>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-5 pt-0 flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={adding}
                  className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[8px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={handleAdd}
                  disabled={adding || !selected}
                  className={`flex-1 px-4 py-2.5 rounded-[8px] text-[13px] font-bold transition-all ${
                    adding || !selected
                      ? "bg-[#E0E0E0] text-[#999] cursor-not-allowed"
                      : "bg-[#141414] text-white hover:bg-black shadow-md active:scale-95"
                  }`}
                >
                  {adding ? "Qo'shilmoqda..." : "Qo'shish"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast notification */}
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
