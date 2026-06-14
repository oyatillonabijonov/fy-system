/* eslint-disable react-refresh/only-export-components -- toast trigger function is co-located with its provider component on purpose */
import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface ToastItem {
  id: number
  name: string
}

let addToastFn: ((name: string) => void) | null = null

export function showNewLeadToast(name: string): void {
  addToastFn?.(name)
}

let nextId = 0

export function LeadToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((name: string) => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, name }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  useEffect(() => {
    addToastFn = addToast
    return () => { addToastFn = null }
  }, [addToast])

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 100, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-auto bg-white border border-[#E0E0E0] rounded-[8px] px-4 py-3 shadow-lg flex items-center gap-3 min-w-[280px]"
          >
            <div className="relative flex-shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-[#141414]" />
              <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-[#141414] animate-ping" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-bold text-[#141414]">
                Yangi lid tushdi!
              </span>
              <span className="text-[12px] text-[#666666]">
                {toast.name}
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
