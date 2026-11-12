// Client anketa (097): a client fills in their own card through a link; staff approve.

export type AnketaFields = { full_name: string; company: string; role: string; activity: string }
export const ANKETA_LABELS: Record<keyof AnketaFields, string> = { full_name: "Ism-familiya", company: "Kompaniya", role: "Lavozim", activity: "Soha / faoliyat" }

export const anketaUrl = (token: string) => `${location.origin}/anketa/${token}`

/** Fields the client changed to something non-empty (empty = "leave the card as it is") */
export function fieldChanges(card: AnketaFields, sent: AnketaFields): (keyof AnketaFields)[] {
  return (Object.keys(ANKETA_LABELS) as (keyof AnketaFields)[]).filter((k) => sent[k].trim() !== "" && sent[k].trim() !== card[k].trim())
}

const ERRORS: Record<string, string> = {
  anketa_invalid: "Havola eskirgan yoki noto'g'ri. Sizga havola yuborgan xodimdan yangisini so'rang.",
  anketa_rate_limited: "Juda ko'p urinish. Keyinroq urinib ko'ring.",
  anketa_name: "Ism-familiyani to'liq yozing (2–100 belgi).",
  anketa_too_long: "Matn juda uzun (150 belgigacha).",
  anketa_phone: "Telefon raqamini to'g'ri yozing, masalan 90 123 45 67.",
  anketa_photo: "Rasm yuklanmadi, qaytadan tanlang.",
  anketa_reviewed: "Bu anketa allaqachon ko'rib chiqilgan.",
}
export const anketaError = (code: string) => ERRORS[code] ?? "Yuborilmadi. Internetni tekshirib, qaytadan urinib ko'ring."
