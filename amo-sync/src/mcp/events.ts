// The connector's event tools. Fixed statements with bound parameters only, through the user's transaction (`tx`).
import * as z from "zod"
import type { UserSql } from "./db"
import { confirmOk, confirmToken } from "./confirm"
import { date, limit, offset, tool, ToolError, uuid } from "./def"
import type { ToolDef } from "./def"
import { putFile } from "./files"
import { publicBase } from "./oauth"

export interface EventDetail {
  id: string; name: string; date: string | null; end_date: string | null; location: string | null
  manager_id: string | null; manager: string | null; cashback_percent: string | null; total_value: string
  tariffs: { id: string; name: string; price: string; sort_order: number }[]
  participants: { id: string; client_id: string | null; full_name: string; phone: string | null; company: string | null; role: string | null; tariff: string | null; seller: string | null }[]
  task_count: number
  pipeline: { id: string; name: string } | null
}

/** One event with its tariffs, people (no money), task count and linked voronka (null when none or not readable) */
export async function eventDetail(tx: UserSql, id: string): Promise<EventDetail | null> {
  const [r] = await tx<EventDetail[]>`
    select e.id, e.name, e.date, e.end_date, e.location, e.manager_id, m.full_name as manager, e.cashback_percent, e.total_value,
      coalesce((select json_agg(json_build_object('id', t.id, 'name', t.name, 'price', t.price, 'sort_order', t.sort_order) order by t.sort_order, t.created_at)
        from public.event_tariffs t where t.event_id = e.id), '[]'::json) as tariffs,
      coalesce((select json_agg(json_build_object('id', x.id, 'client_id', x.contact_id, 'full_name', x.full_name, 'phone', x.phone, 'company', x.company, 'role', x.role, 'tariff', tf.name, 'seller', sp.full_name) order by x.sort_order nulls last, x.created_at)
        from (select * from public.event_participants where event_id = e.id order by sort_order nulls last, created_at limit 500) x
        left join public.event_tariffs tf on tf.id = x.tariff_id left join public.profiles sp on sp.id = x.seller_id), '[]'::json) as participants,
      (select count(*)::int from public.tasks k where k.event_id = e.id) as task_count,
      (select json_build_object('id', p.id, 'name', p.name) from public.crm_pipelines p where p.event_id = e.id order by p.sort_order, p.created_at limit 1) as pipeline
    from public.events e left join public.profiles m on m.id = e.manager_id where e.id = ${id}`
  return r ?? null
}

const ASK = "Changes real data. Before calling, make sure the user has given the name, the start date, the responsible person and at least one tariff with its price — ask for anything missing; never invent a date, a person or a price. Read the result back to the user."
const ORDER = "Tugash sanasi boshlanish sanasidan oldin bo'lmasin"
const name = z.string().trim().min(1).max(200)
const price = z.number().min(0).max(9999999999)
const percent = z.number().min(0).max(100)
const tariffs = z.array(z.object({ name, price })).min(1).max(20)
const place = z.string().trim().min(1).max(200)

/** Throws unless the staff member exists and is active (the web form's manager rule) */
async function needManager(tx: UserSql, id: string): Promise<void> {
  const [m] = await tx`select 1 from public.profiles where id = ${id} and is_active is distinct from false`
  if (!m) throw new ToolError("Mas'ul topilmadi yoki nofaol")
}

const DELETE_ALSO = [
  "Cancelled (voided) payments of its participants are removed together with them; cashback its participants earned from this event is taken back from their balances.",
  "The counts show only what you are allowed to see; expenses, payments and voronkas hidden from you are affected as well.",
]

const STICKER_STYLES = z.enum(["onyx", "sandstone", "graphite", "linen", "ivory"])
const SIGN_STYLES = z.enum(["signal", "ember"])
const DIRECTIONS = z.enum(["left", "up", "right", "up-left", "up-right", "down", "down-left", "down-right", "both"])
const LINK = "The result is a download link that expires in 15 minutes: give it to the user as a link. The booklet is exported in the platform (Tadbirlar → Dizayn materiallar)."

