export const BRAND = {
  primary: '#141414',
  accent: '#D13328',
} as const

export const STATUS_VARIANTS = {
  success: { bg: '#F0F0F0', text: '#141414' },
  warning: { bg: '#F0F0F0', text: '#888888' },
  danger:  { bg: 'rgba(209,51,40,0.07)', text: '#D13328' },
  info:    { bg: '#F0F0F0', text: '#141414' },
  neutral: { bg: '#F5F5F5', text: '#AAAAAA' },
} as const

export type StatusVariant = keyof typeof STATUS_VARIANTS
