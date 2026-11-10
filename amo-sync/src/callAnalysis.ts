// AI analysis of sales calls (migration 090). Every minute one answered call is taken from
// call_analysis_claim(), its recording goes to Gemini in TWO requests, and the result lands in
// crm_call_analyses:
//   1. audio → transcript with neutral voices A/B (names as a hint, never numbers: a hinted
//      price was written over the spoken one when we tried);
//   2. text → which voice is the seller, then the coaching of the seller only.
// One request for both mixed up seller and client and blamed the seller for the client's words.

import type { Sql } from "postgres"
import { audioLink } from "./pbx"

const KEY = process.env.GEMINI_API_KEY ?? ""
const MODELS = (process.env.CALL_ANALYSIS_MODELS ?? "gemini-3.5-flash-lite").split(",").map((m) => m.trim()).filter(Boolean)
const DAILY_MAX = Number(process.env.CALL_ANALYSIS_DAILY_MAX) || 150
const BASE = "https://api.fikryetakchilari.uz"

export interface Claim {
  call_uuid: string; direction: "in" | "out"; started_at: Date; duration: number; talk_time: number; attempts: number
  seller_name: string | null; client_name: string | null; event_name: string | null; event_date: Date | null
  tariffs: string | null; script: string | null
}
export interface Line { t: string; voice: "A" | "B"; text: string }
export type RoleLine = { t: string; who: "seller" | "client"; text: string }   // a type, not an interface: sql.json wants an index signature

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

// ─── Gemini ──────────────────────────────────────────────────────────────────

/** One JSON answer from the first model that gives one; throws when every model fails */
export type Ask = (parts: object[], schema: object) => Promise<{ data: unknown; model: string }>

const askGemini: Ask = async (parts, schema) => {
  let last = "model yo'q"
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 32000, responseMimeType: "application/json", responseSchema: schema } }),
        signal: AbortSignal.timeout(120_000),
      })
      const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } }
      const out = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")
      if (out) return { data: JSON.parse(out) as unknown, model }
      last = `${model}: ${res.status} ${j.error?.message?.slice(0, 120) ?? "bo'sh javob"}`
    } catch (err) {
      last = `${model}: ${err instanceof Error ? err.message : String(err)}`
    }
  }
  throw new Error(last)
}

export async function analyseCall(c: Claim, audio: Buffer, ask: Ask): Promise<{ transcript: RoleLine[]; analysis: Analysis; model: string }> {
  const first = await ask([{ text: transcriptPrompt(c) }, { inline_data: { mime_type: "audio/mpeg", data: audio.toString("base64") } }], TRANSCRIPT_SCHEMA)
  const lines = arr(obj(first.data)?.lines).map(obj)
    .filter((l) => l !== null && (l.voice === "A" || l.voice === "B") && !!str(l.text))
    .map((l) => ({ t: str(l!.t), voice: l!.voice as "A" | "B", text: str(l!.text) }))
  if (!lines.length) throw new Error("transcript bo'sh")
  const second = await ask([{ text: analysisPrompt(c, lines) }], ANALYSIS_SCHEMA)
  const analysis = normalize(second.data)
  if (!analysis) throw new Error("tahlil o'qilmadi")
  return { transcript: toRoles(lines, sellerVoice(lines, analysis.seller_voice, c.seller_name)), analysis, model: second.model }
}

// ─── The timer ───────────────────────────────────────────────────────────────

let busy = false

async function tick(sql: Sql): Promise<void> {
  if (busy) return
  busy = true
  try {
    // A runaway loop must not burn the key the task bot shares
    const [{ tries }] = await sql<{ tries: number }[]>`select coalesce(sum(attempts), 0)::int as tries from crm_call_analyses where last_try_at > now() - interval '1 day'`
    if (tries >= DAILY_MAX) return
    const [c] = await sql<Claim[]>`select * from public.call_analysis_claim()`
    if (!c) return
    const started = Date.now()
    const src = await fetch(await audioLink(c.call_uuid, BASE))
    const audio = Buffer.from(await src.arrayBuffer())
    const verdict = recordingVerdict(src.status, audio.length, c, new Date())
    if (verdict === "wait") {
      await sql`update crm_call_analyses set next_try_at = now() + interval '3 minutes' where call_uuid = ${c.call_uuid}`
      return
    }
    if (verdict === "skip") {
      await sql`update crm_call_analyses set status = 'skipped', error = ${audio.length > 18_000_000 ? "yozuv juda katta" : "yozuv yo'q"} where call_uuid = ${c.call_uuid}`
      return
    }
    try {
      const { transcript, analysis: a, model } = await analyseCall(c, audio, askGemini)
      await sql`
        update crm_call_analyses set status = 'done', attempts = attempts + 1, analysed_at = now(), error = null, model = ${model},
          language = ${a.language}, transcript = ${sql.json(transcript)}, summary = ${a.summary}, outcome = ${a.outcome}, score = ${a.score},
          criteria = ${sql.json(a.criteria)}, good = ${sql.json(a.good)}, mistakes = ${sql.json(a.mistakes)}, words = ${sql.json(a.words)},
          advice = ${sql.json(a.advice)}, script_missed = ${sql.json(a.script_missed)}
        where call_uuid = ${c.call_uuid}`
      console.log(`[calls-ai] ${c.call_uuid.slice(0, 8)} done ${a.score ?? "—"} (${model}, ${Math.round((Date.now() - started) / 1000)}s)`)
    } catch (err) {
      const why = (err instanceof Error ? err.message : String(err)).slice(0, 300)
      const wait = retryDelayMin(c.attempts)
      if (wait === null) await sql`update crm_call_analyses set status = 'failed', attempts = attempts + 1, error = ${why} where call_uuid = ${c.call_uuid}`
      else await sql`update crm_call_analyses set attempts = attempts + 1, error = ${why}, next_try_at = now() + make_interval(mins => ${wait}) where call_uuid = ${c.call_uuid}`
      console.error(`[calls-ai] ${c.call_uuid.slice(0, 8)} ${wait === null ? "failed" : `retry in ${wait}m`}: ${why}`)
    }
  } finally {
    busy = false
  }
}

export function startCallAnalysis(sql: Sql): void {
  if (!KEY) { console.log("[calls-ai] GEMINI_API_KEY yo'q — tahlil o'chiq"); return }
  setInterval(() => void tick(sql).catch((e) => console.error(`[calls-ai] ${e instanceof Error ? e.message : e}`)), 60_000)
  console.log(`[calls-ai] javob berilgan qo'ng'iroqlar tahlil qilinadi (${MODELS.join(", ")})`)
}
