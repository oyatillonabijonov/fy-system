// AI analysis of sales calls (migration 090). Every minute one answered call is taken from
// call_analysis_claim(), its recording goes to Gemini in TWO requests, and the result lands in
// crm_call_analyses:
//   1. audio → transcript with neutral voices A/B (names as a hint, never numbers: a hinted
//      price was written over the spoken one when we tried);
//   2. text → which voice is the seller, then the coaching of the seller only.
// One request for both mixed up seller and client and blamed the seller for the client's words.

export interface Claim {
  call_uuid: string; direction: "in" | "out"; started_at: Date; duration: number; talk_time: number; attempts: number
  seller_name: string | null; client_name: string | null; event_name: string | null; event_date: Date | null
  tariffs: string | null; script: string | null
}
export interface Line { t: string; voice: "A" | "B"; text: string }
export interface RoleLine { t: string; who: "seller" | "client"; text: string }

export const TAGS = ["tanishtirmadi", "ehtiyoj_soramadi", "foyda_aytmadi", "etirozga_javob_yoq", "keyingi_qadam", "sovutadigan_gap", "ortiqcha_soz", "tinglamadi", "boshqa"] as const
export type Tag = (typeof TAGS)[number]

export interface Analysis {
  seller_voice: "A" | "B" | undefined; language: string; summary: string; outcome: string; score: number | null
  criteria: { name: string; score: number | null; comment: string }[]; good: string[]
  mistakes: { t: string | null; quote: string; why: string; better: string; tag: Tag }[]
  words: { word: string; count: number | null; why: string }[]; advice: string[]; script_missed: string[]
}

export const CLUB = "Fikr Yetakchilari"

const STR = { type: "STRING" }
const LIST = { type: "ARRAY", items: STR }
export const TRANSCRIPT_SCHEMA = {
  type: "OBJECT",
  properties: { lines: { type: "ARRAY", items: { type: "OBJECT", properties: { t: STR, voice: { type: "STRING", enum: ["A", "B"] }, text: STR }, required: ["t", "voice", "text"] } } },
  required: ["lines"],
}
export const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    seller_voice: { type: "STRING", enum: ["A", "B"] },
    language: { type: "STRING", description: "uz, ru yoki aralash" },
    summary: { type: "STRING", description: "2-3 gap: suhbat nima haqida va natijasi" },
    outcome: { type: "STRING", description: "yozildi / o'ylab ko'radi / rad etdi / qayta qo'ng'iroq / boshqa" },
    score: { type: "INTEGER", nullable: true },
    criteria: { type: "ARRAY", items: { type: "OBJECT", properties: { name: STR, score: { type: "INTEGER", nullable: true }, comment: STR }, required: ["name", "comment"] } },
    good: LIST,
    mistakes: { type: "ARRAY", items: { type: "OBJECT", properties: {
      t: STR, quote: { type: "STRING", description: "sotuvchining aynan aytgan gapi" }, why: STR,
      better: { type: "STRING", description: "o'rniga aytiladigan tayyor gap" }, tag: { type: "STRING", enum: [...TAGS] },
    }, required: ["quote", "why", "better", "tag"] } },
    words: { type: "ARRAY", items: { type: "OBJECT", properties: { word: STR, count: { type: "INTEGER" }, why: STR }, required: ["word", "why"] } },
    advice: LIST,
    script_missed: LIST,
  },
  required: ["seller_voice", "language", "summary", "outcome", "criteria", "good", "mistakes", "words", "advice", "script_missed"],
}

/** Names only (for the transcription request) */
export function namesHint(c: Claim): string {
  return [CLUB, c.seller_name, c.client_name, c.event_name].filter(Boolean).join("; ")
}

const day = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric" }).format(d)

/** Everything known about the call (for the analysis request) */
export function factsText(c: Claim): string {
  return [
    `Qo'ng'iroq: ${c.direction === "out" ? "sotuvchi mijozga qo'ng'iroq qilgan" : "mijoz o'zi qo'ng'iroq qilgan"}.`,
    ...(c.seller_name ? [`Sotuvchi: ${c.seller_name}.`] : []),
    ...(c.client_name ? [`Mijoz: ${c.client_name}.`] : []),
    ...(c.event_name ? [`Tadbir: ${c.event_name}${c.event_date ? `, ${day(c.event_date)}` : ""}.`] : []),
    ...(c.tariffs ? [`Narxlar (so'm): ${c.tariffs}.`] : []),
  ].join("\n")
}

export function transcriptPrompt(c: Claim): string {
  return `Ilova qilingan audio — ikki kishining telefon suhbati. So'zma-so'z yoz: har bir replika — vaqti (mm:ss), ovoz (A yoki B: birinchi gapirgan ovoz — A, ikkinchisi — B; ovozni tembriga qarab ajrat, bir ovoz doim bir harf), matni. Suhbat qaysi tilda bo'lsa o'sha tilda yoz (o'zbekcha lotin alifbosida, ruscha kirillda). Eshitilmagan joyni [tushunarsiz] deb belgila, o'zingdan to'qima. Raqam va narxlarni aynan aytilganidek yoz.
Suhbatda uchrashi mumkin bo'lgan nomlar (shu ko'rinishda yoz): ${namesHint(c)}`
}

