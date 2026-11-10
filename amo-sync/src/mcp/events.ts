// The connector's event tools. Fixed statements with bound parameters only, through the user's transaction (`tx`).
import * as z from "zod"
import type { UserSql } from "./db"
import { date, limit, offset, tool, ToolError, uuid } from "./def"
import type { ToolDef } from "./def"

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

const isFk = (e: unknown) => e instanceof Error && (e as { code?: string }).code === "23503"

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
          or (${digits.length >= 3} and position(${digits} in regexp_replace(coalesce(phone, ''), '\D', '', 'g')) > 0)
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
]
