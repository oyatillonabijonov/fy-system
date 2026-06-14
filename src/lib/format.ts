const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr',
]

export function formatDate(
  d: string | Date | null | undefined,
  mode: 'short' | 'long' | 'month' = 'short',
): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  const day = String(date.getDate()).padStart(2, '0')
  const m = date.getMonth()
  const month = String(m + 1).padStart(2, '0')
  const year = date.getFullYear()
  if (mode === 'short') return `${day}.${month}.${year}`
  if (mode === 'long') return `${date.getDate()} ${UZ_MONTHS[m]} ${year}`
  const cap = UZ_MONTHS[m].charAt(0).toUpperCase() + UZ_MONTHS[m].slice(1)
  return `${cap} ${year}`
}

export function formatMoney(
  amount: number | null | undefined,
  currency: 'UZS' | 'USD' = 'UZS',
): string {
  const n = Number(amount ?? 0)
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(n))
  return `${formatted} ${currency}`
}

export function formatNumber(n: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    Math.round(Number(n ?? 0)),
  )
}

export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '—'
  const cleaned = raw.replace(/[\s\-()]/g, '')
  if (cleaned.startsWith('+')) return cleaned
  if (/^998\d{9}$/.test(cleaned)) return `+${cleaned}`
  if (/^\d{9}$/.test(cleaned)) return `+998${cleaned}`
  return cleaned
}
