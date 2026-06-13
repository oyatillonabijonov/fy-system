export function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat("uz-UZ").format(amount)} so'm`
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}.${d.getFullYear()}`
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${formatDate(dateStr)}, ${hh}:${mm}`
}