/** Keeps the PDF for download and returns the tool result; a renderer Error (nothing to print, bad id) is the model's to read */
async function exportFile(name: string, make: () => Promise<{ bytes: Uint8Array; pages: number }>, count: number) {
  const base = publicBase()
  if (!base) throw new ToolError("Eksport hozircha sozlanmagan")
  let pdf: { bytes: Uint8Array; pages: number }
  try { pdf = await make() } catch (e) { throw new ToolError(e instanceof Error ? e.message : "Eksport bajarilmadi") }
  return { url: `${base}/mcp/files/${putFile(name, pdf.bytes)}`, file: name, pages: pdf.pages, count, expires_in: 900 }
}

const isGuard = (e: unknown) => e instanceof Error && e.message.includes("participant_has_payments")

const isFk = (e: unknown) => e instanceof Error && (e as { code?: string }).code === "23503"

// The web's texts for enroll_participant's errors, copied from ENROLL_ERRORS in src/lib/supabase/queries/events.ts
const ENROLL_ERRORS: Record<string, string> = {
  "forbidden: staff_only": "Bu amal uchun ruxsat yo'q",
  tariff_mismatch: "Tarif bu tadbirga tegishli emas",
  tariff_required: "Bu tadbirda tariflar bor — tarifni tanlang",
  price_required: "Kelishilgan narxni kiriting",
  seller_invalid: "Sotuvchi Sotuv bo'limining faol hodimi bo'lishi kerak",
  client_not_found: "Mijoz topilmadi",
  client_required: "Ism va to'g'ri telefon raqamni kiriting",
  already_enrolled: "Bu mijoz allaqachon ushbu tadbirga qo'shilgan",
}

/** The web's Uzbek text for a raised enroll_participant message; `client_exists:<id>:<name>` names the existing client; anything else is undefined */
function enrollText(msg: string): string | undefined {
  const m = /^client_exists:([^:]+):([\s\S]*)$/.exec(msg)
  if (m) return `Bu telefon raqami bilan mijoz bor: ${m[2]}. Shu mijozni yozish uchun client_id: ${m[1]} bilan qayta chaqiring`
  return ENROLL_ERRORS[msg]
}

