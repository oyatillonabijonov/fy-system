// Vazifalar from the team chat: a staff member writes in the group
//   "@fymoliyabot Amirsoy Resort to'lovlarini qilish, ma'sul @jahongir, ertagacha"
// and the bot turns it into task(s) — Gemini reads the free text (Latin or
// Cyrillic Uzbek, several tasks per message, relative dates), we resolve the
// owner / event against the DB, insert, and reply with a confirmation carrying a
// "Bekor qilish" button per task (the author or an admin may undo).
// Only messages that mention the bot, in a group whose "task_bot" switch is on
// (telegram_groups, migration 070), are read; the rest of the chat is ignored and
// never sent to AI. The same loop lists a group in telegram_groups when the bot
// is added to it (my_chat_member), so it shows up in Sozlamalar → Integratsiyalar.
// Long polling (getUpdates) — this is the bot's only update consumer.
// Off until TELEGRAM_BOT_TOKEN is set; without GEMINI_API_KEY only groups are listed.

import type { Sql } from "postgres"
import { chatsFor, registerChat } from "./groups"

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ""
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? ""
// Free-tier models are often "high demand" (503): try them in order
const MODELS = (process.env.GEMINI_MODELS ?? "gemini-3.5-flash-lite,gemini-2.5-flash-lite,gemini-flash-lite-latest,gemini-2.5-flash").split(",")
const APP_URL = "https://app.fikryetakchilari.uz/vazifalar"
const MAX_TASKS = 5

const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"]
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"]
const dayLabel = (d: string) => `${Number(d.slice(8, 10))}-${MONTHS[Number(d.slice(5, 7)) - 1]}`
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const handle = (u: string | null | undefined) => (u ?? "").trim().replace(/^@/, "").toLowerCase()

// ─── Telegram ────────────────────────────────────────────────────────────────

interface TgUser { id: number; username?: string; first_name?: string }
interface TgMessage { message_id: number; date: number; chat: { id: number }; from?: TgUser; text?: string; caption?: string; reply_to_message?: TgMessage }
interface TgCallback { id: string; from: TgUser; data?: string; message?: TgMessage }
interface TgMemberUpdate { chat: { id: number; title?: string }; new_chat_member: { status: string } }
interface TgUpdate { update_id: number; message?: TgMessage; callback_query?: TgCallback; my_chat_member?: TgMemberUpdate }
type Button = { text: string; callback_data?: string; url?: string }

async function tg<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
  const j = (await res.json()) as { ok: boolean; result: T; description?: string }
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`)
  return j.result
}
const reply = (to: TgMessage, text: string, buttons?: Button[][]) =>
  tg("sendMessage", {
    chat_id: to.chat.id, text, parse_mode: "HTML", disable_web_page_preview: true,
    reply_parameters: { message_id: to.message_id, allow_sending_without_reply: true },
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  })

// ─── Gemini ──────────────────────────────────────────────────────────────────

export interface Parsed {
  tasks: { title: string; assignee_username?: string | null; assignee_name?: string | null; due_date?: string | null; due_time?: string | null; event?: string | null; section?: string | null }[]
  question?: string | null
}
interface Staff { id: string; full_name: string; telegram: string | null; role: string | null }
interface EventCtx { id: string; name: string; start: string | null; end: string | null; sections: string[] | null }

const SCHEMA = {
  type: "OBJECT",
  properties: {
    tasks: { type: "ARRAY", items: { type: "OBJECT", properties: {
      title: { type: "STRING" },
      assignee_username: { type: "STRING", nullable: true },
      assignee_name: { type: "STRING", nullable: true },
      due_date: { type: "STRING", nullable: true },
      due_time: { type: "STRING", nullable: true },
      event: { type: "STRING", nullable: true },
      section: { type: "STRING", nullable: true },
    }, required: ["title"] } },
    question: { type: "STRING", nullable: true },
  },
  required: ["tasks"],
}

export function buildPrompt(text: string, context: string | null, author: string, today: string, clock: string, staff: Staff[], events: EventCtx[], sections: string[] = []): string {
  const weekday = WEEKDAYS[new Date(`${today}T00:00:00Z`).getUTCDay()]
  return `Sen "Fikr Yetakchilari" jamoasining Telegram guruhidagi vazifa yordamchisisan. Xabardan vazifa(lar)ni ajrat.
