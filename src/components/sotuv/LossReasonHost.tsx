import { useState, useSyncExternalStore } from "react"
import { LOSS_REASONS, lossReasonStore } from "@/lib/lossReason"
import { ModalShell } from "@/components/moliya/PaymentActionModals"

/** The one "why was it lost" dialog (see lib/lossReason.ts) */
export function LossReasonHost() {
  const open = useSyncExternalStore(lossReasonStore.subscribe, lossReasonStore.get)
  return open ? <Picker /> : null
}

function Picker() {
  const [reason, setReason] = useState<string | null>(null)
  return (
    <ModalShell title="Nima uchun yutqazildi?" error={null} submitLabel="Yutqazildi" canSubmit={!!reason} pending={false} danger
      onSubmit={() => lossReasonStore.settle(reason)} onClose={() => lossReasonStore.settle(null)}>
      <div role="radiogroup" aria-label="Yutqazish sababi" className="flex flex-wrap gap-2">
        {LOSS_REASONS.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={r === reason} onClick={() => setReason(r)}
            className={`h-control-md px-4 rounded-full text-base whitespace-nowrap transition-colors ${r === reason ? "bg-accent text-ink-on-accent" : "bg-surface-sunken text-ink hover:bg-mute-ghost-hover"}`}>
            {r}
          </button>
        ))}
      </div>
    </ModalShell>
  )
}
