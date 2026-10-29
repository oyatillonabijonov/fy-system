import type { ReactNode } from "react"
import { useMedia } from "@/hooks/useMedia"
import { Sheet } from "@/components/ui/Sheet"
import { ModalShell } from "@/components/moliya/PaymentActionModals"

/** `ModalShell` as it is from sm up; on a phone the same form becomes a bottom sheet with a sticky footer */
export function ModalOrSheet({ title, error, submitLabel, canSubmit, pending, danger, onSubmit, onClose, children }: {
  title: string
  error: string | null
  submitLabel: string
  canSubmit: boolean
  pending: boolean
  danger?: boolean
  onSubmit: () => void
  onClose: () => void
  children: ReactNode
}) {
  const phone = useMedia("(width < 40rem)")
  if (!phone) {
    return (
      <ModalShell title={title} error={error} submitLabel={submitLabel} canSubmit={canSubmit} pending={pending} danger={danger}
        onSubmit={onSubmit} onClose={onClose}>
        {children}
      </ModalShell>
    )
  }
  const enabled = canSubmit && !pending
  return (
    <Sheet open onClose={() => !pending && onClose()} title={title} footer={<>
      <button type="button" onClick={onClose} disabled={pending}
        className="h-12 px-5 rounded-full bg-mute-soft text-ink text-base font-semibold disabled:opacity-50">Yopish</button>
      <button type="button" onClick={onSubmit} disabled={!enabled}
        className={`h-12 flex-1 rounded-full text-base font-semibold ${enabled ? (danger ? "bg-danger text-white" : "bg-accent text-ink-on-accent") : "bg-mute-soft text-ink-muted"}`}>
        {pending ? "Saqlanmoqda..." : submitLabel}
      </button>
    </>}>
      <div className="flex flex-col gap-4">
        {error && <div role="alert" className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark">{error}</div>}
        {children}
      </div>
    </Sheet>
  )
}