Bugun: ${today} (${weekday}), hozir soat ${clock}, Toshkent vaqti. Xabar muallifi: ${author}.
Hodimlar (ism — telegram): ${staff.map((s) => `${s.full_name} — ${s.telegram ?? "yo'q"}`).join("; ")}
Tadbirlar: ${JSON.stringify(events.map((e) => ({ name: e.name, start: e.start, end: e.end, sections: e.sections ?? [] })))}
Barcha bo'limlar (vazifa turlari): ${JSON.stringify(sections)}
Qoidalar:
- title: qisqa, aniq, harakat shaklida (masalan "Resort to'lovlarini qilish"), o'zbek lotinida — kirillda yozilgan bo'lsa lotinga o'gir. Muddat va mas'ulni title'ga yozma.
- assignee_username: mas'ul hodimlar ro'yxatida bo'lsa (xabardagi @username yoki ismi bo'yicha) — ro'yxatdagi username (@ bilan). Hodimning username'i "yo'q" bo'lsa yoki mas'ul tashqi odam bo'lsa — assignee_name ga to'liq ism. "Men"/"o'zim" — xabar muallifi. Mas'ul aytilmasa ikkalasi null.
- due_date: YYYY-MM-DD. "bugun" = bugun, "ertaga/ertagacha" = +1 kun, "indinga/indingacha" = +2, hafta kuni = eng yaqin kelayotgan o'sha kun (bugun bo'lsa — bugun), "hafta oxirigacha" = yakshanba, "oy oxirigacha" = oyning oxirgi kuni, "3-oktabrgacha" = o'sha sana. Aytilmasa null.
- due_time: aniq soat aytilsa "HH:MM" (24 soatlik: "soat 14:00 da" = "14:00", "ertalab 9 da" = "09:00", "kechki 7 da" = "19:00"), aytilmasa null. Soat aytilib kun aytilmasa — soat hali o'tmagan bo'lsa bugun, o'tgan bo'lsa ertaga (due_date ga yoz). Soatni title'ga yozma.
- event: xabar tadbirlardan biriga taalluqli bo'lsa (tadbir yoki joy nomi, masalan resort nomi) — ro'yxatdagi aniq nom; aks holda null.
- section (vazifa turi): har doim tanlashga harakat qil. Tadbir aniq va uning bo'limlari bo'lsa — o'sha bo'limlardan eng mosi; aks holda (tadbir null yoki bo'limi yo'q) — "Barcha bo'limlar"dan eng mosi. Faqat ro'yxatdagi aniq nom; hech biri mos kelmasa null (yangi nom o'ylab topma).
- Bir nechta vazifa bo'lsa — har birini alohida (ko'pi bilan ${MAX_TASKS} ta).
- Xabar vazifa bo'lmasa (salomlashish, savol, hazil) — tasks bo'sh, question'ga qisqa o'zbekcha izoh.
${context ? `Javob berilgan xabar (kontekst):\n"""${context}"""\n` : ""}Xabar:
"""${text}"""`
}

async function askGemini(prompt: string): Promise<Parsed> {
  let last = ""
  for (let round = 0; round < 3; round++) {
    for (const model of MODELS) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
          }),
          signal: AbortSignal.timeout(45_000),
        })
        const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { code: number; message: string } }
        const out = j.candidates?.[0]?.content?.parts?.[0]?.text
        if (out) return JSON.parse(out) as Parsed
        last = `${model}: ${j.error?.code ?? res.status} ${j.error?.message?.slice(0, 80) ?? ""}`
      } catch (err) {
        last = `${model}: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    await new Promise((r) => setTimeout(r, 5_000 * (round + 1)))
  }
  throw new Error(last)
}