export const EVENT_TOOLS: ToolDef[] = [
  tool({ name: "events", title: "Events", module: "tadbirlar", input: { limit: limit(200, 50), offset },
    description: "Events newest start date first, with location, manager and participant count. Pass an id to the event tool for tariffs and people.",
    run: async (tx, a) => tx`select e.id, e.name, e.date, e.end_date, e.location, e.manager_id, m.full_name as manager,
        (select count(*)::int from public.event_participants p where p.event_id = e.id) as participants
      from public.events e left join public.profiles m on m.id = e.manager_id
      order by e.date desc nulls last, e.created_at desc limit ${a.limit} offset ${a.offset}` }),
  tool({ name: "event", title: "One event", module: "tadbirlar", input: { event_id: uuid },
    description: "One event with its tariffs, participants (name, phone, company, tariff, seller; no money), task count and linked voronka. Returns the ids the other event tools take: tariffs[].id, participants[].client_id, manager_id.",
    run: async (tx, a) => {
      const d = await eventDetail(tx, a.event_id)
      if (!d) throw new ToolError("Tadbir topilmadi")
      return d
    } }),
  tool({ name: "find_clients", title: "Find clients", module: "tadbirlar", input: { query: z.string().min(2).max(100), limit: limit(50, 20) },
    description: "Finds clients (customers and leads) whose name contains the text (any case) or whose phone contains its digits; use it to find a person to enrol, then pass the id as client_id.",
    run: async (tx, a) => {
      const digits = a.query.replace(/\D/g, "")
      return tx`select id, full_name, phone, company from public.clients
        where position(lower(${a.query}) in lower(full_name)) > 0
          or (${digits.length >= 3} and position(${digits} in regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) > 0)
        order by full_name limit ${a.limit}`
    } }),
  tool({ name: "create_event", title: "Create an event", module: "tadbirlar", write: true,
    input: { name, date, manager_id: uuid, tariffs, end_date: date.optional(), location: place.optional(), cashback_percent: percent.default(5), total_value: price.default(0), copy_tasks_from: uuid.optional(), allow_duplicate: z.boolean().default(false) },
    description: `Creates an event with its tariffs in one step (tariffs: name and price in so'm; manager_id from the reference or find tools' staff ids; cashback_percent default 5; optional copy_tasks_from = an event whose tasks are copied; refuses an event with the same name and start date unless allow_duplicate is true). ${ASK}`,
    run: async (tx, a) => {
      if (a.end_date && a.end_date < a.date) throw new ToolError(ORDER)
      await needManager(tx, a.manager_id)
      if (a.copy_tasks_from) {
        const [src] = await tx`select 1 from public.events where id = ${a.copy_tasks_from}`
        if (!src) throw new ToolError("Nusxa olinadigan tadbir topilmadi")
      }
      // two identical calls at once (a client retrying) queue here, so the second one sees the first one's event
      await tx`select pg_advisory_xact_lock(hashtext(lower(btrim(${a.name})) || '|' || ${a.date}::text))`
      if (!a.allow_duplicate) {
        const [dup] = await tx`select id from public.events where lower(btrim(name)) = lower(btrim(${a.name})) and (date)::date = ${a.date}::date limit 1`
        if (dup) throw new ToolError(`Shu nom va sana bilan tadbir allaqachon bor (${dup.id}). Baribir yaratish uchun allow_duplicate: true bilan chaqiring`)
      }
      const [ev] = await tx<{ id: string }[]>`insert into public.events (name, description, date, end_date, location, cover_image, manager_id, cashback_percent, total_value)
        values (${a.name}, null, ${a.date}::date, ${a.end_date ?? null}::date, ${a.location ?? null}::text, null, ${a.manager_id}, ${Math.round(a.cashback_percent * 100) / 100}::numeric, ${a.total_value}::numeric) returning id`
      for (const [i, t] of a.tariffs.entries()) await tx`insert into public.event_tariffs (event_id, name, price, sort_order) values (${ev!.id}, ${t.name}, ${t.price}::numeric, ${i})`
      let copied = 0
      if (a.copy_tasks_from) copied = (await tx<{ n: number }[]>`select public.copy_event_tasks(${a.copy_tasks_from}, ${ev!.id}) as n`)[0]!.n
      return { ...(await eventDetail(tx, ev!.id)), tasks_copied: copied }
    } }),
  tool({ name: "update_event", title: "Edit an event", module: "tadbirlar", write: true,
    input: { event_id: uuid, name: name.optional(), date: date.optional(), end_date: date.nullable().optional(), location: place.nullable().optional(), manager_id: uuid.optional(), cashback_percent: percent.optional(), total_value: price.optional(),
      tariffs: z.array(z.object({ id: uuid.optional(), name, price })).min(1).max(20).refine((l) => new Set(l.flatMap((t) => t.id ? [t.id] : [])).size === l.filter((t) => t.id).length, "tariff ids must be unique").optional() },
    description: `Edits an event: only the fields you pass change (end_date: null and location: null clear them). tariffs, when passed, is the event's complete list: an item with id (from the event tool) is kept and updated, one without id is added, one left out is deleted (refused while participants use it). ${ASK}`,
    run: async (tx, a) => {
      const [cur] = await tx<{ d: string | null; e: string | null }[]>`select (date)::date::text as d, (end_date)::date::text as e from public.events where id = ${a.event_id}`
      if (!cur) throw new ToolError("Tadbir topilmadi")
      if (a.name === undefined && a.date === undefined && a.end_date === undefined && a.location === undefined && a.manager_id === undefined && a.cashback_percent === undefined && a.total_value === undefined && !a.tariffs)
        throw new ToolError("O'zgartirish uchun hech narsa berilmadi")
      const start = a.date ?? cur.d
      const end = a.end_date === undefined ? cur.e : a.end_date
      if (start && end && end < start) throw new ToolError(ORDER)
      if (a.manager_id) await needManager(tx, a.manager_id)
      const keep = (a.tariffs ?? []).flatMap((t) => (t.id ? [t.id] : []))
      if (keep.length) {
        const own = await tx`select id from public.event_tariffs where event_id = ${a.event_id} and id = any(${tx.array(keep)}::uuid[])`
        if (own.length !== keep.length) throw new ToolError("Tarif bu tadbirga tegishli emas")
      }
      // an absent field keeps its column; the two clearable ones carry a flag so null means "clear"
      await tx`update public.events set
          name = coalesce(${a.name ?? null}::text, name),
          date = coalesce(${a.date ?? null}::date, date),
          end_date = case when ${a.end_date !== undefined}::boolean then ${a.end_date ?? null}::date else end_date end,
          location = case when ${a.location !== undefined}::boolean then ${a.location ?? null}::text else location end,
          manager_id = coalesce(${a.manager_id ?? null}::uuid, manager_id),
          cashback_percent = coalesce(${a.cashback_percent === undefined ? null : Math.round(a.cashback_percent * 100) / 100}::numeric, cashback_percent),
          total_value = coalesce(${a.total_value ?? null}::numeric, total_value),
          updated_at = now()
        where id = ${a.event_id}`
      if (a.tariffs) {
        try {
          await tx`delete from public.event_tariffs where event_id = ${a.event_id} and not (id = any(${tx.array(keep)}::uuid[]))`
        } catch (e) {
          if (isFk(e)) throw new ToolError("O'chirilayotgan tarifda ishtirokchilar bor — avval ularni boshqa tarifga o'tkazing")
          throw e
        }
        for (const [i, t] of a.tariffs.entries()) {
          if (t.id) await tx`update public.event_tariffs set name = ${t.name}, price = ${t.price}::numeric, sort_order = ${i} where id = ${t.id} and event_id = ${a.event_id}`
          else await tx`insert into public.event_tariffs (event_id, name, price, sort_order) values (${a.event_id}, ${t.name}, ${t.price}::numeric, ${i})`
        }
      }
      return eventDetail(tx, a.event_id)
    } }),
  tool({ name: "delete_event", title: "Delete an event", module: "tadbirlar", write: true, destructive: true,
    input: { event_id: uuid, confirm_token: z.string().min(1).max(500).optional() },
    description: "Deleting is permanent and removes the event's participants, tariffs and tasks. First call without confirm_token, show the returned summary to the user, and call again with the token only after they explicitly agree to delete this event. Expenses and the linked voronka are kept (detached). An event whose participants have payments cannot be deleted: those are handled in Moliya. Its voided payments go with it, cashback its participants earned is taken back, and the summary's counts show only what the caller can see.",
    run: async (tx, a, me) => {
      if (!process.env.JWT_SECRET) throw new ToolError("O'chirish hozircha sozlanmagan")
      const [ev] = await tx<{ id: string; name: string; date: string | null }[]>`select id, name, date from public.events where id = ${a.event_id}`
      if (!ev) throw new ToolError("Tadbir topilmadi")
      if (a.confirm_token === undefined) {
        const [n] = await tx<{ participants: number; tariffs: number; tasks: number; expenses: number; pipelines: number; voided: number; cashback: number; blocked: number }[]>`select
          (select count(*)::int from public.event_participants where event_id = ${ev.id}) as participants,
          (select count(*)::int from public.event_tariffs where event_id = ${ev.id}) as tariffs,
          (select count(*)::int from public.tasks where event_id = ${ev.id}) as tasks,
          (select count(*)::int from public.expenses where event_id = ${ev.id}) as expenses,
          (select count(*)::int from public.crm_pipelines where event_id = ${ev.id}) as pipelines,
          (select count(*)::int from public.payments y join public.event_participants p on p.id = y.participant_id where p.event_id = ${ev.id} and y.voided_at is not null) as voided,
          (select count(*)::int from public.event_participants where event_id = ${ev.id} and coalesce(cashback_earned, 0) > 0) as cashback,
          (select count(*)::int from public.event_participants p where p.event_id = ${ev.id}
            and exists (select 1 from public.payments y where y.participant_id = p.id and y.voided_at is null)) as blocked`
        const summary = { event: { id: ev.id, name: ev.name, date: ev.date }, will_delete: { participants: n!.participants, tariffs: n!.tariffs, tasks: n!.tasks, voided_payments: n!.voided, participants_with_cashback: n!.cashback }, will_detach: { expenses: n!.expenses, pipelines: n!.pipelines }, blocked_by_payments: n!.blocked, also: DELETE_ALSO }
        if (n!.blocked > 0) return { ...summary, next: "This event cannot be deleted while its participants have payments. Payments are handled in Moliya (void or refund them first)." }
        return { ...summary, confirm_token: await confirmToken("delete_event", me.id, ev.id), expires_in: 600, next: "Show this summary to the user and ask for an explicit yes. Only then call delete_event again with confirm_token." }
      }
      if (!(await confirmOk(a.confirm_token, "delete_event", me.id, ev.id))) throw new ToolError("Tasdiqlash kodi yaroqsiz yoki muddati o'tgan — avval tasdiq so'rang")
      try {
        const gone = await tx`delete from public.events where id = ${ev.id} returning id`
        if (!gone.length) throw new ToolError("Tadbir topilmadi")
      } catch (e) {
        if (isGuard(e)) throw new ToolError("Tadbirda to'lovi bor ishtirokchilar bor — avval Moliyada to'lovlarni qaytaring yoki bekor qiling")
        throw e
      }
      return { deleted: true, name: ev.name }
    } }),
  tool({ name: "copy_event_tasks", title: "Copy an event's tasks", module: "tadbirlar", write: true,
    input: { from_event_id: uuid, to_event_id: uuid, add_anyway: z.boolean().default(false) },
    description: "Copies the whole task list of one event into another, with each task's section, owner and attachments (status and dates start fresh). Ask the user before adding to an event that already has tasks: the call refuses until add_anyway is true. Returns how many tasks were copied.",
    run: async (tx, a) => {
      if (a.from_event_id === a.to_event_id) throw new ToolError("Bir xil tadbir tanlandi")
      const found = await tx`select id from public.events where id in (${a.from_event_id}, ${a.to_event_id})`
      if (found.length !== 2) throw new ToolError("Tadbir topilmadi")
      const [t] = await tx<{ n: number }[]>`select count(*)::int as n from public.tasks where event_id = ${a.to_event_id}`
      if (t!.n > 0 && !a.add_anyway) throw new ToolError(`Bu tadbirda allaqachon ${t!.n} ta vazifa bor. Baribir qo'shish uchun add_anyway: true bilan chaqiring`)
      const [r] = await tx<{ n: number }[]>`select public.copy_event_tasks(${a.from_event_id}::uuid, ${a.to_event_id}::uuid) as n`
      return { copied: r!.n }
    } }),
  tool({ name: "enroll_participant", title: "Enrol a participant", module: "tadbirlar", write: true,
    input: { event_id: uuid, tariff_id: uuid.optional(), seller_id: uuid.optional(), client_id: uuid.optional(), full_name: name.optional(), phone: z.string().trim().min(1).max(40).optional(), price: price.optional() },
    description: "Enrols one person into an event and creates their debt for the tariff's price (an event without tariffs takes an individual price); it takes no payment — payments are made in Moliya. tariff_id comes from the event tool's tariffs[].id; the person is either an existing client (client_id from find_clients) or a new one (give full_name and phone, never together with client_id); a phone that already belongs to a client is refused with that client's id. seller_id comes from the reference tool's sellers (omit it for \"Belgilanmagan\"). Ask the user for the person, the tariff and the seller before calling.",
    run: async (tx, a) => {
      const byName = a.full_name !== undefined || a.phone !== undefined
      if (a.client_id !== undefined && byName) throw new ToolError("client_id yoki (full_name va phone) dan faqat birini bering")
      if (a.client_id === undefined && !(a.full_name !== undefined && a.phone !== undefined)) throw new ToolError("client_id yoki (full_name va phone) ning ikkalasini bering")
      const [ev] = await tx`select 1 from public.events where id = ${a.event_id}`
      if (!ev) throw new ToolError("Tadbir topilmadi")
      let pid: string
      try {
        const [r] = await tx<{ id: string }[]>`select public.enroll_participant(
          p_event_id => ${a.event_id}::uuid, p_tariff_id => ${a.tariff_id ?? null}::uuid, p_seller_id => ${a.seller_id ?? null}::uuid,
          p_client_id => ${a.client_id ?? null}::uuid, p_full_name => ${a.full_name ?? null}::text, p_phone => ${a.phone ?? null}::text,
          p_price => ${a.price ?? null}::numeric) as id`
        pid = r!.id
      } catch (e) {
        const text = e instanceof Error && e.name === "PostgresError" ? enrollText(e.message) : undefined
        if (text) throw new ToolError(text)
        throw e
      }
      const [d] = await tx`select p.id as participant_id, p.full_name, tf.name as tariff, sp.full_name as seller
        from public.event_participants p left join public.event_tariffs tf on tf.id = p.tariff_id left join public.profiles sp on sp.id = p.seller_id
        where p.id = ${pid}`
      return d
    } }),
  tool({ name: "link_pipeline", title: "Link a voronka to an event", module: "tadbirlar", write: true, adminOnly: true,
    input: { pipeline_id: uuid, event_id: uuid.nullable() },
    description: "Admins only. Sets which event a sales voronka belongs to, or clears it with event_id: null. The ids come from the reference tool (pipelines, events).",
    run: async (tx, a) => {
      const [p] = await tx`select 1 from public.crm_pipelines where id = ${a.pipeline_id}`
      if (!p) throw new ToolError("Voronka topilmadi")
      let event: { id: string; name: string } | null = null
      if (a.event_id !== null) {
        const [e] = await tx<{ id: string; name: string }[]>`select id, name from public.events where id = ${a.event_id}`
        if (!e) throw new ToolError("Tadbir topilmadi")
        event = e
      }
      const [row] = await tx<{ id: string; name: string }[]>`update public.crm_pipelines set event_id = ${a.event_id}::uuid where id = ${a.pipeline_id} returning id, name`
      if (!row) throw new ToolError("Voronka topilmadi")
      return { pipeline: { id: row.id, name: row.name }, event }
    } }),
  tool({ name: "export_stickers", title: "Name stickers PDF", module: "tadbirlar",
    input: { style: STICKER_STYLES, event_id: uuid.optional(), names: z.array(z.string().min(1).max(200)).max(600).optional(), caption: z.string().min(1).max(200).optional() },
    description: `Makes a PDF of name stickers: 14 per A4 sheet, for hand cutting. style is one of onyx, sandstone, graphite, linen, ivory. The names are the event's participants (event_id) followed by any extra names; the caption defaults to the event's name and is required without an event. At most 600 names. ${LINK}`,
    run: async (tx, a) => {
      let list: string[] = [], base = a.caption, evName: string | undefined
      if (a.event_id) {
        const [ev] = await tx<{ name: string }[]>`select name from public.events where id = ${a.event_id}`
        if (!ev) throw new ToolError("Tadbir topilmadi")
        list = (await tx<{ full_name: string }[]>`select full_name from public.event_participants where event_id = ${a.event_id} order by sort_order nulls last, created_at limit 601`).map((r) => r.full_name)
        evName = ev.name
        base ??= ev.name
      }
      list = [...list, ...(a.names ?? [])]
      if (!list.length) throw new ToolError("Stiker uchun ism yo'q")
      if (list.length > 600) throw new ToolError("Stikerlar soni 600 tadan oshmasin")
      if (!base) throw new ToolError("Stiker uchun yozuv (caption) kerak")
      const { stickersPdf, fileSafe } = await import("../pdf/render")
      return exportFile(`${fileSafe(evName ?? base).slice(0, 80)}_stikerlar.pdf`, () => stickersPdf(list, a.caption ?? base!, a.style), list.length)
    } }),
  tool({ name: "export_signs", title: "Venue signs PDF", module: "tadbirlar",
    input: { style: SIGN_STYLES, signs: z.array(z.object({ place: z.string().min(1).max(200), direction: DIRECTIONS })).min(1).max(100), event_id: uuid.optional() },
    description: `Makes a PDF of venue direction signs: 2 per A4 landscape sheet. style is one of signal, ember; each sign has a place and a direction (left, up, right, up-left, up-right, down, down-left, down-right, both); at most 100 signs. event_id only names the file. ${LINK}`,
    run: async (tx, a) => {
      let base = "navigatsiya"
      if (a.event_id) {
        const [ev] = await tx<{ name: string }[]>`select name from public.events where id = ${a.event_id}`
        if (!ev) throw new ToolError("Tadbir topilmadi")
        base = ev.name
      }
      const { signsPdf, fileSafe } = await import("../pdf/render")
      return exportFile(`${fileSafe(base).slice(0, 80)}${a.event_id ? "_navigatsiya" : ""}.pdf`, () => signsPdf(a.signs, a.style), a.signs.length)
    } }),
]
