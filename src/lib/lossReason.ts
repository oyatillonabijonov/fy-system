// Why a bitim was lost: the list the DB enforces (crm_loss_reasons, migration 096), and the app-wide
// picker rendered once by components/sotuv/LossReasonHost. `const r = await askLossReason(); if (!r) return`
export const LOSS_REASONS = ["Narx", "Vaqt to'g'ri kelmadi", "Tadbirkor emas", "Tasodifiy ariza", "Noto'g'ri raqam", "Javob bermadi", "Boshqa"] as const

let pending: ((reason: string | null) => void) | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function askLossReason(): Promise<string | null> {
  return new Promise((resolve) => {
    pending?.(null)
    pending = resolve
    emit()
  })
}

export const lossReasonStore = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
  get: () => pending,
  settle: (reason: string | null) => { const p = pending; pending = null; emit(); p?.(reason) },
}
