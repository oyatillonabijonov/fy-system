import type { StatusVariant } from './theme'

export type ClientActivityStatus = 'yangi' | 'faol' | 'sustlashgan' | 'yoqotilgan'

export function getClientActivityStatus(j: {
  events_count: number
  days_since_last_event: number | null
}): ClientActivityStatus {
  if (j.events_count === 0) return 'yangi'
  if (j.days_since_last_event === null) return 'yangi'
  if (j.days_since_last_event <= 90) return 'faol'
  if (j.days_since_last_event <= 180) return 'sustlashgan'
  return 'yoqotilgan'
}

export const ACTIVITY_STATUS_META: Record<ClientActivityStatus, {
  label: string; variant: StatusVariant
}> = {
  yangi:       { label: 'Yangi',       variant: 'info'    },
  faol:        { label: 'Faol',        variant: 'success' },
  sustlashgan: { label: 'Sustlashgan', variant: 'warning' },
  yoqotilgan:  { label: "Yo'qotilgan", variant: 'danger'  },
}
