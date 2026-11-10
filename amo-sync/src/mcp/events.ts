// The connector's event tools. Fixed statements with bound parameters only, through the user's transaction (`tx`).
import * as z from "zod"
import type { UserSql } from "./db"
import { limit, offset, tool, ToolError, uuid } from "./def"
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
]
