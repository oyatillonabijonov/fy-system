import { useState } from "react"
import { useSmsMessages, useSetSmsOptOut } from "@/hooks/useSms"
import { SMS_STATUS } from "@/lib/supabase/queries/sms"

const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })

/** Mijozlar → client card → SMS: the "no promo" switch and every SMS sent to this client */
export function ClientSms({ clientId, optOut }: { clientId: string; optOut: boolean }) {
  const { data = [], isLoading } = useSmsMessages({ clientId })
  const setOptOut = useSetSmsOptOut()
  const [on, setOn] = useState(optOut)   // the card holds a snapshot of the client
  return (
    <div className="px-4 pb-6 lg:px-8 lg:py-6 flex flex-col gap-4">
      <label className="flex items-center justify-between gap-4 p-4 rounded-surface bg-surface-sunken cursor-pointer">
        <span className="flex flex-col gap-0.5">
          <span className="text-base font-medium text-ink">Reklama SMS'i yubormang</span>
          <span className="text-sm text-ink-muted">Eslatmalar baribir boradi</span>
        </span>
        <input type="checkbox" checked={on} disabled={setOptOut.isPending}
          onChange={(e) => { const v = e.target.checked; setOn(v); setOptOut.mutate({ clientId, optOut: v }, { onError: () => setOn(!v) }) }}
          className="size-4 max-lg:size-6 shrink-0 accent-[var(--ds-color-bg-inverted)]" />
      </label>

      {isLoading ? <p className="text-sm text-ink-muted">Yuklanmoqda…</p>
        : data.length === 0 ? <p className="text-sm text-ink-muted py-6 text-center">SMS yuborilmagan</p>
        : <div className="flex flex-col gap-4 max-lg:gap-0 max-lg:rounded-surface max-lg:bg-surface-sunken max-lg:px-4">{data.map((m) => (
          <div key={m.id} className="flex flex-col gap-1 pb-3 max-lg:py-3 border-b border-line last:border-b-0">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink-muted tabular-nums whitespace-nowrap">{when(m.created_at)}</span>
              <span className={`${SMS_STATUS[m.status].cls} shrink-0 whitespace-nowrap`} title={m.error ?? undefined}>{SMS_STATUS[m.status].label}</span>
            </div>
            <p className="text-base text-ink whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}</div>}
    </div>
  )
}
