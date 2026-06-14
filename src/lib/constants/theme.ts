export const BRAND = {
  primary: '#141414',
  accent: '#D13328',
} as const

export const STATUS_VARIANTS = {
  success: { bg: '#E6F4EA', text: '#1E7E34' },
  warning: { bg: '#FFF4E5', text: '#B25E00' },
  danger:  { bg: '#FDECEC', text: '#C62828' },
  info:    { bg: '#E8F0FE', text: '#1A56DB' },
  neutral: { bg: '#F0F0F0', text: '#666666' },
} as const

export type StatusVariant = keyof typeof STATUS_VARIANTS