// ─── Resolve → insert ────────────────────────────────────────────────────────

export interface Resolved { title: string; assignee_id: string | null; assignee_name: string | null; due_date: string | null; due_time: string | null; event: EventCtx | null; section: string | null; owner_label: string | null }

/** Maps the model's names onto real rows; anything unknown becomes plain text or null.
 *  A section must be a known one: the event's own when it has them, otherwise any known
 *  section (all tasks) — so an Umumiy task gets a type too; the name is kept canonical. */
export function resolveTasks(parsed: Parsed, staff: Staff[], events: EventCtx[], sections: string[] = []): Resolved[] {
  return parsed.tasks.slice(0, MAX_TASKS).filter((t) => t.title?.trim()).map((t) => {
    const byHandle = t.assignee_username ? staff.find((s) => handle(s.telegram) === handle(t.assignee_username)) : undefined
    const byName = !byHandle && t.assignee_name ? staff.find((s) => s.full_name.toLowerCase() === t.assignee_name!.trim().toLowerCase()) : undefined
    const person = byHandle ?? byName
    const outside = !person ? (t.assignee_name?.trim() || (t.assignee_username ? `@${handle(t.assignee_username)}` : null)) : null
    const event = t.event ? events.find((e) => e.name === t.event) ?? null : null
    const allowed = event?.sections?.length ? event.sections : sections
    const section = t.section?.trim() ? allowed.find((s) => s.toLowerCase() === t.section!.trim().toLowerCase()) ?? null : null
    const due = t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) && !Number.isNaN(Date.parse(t.due_date)) ? t.due_date : null
    return {
      title: t.title.trim().slice(0, 300),
      assignee_id: person?.id ?? null,
      assignee_name: outside,
      due_date: due,
      due_time: due && t.due_time && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.due_time) ? t.due_time : null,
      event,
      section,
      owner_label: person ? (person.telegram ? (person.telegram.startsWith("@") ? person.telegram : `@${person.telegram}`) : person.full_name) : outside,
    }
  })
}

export function confirmation(tasks: Resolved[]): string {
  const line = (t: Resolved) =>
    [t.owner_label ? `👤 ${esc(t.owner_label)}` : "👤 mas'ul belgilanmagan", t.due_date ? `📅 ${dayLabel(t.due_date)}${t.due_time ? `, ${t.due_time}` : ""}` : "📅 muddatsiz",
     `📌 ${esc((t.event ? t.event.name : "Umumiy") + (t.section ? ` › ${t.section}` : ""))}`].join(" · ")
  if (tasks.length === 1) return `✅ <b>Vazifa qo'shildi</b>\n${esc(tasks[0].title)}\n${line(tasks[0])}`
  return `✅ <b>${tasks.length} ta vazifa qo'shildi</b>\n` + tasks.map((t, i) => `\n${i + 1}. ${esc(t.title)}\n${line(t)}`).join("\n")
}

/** The task text when the message is for us — "/vazifa@bot …" (always delivered, even in
 *  privacy mode) or a plain "@bot …" mention; null otherwise. A bare "/vazifa" is left to
 *  any other bot in the group (one there has the same command), so tasks aren't doubled. */
