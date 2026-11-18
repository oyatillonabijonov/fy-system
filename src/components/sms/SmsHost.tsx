import { useSyncExternalStore } from "react"
import { Sheet } from "@/components/ui/Sheet"
import { smsOfferStore } from "@/lib/smsOffer"
import { SmsSend } from "./SmsSend"

/** The one "SMS to this client" sheet (see lib/smsOffer.ts) */
export function SmsHost() {
  const t = useSyncExternalStore(smsOfferStore.subscribe, smsOfferStore.get)
  return (
    <Sheet open={!!t} onClose={smsOfferStore.close} title={`SMS — ${t?.clientName ?? "mijoz"}`}>
      {t && <SmsSend clientId={t.clientId} clientName={t.clientName} onSent={smsOfferStore.close} />}
    </Sheet>
  )
}
