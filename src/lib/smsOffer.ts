// "Send this client an SMS" from anywhere (e.g. after Telegram couldn't reach them): one sheet with the
// approved-template SMS form, rendered once by components/sms/SmsHost. openSms({ clientId, clientName }).
export type SmsTarget = { clientId: string; clientName: string | null }

let target: SmsTarget | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function openSms(t: SmsTarget): void { target = t; emit() }

export const smsOfferStore = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
  get: () => target,
  close: () => { target = null; emit() },
}
