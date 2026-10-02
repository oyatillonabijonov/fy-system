import { useSyncExternalStore } from "react"
import { confirmStore } from "@/lib/confirm"
import { ModalShell } from "@/components/moliya/PaymentActionModals"

/** The one confirmation dialog (see lib/confirm.ts) */
export function ConfirmHost() {
  const c = useSyncExternalStore(confirmStore.subscribe, confirmStore.get)
  if (!c) return null
  return (
    <ModalShell title={c.title} error={null} submitLabel={c.confirmLabel} canSubmit pending={false} danger={c.danger}
      onSubmit={() => confirmStore.settle(true)} onClose={() => confirmStore.settle(false)}>
      <p className="text-base text-ink-muted">{c.message}</p>
    </ModalShell>
  )
}