export function analysisPrompt(c: Claim, lines: Line[]): string {
  return `Sen tajribali sotuv bo'limi rahbari va murabbiysan. Quyida "${CLUB}" biznes klubi sotuvchisining mijoz bilan telefon suhbati matni (A va B — ikki ovoz). Klub tadbirkorlar uchun pullik tadbirlar o'tkazadi; sotuvchining maqsadi — mijozni tadbirga yozish yoki keyingi aniq qadamni kelishish.

Ma'lum faktlar:
${factsText(c)}

1. Avval A va B dan qaysi biri SOTUVCHI ekanini mazmunga qarab aniqla (seller_voice): sotuvchi — klub nomidan gapiradigan, tadbir, narx, vaqt, spiker haqida ma'lumot beradigan, mijozni ismi bilan chaqiradigan tomon; mijoz — savol beradigan, to'laydigan tomon.
2. Faqat SOTUVCHINING gaplarini bahola. Hamma izoh va tavsiyalar O'ZBEK tilida (suhbat ruscha bo'lsa ham), sodda va aniq; umumiy gaplar emas, shu suhbatdan dalil keltir. mistakes.quote — faqat sotuvchi aytgan gap; har bir xatoga ro'yxatdan bitta tag tanla.
Matndagi g'aliz yoki tushunarsiz joylar yozuv sifati yoki avtomatik matn xatosi bo'lishi mumkin — bunday joy uchun sotuvchini ayblama.

Mezonlar (har biri 0–10; suhbatda imkon bo'lmagan bo'lsa score = null): Salomlashish va o'zini tanishtirish; Mijoz ehtiyojini aniqlash; Taklifni tushuntirish (foyda orqali); E'tirozlarga javob; Keyingi qadamni kelishish; Nutq madaniyati (ortiqcha so'zlar, ishonch, tinglash).
Umumiy baho (score) 0–100. Suhbat juda qisqa yoki mazmunsiz bo'lsa (band, keyin qo'ng'iroq qiling, noto'g'ri raqam) — score = null qo'y va buni summary'da ayt.
words — sotuvchi ko'p takrorlagan ortiqcha so'zlar (soni bilan). advice — keyingi suhbatlar uchun 2–4 ta aniq tavsiya.
${c.script
    ? `\nSotuv skripti (sotuvchi shunga amal qilishi kerak; suhbatni shu bilan solishtir, tushib qolgan qadamlarni script_missed ga yoz):\n${c.script}\n`
    : "script_missed — bo'sh ro'yxat.\n"}
Suhbat:
${lines.map((l) => `${l.t} ${l.voice}: ${l.text}`).join("\n")}`
}

const plain = (s: string) => s.toLowerCase().replace(/['’`ʻʼ]/g, "")

/** The AI's pick, unless exactly one voice introduces itself (the club's name, "ismim <seller>") */
export function sellerVoice(lines: Line[], ai: "A" | "B" | undefined, sellerName: string | null): "A" | "B" {
  const first = sellerName?.trim().split(/\s+/)[0]
  const marks = [plain(CLUB), ...(first ? [`ismim ${plain(first)}`] : [])]
  const said = (["A", "B"] as const).filter((v) => lines.some((l) => l.voice === v && marks.some((m) => plain(l.text).includes(m))))
  return said.length === 1 ? said[0] : ai ?? "A"
}

export function toRoles(lines: Line[], seller: "A" | "B"): RoleLine[] {
  return lines.map((l) => ({ t: l.t, who: l.voice === seller ? "seller" : "client", text: l.text }))
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const str = (v: unknown) => (typeof v === "string" ? v : "")
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : null)
const strings = (v: unknown) => arr(v).filter((s): s is string => typeof s === "string" && !!s.trim())

/** The model's answer made safe to store; null = unusable (retry) */
export function normalize(raw: unknown): Analysis | null {
  const r = obj(raw)
  if (!r || !str(r.summary) || !Array.isArray(r.criteria)) return null
  return {
    seller_voice: r.seller_voice === "A" || r.seller_voice === "B" ? r.seller_voice : undefined,
    language: str(r.language), summary: str(r.summary), outcome: str(r.outcome), score: num(r.score, 100),
    criteria: arr(r.criteria).map(obj).filter((c) => c !== null).map((c) => ({ name: str(c.name), score: num(c.score, 10), comment: str(c.comment) })),
    good: strings(r.good),
    mistakes: arr(r.mistakes).map(obj).filter((m) => m !== null && !!str(m.quote)).map((m) => ({
      t: str(m!.t) || null, quote: str(m!.quote), why: str(m!.why), better: str(m!.better),
      tag: (TAGS as readonly string[]).includes(str(m!.tag)) ? (str(m!.tag) as Tag) : "boshqa",
    })),
    words: arr(r.words).map(obj).filter((w) => w !== null && !!str(w.word)).map((w) => ({ word: str(w!.word), count: num(w!.count, 999), why: str(w!.why) })),
    advice: strings(r.advice), script_missed: strings(r.script_missed),
  }
}

/** Minutes to wait after `attempts` failed tries; null = give up */
export function retryDelayMin(attempts: number): number | null {
  return [2, 5, 10, 20, 30][attempts] ?? null
}

/** OnlinePBX may publish a recording a while after the call: "not there" is waited for 30 minutes */
export function recordingVerdict(status: number, bytes: number, c: Claim, now: Date): "ok" | "wait" | "skip" {
  if (bytes > 18_000_000) return "skip"   // inline audio limit (20 MB with base64 overhead in mind)
  if (status === 200 && bytes >= 2000) return "ok"
  return now.getTime() < c.started_at.getTime() + (c.duration + 1800) * 1000 ? "wait" : "skip"
}
