// Phone numbers as the forms type them (2026-11-25: clients from other countries). Stored form is always
// "+<country code><number>"; an Uzbek one is "+998" + 9 digits. The database keeps whatever starts with "+"
// (normalize_phone, 032 / 057), so the form only has to hand it over whole.

/** A complete number: Uzbek = +998 and nine digits; another country = + and 8–15 digits */
export function validPhone(p: string | null | undefined): boolean {
  if (!p) return false
  return p.startsWith("+998") ? /^\+998\d{9}$/.test(p) : /^\+\d{8,15}$/.test(p)
}

/** A stored number of another country — the field opens in its "other country" mode */
export const isForeign = (p: string | null | undefined) => !!p && p.startsWith("+") && !p.startsWith("+998") && !"+998".startsWith(p)

/** What is typed in the field → the stored value ("" while empty) */
export function phoneFromInput(raw: string, foreign: boolean): string {
  const d = raw.replace(/\D/g, "").slice(0, foreign ? 15 : 9)
  return d ? `${foreign ? "+" : "+998"}${d}` : ""
}

/** The stored value → the digits shown in the field */
export const inputDigits = (value: string, foreign: boolean) =>
  foreign ? value.replace(/\D/g, "").slice(0, 15) : value.replace(/^\+998/, "").replace(/\D/g, "").slice(0, 9)

/** A pasted number: "+7…" or "00 44…" is another country's; anything else is read as Uzbek */
export function pastedPhone(text: string): { foreign: boolean; value: string } {
  const c = text.replace(/[^+\d]/g, "")
  const d = c.replace(/\D/g, "")
  if (c.startsWith("00")) return { foreign: true, value: phoneFromInput(d.slice(2), true) }
  if (c.startsWith("+") && !c.startsWith("+998")) return { foreign: true, value: phoneFromInput(d, true) }
  return { foreign: false, value: phoneFromInput(d.length > 9 && d.startsWith("998") ? d.slice(3) : d, false) }
}
