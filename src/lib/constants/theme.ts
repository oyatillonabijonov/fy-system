export const BRAND = {
  primary: '#141414',
  accent: '#D13328',
} as const

export const STATUS_VARIANTS = {
  success: { bg: 'var(--ds-color-success-soft)', text: 'var(--ds-color-success-dark)' },
  warning: { bg: 'var(--ds-color-warning-soft)', text: 'var(--ds-color-warning-dark)' },
  danger:  { bg: 'var(--ds-color-danger-soft)',  text: 'var(--ds-color-danger-dark)' },
  info:    { bg: 'var(--ds-color-info-soft)',    text: 'var(--ds-color-info-dark)' },
  neutral: { bg: 'var(--ds-color-mute-soft)',    text: 'var(--ds-color-mute-dark)' },
} as const

export type StatusVariant = keyof typeof STATUS_VARIANTS
