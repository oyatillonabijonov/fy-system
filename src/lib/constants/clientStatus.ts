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
  label: string; bg: string; text: string; dot: string
}> = {
  yangi:       { label: 'Yangi',       bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  faol:        { label: 'Faol',        bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500'  },
  sustlashgan: { label: 'Sustlashgan', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  yoqotilgan:  { label: "Yo'qotilgan", bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500'    },
}
