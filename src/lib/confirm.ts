// App-wide confirmation dialog instead of the browser's window.confirm (rendered once by
// components/ui/ConfirmHost). `if (!(await confirmAction({ … }))) return`
export interface ConfirmOptions { title: string; message: string; confirmLabel?: string; danger?: boolean }
interface Pending extends Required<ConfirmOptions> { resolve: (ok: boolean) => void }

let current: Pending | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function confirmAction(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    current?.resolve(false)
    current = { confirmLabel: "O'chirish", danger: true, ...o, resolve }
    emit()
  })
}

export const confirmStore = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
  get: () => current,
  settle: (ok: boolean) => { const c = current; current = null; emit(); c?.resolve(ok) },
}
