// SMS text helpers (083): length in SMS parts and the Eskiz template check.

/** GSM-7 text: 160 chars in one SMS, 153 per part when longer; anything else (Cyrillic, ʻ) 70 / 67 */
const GSM = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅå_ÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/
export function smsParts(text: string): { parts: number; gsm: boolean } {
  if (!text) return { parts: 0, gsm: true }
  const gsm = GSM.test(text)
  const len = gsm ? text.length + (text.match(/[\^{}\\[~\]|€]/g)?.length ?? 0) : text.length
  const [one, many] = gsm ? [160, 153] : [70, 67]
  return { parts: len <= one ? 1 : Math.ceil(len / many), gsm }
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim()

/** Eskiz template → RegExp. `%w` = a word, `%d` = a number; `{a,b}` = a to b of them
 *  (Eskiz counts words: "%w{1,15}" matched "23-25 oktabrdagi Tog' safari"). Spacing is ignored.
 *  ponytail: Eskiz doesn't publish its exact matcher — this mirrors its examples */
export function templateRegex(template: string): RegExp {
  const parts = squash(template).split(/(%[wd](?:\{\d+,\d+\})?)/)
  const body = parts.map((p) => {
    const m = p.match(/^%([wd])(?:\{(\d+),(\d+)\})?$/)
    if (!m) return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const tok = m[1] === "w" ? "\\S+" : "\\S*\\d\\S*"
    const [a, b] = m[2] ? [Number(m[2]), Number(m[3])] : [1, 1]
    return b > 1 ? `${tok}(?: ${tok}){${Math.max(a - 1, 0)},${b - 1}}` : tok
  }).join("")
  return new RegExp(`^${body}$`)
}

/** Does the text (with {ism} filled in) fit one of the approved templates? */
export const fitsTemplate = (text: string, templates: string[]): boolean => {
  const t = squash(text.replace(/\{ism\}/g, "Ali"))
  return templates.some((tpl) => templateRegex(tpl).test(t))
}