export function taskText(raw: string, botUsername: string): string | null {
  const cmd = new RegExp(`^/vazifa@${botUsername}\\b`, "i")
  const mention = new RegExp(`@${botUsername}\\b`, "gi")
  if (cmd.test(raw)) return raw.replace(cmd, "").replace(mention, "").trim()
  if (/^\//.test(raw)) return null   // someone else's command
  return mention.test(raw) ? raw.replace(mention, "").trim() : null
}

async function handleMessage(sql: Sql, msg: TgMessage, botUsername: string): Promise<void> {
  const raw = (msg.text ?? msg.caption ?? "").trim()
  const text = taskText(raw, botUsername)
  if (text === null) return
  if (!GEMINI_KEY) return
  if (!(await chatsFor(sql, "task_bot")).includes(String(msg.chat.id))) {
    await reply(msg, "Bu guruhda vazifa qabul qilish o'chirilgan. Yoqish: tizimda Sozlamalar → Integratsiyalar.")
    return
  }

  const staff = await sql<Staff[]>`select id, full_name, nullif(btrim(telegram), '') as telegram, role from profiles where coalesce(is_active, true)`
  const author = staff.find((s) => msg.from?.username && handle(s.telegram) === handle(msg.from.username))
  if (!author) {
    await reply(msg, "Sizni tizimda topa olmadim. Sozlamalar → Profilim'da Telegram username'ingizni kiriting, keyin qayta yozing.")
    return
  }
  if (!text) {
    await reply(msg, `Vazifani yozing, masalan:\n<i>/vazifa@${botUsername} Resort to'lovlarini qilish, mas'ul @username, ertagacha</i>`)
    return
  }

  const now = new Date(Date.now() + 5 * 3600_000).toISOString()
  const today = now.slice(0, 10)
  const events = await sql<EventCtx[]>`
    select e.id, e.name, (e.date at time zone 'Asia/Tashkent')::date::text as start,
           (e.end_date at time zone 'Asia/Tashkent')::date::text as "end",
           (select array_agg(distinct t.section) from tasks t where t.event_id = e.id and t.section is not null) as sections
    from events e
    where e.date is null or (coalesce(e.end_date, e.date) at time zone 'Asia/Tashkent')::date >= ${today}::date
    order by e.date nulls last`
  const [{ sections }] = await sql<{ sections: string[] }[]>`
    select coalesce(array_agg(distinct section order by section), '{}') as sections from tasks where section is not null`
  const context = msg.reply_to_message?.text ?? msg.reply_to_message?.caption ?? null

  let parsed: Parsed
  try {
    parsed = await askGemini(buildPrompt(text, context, author.full_name, today, now.slice(11, 16), staff, events, sections))
  } catch (err) {
    console.error(`[taskbot] AI: ${err instanceof Error ? err.message : String(err)}`)
    await reply(msg, "⏳ AI hozir band, vazifani qo'sha olmadim. Bir daqiqadan so'ng qayta yuboring.")
    return
  }

  const tasks = resolveTasks(parsed, staff, events, sections)
  if (!tasks.length) {
    await reply(msg, `🤔 ${esc(parsed.question || "Xabardan vazifani tushuna olmadim.")}\nVazifani aniqroq yozing: nima qilish kerak, kim va qachongacha.`)
    return
  }

  const ids: string[] = []
  await sql.begin(async (tx) => {
    for (const t of tasks) {
      const [row] = await tx<{ id: string }[]>`
        insert into tasks (event_id, section, title, assignee_id, assignee_name, due_date, due_time, created_by, sort_order)
        values (${t.event?.id ?? null}, ${t.section}, ${t.title}, ${t.assignee_id}, ${t.assignee_name}, ${t.due_date}, ${t.due_time}, ${author.id},
                (select coalesce(max(sort_order), 0) + 1 from tasks where event_id is not distinct from ${t.event?.id ?? null}))
        returning id`
      ids.push(row.id)
    }
  })

  const undo: Button[][] = ids.map((id, i) => [{ text: ids.length === 1 ? "↩️ Bekor qilish" : `↩️ ${i + 1}-ni bekor qilish`, callback_data: `u:${id}` }])
  const open = tasks[0].event ? `${APP_URL}?event=${tasks[0].event.id}` : `${APP_URL}?event=umumiy`
  await reply(msg, confirmation(tasks), [...undo, [{ text: "Vazifalarni ochish", url: open }]])
  console.log(`[taskbot] ${author.full_name}: ${ids.length} ta vazifa qo'shildi`)
}

async function handleCallback(sql: Sql, cb: TgCallback): Promise<void> {
  const id = cb.data?.startsWith("u:") ? cb.data.slice(2) : null
  if (!id || !cb.message) return void (await tg("answerCallbackQuery", { callback_query_id: cb.id }))
  const [who] = await sql<{ id: string; role: string | null }[]>`
    select id, role from profiles where coalesce(is_active, true) and lower(ltrim(btrim(telegram), '@')) = ${handle(cb.from.username)}`
  const [task] = await sql<{ title: string; created_by: string | null }[]>`select title, created_by from tasks where id = ${id}`
  if (!task) return void (await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Bu vazifa allaqachon o'chirilgan" }))
  if (!who || (who.id !== task.created_by && who.role !== "admin")) {
    return void (await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Faqat vazifani qo'shgan odam yoki admin bekor qila oladi", show_alert: true }))
  }
  await sql`delete from tasks where id = ${id}`
  const kb = (cb.message as TgMessage & { reply_markup?: { inline_keyboard: Button[][] } }).reply_markup?.inline_keyboard ?? []
  const left = kb.filter((row) => row[0]?.callback_data !== `u:${id}`)
  await tg("editMessageText", {
    chat_id: cb.message.chat.id, message_id: cb.message.message_id, parse_mode: "HTML", disable_web_page_preview: true,
    text: `${esc(cb.message.text ?? "")}\n\n↩️ <s>${esc(task.title)}</s> — bekor qilindi`,
    reply_markup: { inline_keyboard: left.some((r) => r[0]?.callback_data) ? left : [] },
  })
  await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Bekor qilindi" })
}

// ─── Loop ────────────────────────────────────────────────────────────────────

export async function startTaskBot(sql: Sql): Promise<void> {
  if (!TOKEN) {
    console.log("[taskbot] TELEGRAM_BOT_TOKEN yo'q — bot o'chiq")
    return
  }
  if (!GEMINI_KEY) console.log("[taskbot] GEMINI_API_KEY yo'q — guruhdan vazifa qo'shish o'chiq (guruhlar ro'yxatga olinadi)")
  const me = await tg<{ username: string }>("getMe", {})
  // Command menu in groups: picking it inserts "/vazifa@<bot>", which only this bot receives
  await tg("setMyCommands", { commands: [{ command: "vazifa", description: "Yangi vazifa qo'shish (Fikr Yetakchilari)" }], scope: { type: "all_group_chats" } })
  // Skip whatever piled up while the bot wasn't listening — never act on old chat
  const backlog = await tg<TgUpdate[]>("getUpdates", { offset: -1, timeout: 0 })
  let offset = backlog.length ? backlog[backlog.length - 1].update_id + 1 : 0
  console.log(`[taskbot] @${me.username} guruhdan vazifa qabul qiladi`)

  void (async () => {
    for (;;) {
      try {
        const updates = await tg<TgUpdate[]>("getUpdates", { offset, timeout: 50, allowed_updates: ["message", "callback_query", "my_chat_member"] })
        for (const u of updates) {
          offset = u.update_id + 1
          try {
            if (u.my_chat_member) {
              const m = u.my_chat_member
              await registerChat(sql, m.chat.id, m.chat.title ?? "", m.new_chat_member.status)
              console.log(`[taskbot] guruh ${m.chat.id} (${m.chat.title ?? ""}): ${m.new_chat_member.status}`)
            } else if (u.message) await handleMessage(sql, u.message, me.username)
            else if (u.callback_query) await handleCallback(sql, u.callback_query)
          } catch (err) {
            console.error(`[taskbot] #${u.update_id}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      } catch (err) {
        console.error(`[taskbot] getUpdates: ${err instanceof Error ? err.message : String(err)}`)
        await new Promise((r) => setTimeout(r, 5_000))
      }
    }
  })()
}
