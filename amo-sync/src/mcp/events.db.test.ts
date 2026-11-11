import { afterAll, beforeAll, expect, test } from "bun:test"
import { makeAsUser } from "./db"
import { staff, testSql } from "./testdb"
import { handleMcp } from "./server"
import { openConnection } from "./store"
import { confirmToken } from "./confirm"
import { callTool, TOOLS } from "./tools"
import { handleConnector } from "./index"

const asUser = makeAsUser(process.env.TEST_DATABASE_URL ?? "postgres://unused")
const created: string[] = []
const id = () => crypto.randomUUID()
const [eventId, tariffA, tariffB, clientA, clientB, partA, partB, taskId, pipelineId] = [id(), id(), id(), id(), id(), id(), id(), id(), id()]
const tag = crypto.randomUUID().slice(0, 8)
const nameA = `Zaynab ${tag}`
const phoneA = `+99890${String(Math.floor(Math.random() * 9000000) + 1000000)}`
let admin = "", evUser = "", seller = "", mgr = "", sell2 = "", inactive = ""

beforeAll(async () => {
  if (!testSql) return
  admin = await staff(testSql, { role: "admin" }); created.push(admin)
  evUser = await staff(testSql, { modules: ["tadbirlar"] }); created.push(evUser)
  seller = await staff(testSql, { modules: ["dashboard", "sotuv-crmn"] }); created.push(seller)
  mgr = await staff(testSql, {}); created.push(mgr)
  sell2 = await staff(testSql, { department: "sotuv" }); created.push(sell2)
  inactive = await staff(testSql, { active: false }); created.push(inactive)
  await testSql`insert into public.events (id, name, date, end_date, location, manager_id, cashback_percent, total_value) values (${eventId}, ${`Fixture ${tag}`}, now(), now() + interval '1 day', 'Hall', ${mgr}, 5, 1000)`
  await testSql`insert into public.event_tariffs (id, event_id, name, price, sort_order) values (${tariffA}, ${eventId}, 'Standart', 100, 1), (${tariffB}, ${eventId}, 'VIP', 300, 2)`
  await testSql`insert into public.clients (id, full_name, phone, company) values (${clientA}, ${nameA}, ${phoneA}, 'Acme'), (${clientB}, ${`Bobur ${tag}`}, null, null)`
  await testSql`insert into public.event_participants (id, event_id, contact_id, full_name, phone, company, tariff_id, seller_id, price, paid, sort_order) values (${partA}, ${eventId}, ${clientA}, ${nameA}, ${phoneA}, 'Acme', ${tariffA}, ${sell2}, 100, 0, 1)`
  await testSql`insert into public.event_participants (id, event_id, contact_id, full_name, tariff_id, price, paid, sort_order) values (${partB}, ${eventId}, ${clientB}, ${`Bobur ${tag}`}, ${tariffB}, 300, 0, 2)`
  await testSql`insert into public.tasks (id, event_id, title) values (${taskId}, ${eventId}, 'Fixture task')`
  await testSql`insert into public.crm_pipelines (id, name, event_id) values (${pipelineId}, ${`Voronka ${tag}`}, ${eventId})`
})
afterAll(async () => {
  await asUser.end()
  if (testSql) {
    const made = await testSql`select id from public.events where name like ${`%${tag}%`}`
    const madeIds = made.map((r) => r.id as string)
    if (madeIds.length) {
      await testSql`delete from public.event_participants where event_id in ${testSql(madeIds)}`
      await testSql`delete from public.events where id in ${testSql(madeIds)}`
      await testSql`delete from public.activity_log where entity_type = 'event' and entity_id in ${testSql(madeIds)}`
    }
    await testSql`delete from public.crm_pipelines where id = ${pipelineId}`
    await testSql`delete from public.tasks where id = ${taskId}`
    await testSql`delete from public.event_participants where id in (${partA}, ${partB})`
    await testSql`delete from public.event_tariffs where event_id = ${eventId}`
    await testSql`delete from public.clients where id in (${clientA}, ${clientB})`
    await testSql`delete from public.events where id = ${eventId}`
    if (created.length) {
      await testSql`delete from public.mcp_calls where user_id in ${testSql(created)}`
      await testSql`delete from public.profiles where id in ${testSql(created)}`
      await testSql`delete from auth.users where id in ${testSql(created)}`
    }
  }
})

const call = async (uid: string, name: string, args: unknown) => callTool(asUser, uid, name, args)
const GATE = "«Tadbirlar» bo'limiga ruxsatingiz yo'q"
type Detail = { id: string; manager: string; tariffs: { id: string; name: string }[]; participants: Record<string, unknown>[]; task_count: number; pipeline: { id: string; name: string } | null }

test.skipIf(!testSql)("a user without Tadbirlar gets the module error from each tool", async () => {
  for (const [n, a] of [["events", {}], ["event", { event_id: eventId }], ["find_clients", { query: "abc" }]] as const) {
    const r = await call(seller, n, a)
    expect(r).toEqual({ ok: false, error: GATE })
  }
})

test.skipIf(!testSql)("events lists the event with its participant count and manager", async () => {
  const r = await call(evUser, "events", { limit: 200 })
  expect(r.ok).toBe(true)
  if (r.ok) {
    const row = (r.data as { id: string; participants: number; manager_id: string; manager: string }[]).find((e) => e.id === eventId)
    expect(row?.participants).toBe(2)
    expect(row?.manager_id).toBe(mgr)
    expect(row?.manager).toContain("Fixture")
  }
  expect((await call(evUser, "events", { limit: 201 })).ok).toBe(false)
})

test.skipIf(!testSql)("event returns tariffs, participants with tariff and seller, task count and pipeline, and no money", async () => {
  const r = await call(admin, "event", { event_id: eventId })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  const d = r.data as Detail
  expect(d.tariffs.map((t) => t.id)).toEqual([tariffA, tariffB])
  expect(d.participants).toHaveLength(2)
  expect(d.participants[0]).toMatchObject({ id: partA, client_id: clientA, tariff: "Standart", full_name: nameA, phone: phoneA, company: "Acme" })
  expect(String(d.participants[0]!.seller)).toContain("Fixture")
  expect(d.participants[1]).toMatchObject({ client_id: clientB, tariff: "VIP", seller: null })
  for (const p of d.participants) for (const k of ["paid", "debt", "price", "cashback_used"]) expect(p).not.toHaveProperty(k)
  expect(d.task_count).toBe(1)
  expect(d.pipeline).toEqual({ id: pipelineId, name: `Voronka ${tag}` })
  expect(d.manager).toContain("Fixture")
})

test.skipIf(!testSql)("a Tadbirlar-only user (no sotuv-crmn) still reads the event, with pipeline null", async () => {
  const r = await call(evUser, "event", { event_id: eventId })
  expect(r.ok).toBe(true)
  if (r.ok) expect((r.data as Detail).pipeline).toBeNull()
})

test.skipIf(!testSql)("an unknown event is Tadbir topilmadi", async () => {
  expect(await call(admin, "event", { event_id: id() })).toEqual({ ok: false, error: "Tadbir topilmadi" })
})

test.skipIf(!testSql)("find_clients: name fragment in another case, phone digits, literal %, short query refused", async () => {
  const byName = await call(evUser, "find_clients", { query: `ZAYNAB ${tag.toUpperCase()}` })
  expect(byName.ok).toBe(true)
  if (byName.ok) expect((byName.data as { id: string }[]).map((c) => c.id)).toEqual([clientA])
  const digits = phoneA.slice(-7)
  const byPhone = await call(evUser, "find_clients", { query: `${digits.slice(0, 3)}-${digits.slice(3)}` })
  expect(byPhone.ok).toBe(true)
  if (byPhone.ok) expect((byPhone.data as { id: string; company: string }[]).find((c) => c.id === clientA)?.company).toBe("Acme")
  for (const q of ["%", "%%%", "_a_"]) {
    const r = await call(evUser, "find_clients", { query: q.length < 2 ? `${q}${q}` : q })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual([])
  }
  expect((await call(evUser, "find_clients", { query: "a" })).ok).toBe(false)
})

// ─── create_event / update_event ───
const DAY = "2027-03-10"
const count = async () => (await testSql!`select count(*)::int n from public.events where name like ${`%${tag}%`}`)[0]!.n as number
const nm = (s: string) => `${s} ${tag}`
const base = (s: string, extra: Record<string, unknown> = {}) => ({ name: nm(s), date: DAY, manager_id: mgr, tariffs: [{ name: "Standart", price: 100 }, { name: "VIP", price: 250.5 }], ...extra })
const mk = async (s: string, extra: Record<string, unknown> = {}) => {
  const r = await call(admin, "create_event", base(s, extra))
  if (!r.ok) throw new Error(r.error)
  return r.data as Detail & { name: string; tasks_copied: number }
}
const rowOf = async (eid: string) => (await testSql!`select name, date::date::text d, end_date::date::text e, location, manager_id, cashback_percent::float cp, total_value::float tv from public.events where id = ${eid}`)[0]

test.skipIf(!testSql)("create_event and update_event are writers behind the Tadbirlar gate; admin sees fifteen tools", async () => {
  const ce = TOOLS.find((t) => t.name === "create_event"), ue = TOOLS.find((t) => t.name === "update_event")
  for (const t of [ce, ue]) {
    expect(t?.write).toBe(true)
    expect(t?.module).toBe("tadbirlar")
    expect(t?.destructive).toBeUndefined()
    expect(t?.description).toContain("Changes real data. Before calling, make sure the user has given the name, the start date, the responsible person and at least one tariff with its price — ask for anything missing; never invent a date, a person or a price. Read the result back to the user.")
  }
  const before = await count()
  expect(await call(seller, "create_event", base("Gate"))).toEqual({ ok: false, error: GATE })
  expect(await call(seller, "update_event", { event_id: eventId, name: "x" })).toEqual({ ok: false, error: GATE })
  expect(await count()).toBe(before)
})

test.skipIf(!testSql)("create_event: event and tariffs in order, defaults, detail matches the DB, audit log names the caller", async () => {
  const d = await mk("Happy", { location: "Hall A" })
  expect(d.tasks_copied).toBe(0)
  expect(d.tariffs.map((t) => t.name)).toEqual(["Standart", "VIP"])
  expect(d.tariffs.map((t) => (t as unknown as { sort_order: number }).sort_order)).toEqual([0, 1])
  expect(d.manager).toContain("Fixture")
  const row = await rowOf(d.id)
  expect(row).toMatchObject({ name: nm("Happy"), d: DAY, e: null, location: "Hall A", manager_id: mgr, cp: 5, tv: 0 })
  const tr = await testSql!`select name, price::float p, sort_order from public.event_tariffs where event_id = ${d.id} order by sort_order`
  expect(tr.map((t) => [t.name, t.p, t.sort_order])).toEqual([["Standart", 100, 0], ["VIP", 250.5, 1]])
  const log = await testSql!`select actor_id, actor_role from public.activity_log where entity_type = 'event' and entity_id = ${d.id} and action = 'created'`
  expect(log).toHaveLength(1)
  expect(log[0]!.actor_id).toBe(admin)
  expect(log[0]!.actor_role).not.toBe("system")
  const viaEvent = await call(admin, "event", { event_id: d.id })
  expect(viaEvent.ok && (viaEvent.data as Detail).tariffs.map((t) => t.id)).toEqual(d.tariffs.map((t) => t.id))
})

test.skipIf(!testSql)("create_event: bad arguments name the field and write nothing", async () => {
  const before = await count()
  const cases: [Record<string, unknown>, string][] = [
    [{ ...base("V1"), tariffs: undefined }, "tariffs"],
    [{ ...base("V2"), tariffs: [] }, "tariffs"],
    [{ ...base("V3"), name: "   " }, "name"],
    [{ ...base("V4"), date: "2027-13-40" }, "date"],
    [{ ...base("V5"), date: undefined }, "date"],
    [base("V6", { cashback_percent: 101 }), "cashback_percent"],
    [base("V7", { total_value: -1 }), "total_value"],
    [base("V8", { tariffs: [{ name: "A", price: 1 }, { name: " ", price: 1 }] }), "tariffs.1.name"],
    [base("V9", { tariffs: [{ name: "A", price: 1 }, { name: "B", price: -1 }] }), "tariffs.1.price"],
  ]
  for (const [args, field] of cases) {
    const r = await call(admin, "create_event", args)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(field)
  }
  expect(await count()).toBe(before)
})

test.skipIf(!testSql)("create_event: end date before the start, an inactive or unknown manager", async () => {
  const before = await count()
  expect(await call(admin, "create_event", base("E1", { end_date: "2027-03-09" }))).toEqual({ ok: false, error: "Tugash sanasi boshlanish sanasidan oldin bo'lmasin" })
  expect(await call(admin, "create_event", base("E2", { manager_id: inactive }))).toEqual({ ok: false, error: "Mas'ul topilmadi yoki nofaol" })
  expect(await call(admin, "create_event", base("E3", { manager_id: id() }))).toEqual({ ok: false, error: "Mas'ul topilmadi yoki nofaol" })
  expect(await count()).toBe(before)
  const ok = await mk("E4", { end_date: DAY })
  expect((await rowOf(ok.id))!.e).toBe(DAY)
})

test.skipIf(!testSql)("create_event: an unknown copy_tasks_from is refused before writing", async () => {
  const before = await count()
  expect(await call(admin, "create_event", base("Tx1", { copy_tasks_from: id() }))).toEqual({ ok: false, error: "Nusxa olinadigan tadbir topilmadi" })
  expect(await count()).toBe(before)
  expect((await testSql!`select count(*)::int n from public.event_tariffs t join public.events e on e.id = t.event_id where e.name = ${nm("Tx1")}`)[0]!.n).toBe(0)
})

/** Runs fn with a temporary trigger on `table` that raises when column `col` equals `marker`; always removed */
async function withBomb(table: "event_tariffs" | "tasks" | "event_participants", col: "name" | "title" | "full_name", marker: string, fn: () => Promise<void>) {
  const n = `zz_bomb_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
  await testSql!.unsafe(`create function public.${n}() returns trigger language plpgsql as $f$ begin if new.${col} = '${marker}' then raise exception 'bomb'; end if; return new; end $f$`)
  await testSql!.unsafe(`create trigger ${n} before insert on public.${table} for each row execute function public.${n}()`)
  try { await fn() } finally {
    await testSql!.unsafe(`drop trigger if exists ${n} on public.${table}`)
    await testSql!.unsafe(`drop function if exists public.${n}()`)
  }
}

test.skipIf(!testSql)("create_event: a failure in the database after the event and a tariff were written rolls everything back", async () => {
  const marker = `bomb-${crypto.randomUUID()}`
  await withBomb("event_tariffs", "name", marker, async () => {
    const r = await call(admin, "create_event", base("Tx3", { tariffs: [{ name: nm("T-first"), price: 1 }, { name: marker, price: 2 }] }))
    expect(r.ok).toBe(false)
    expect((await testSql!`select count(*)::int n from public.events where name = ${nm("Tx3")}`)[0]!.n).toBe(0)
    expect((await testSql!`select count(*)::int n from public.event_tariffs where name = ${nm("T-first")}`)[0]!.n).toBe(0)
  })
})

test.skipIf(!testSql)("create_event: a failure while copying tasks (after event and tariffs) rolls everything back", async () => {
  const marker = `bomb-${crypto.randomUUID()}`
  const src = await mk("Tx4src")
  await testSql!`insert into public.tasks (event_id, title) values (${src.id}, ${marker})`
  await withBomb("tasks", "title", marker, async () => {
    const r = await call(admin, "create_event", base("Tx4", { copy_tasks_from: src.id }))
    expect(r.ok).toBe(false)
    expect((await testSql!`select count(*)::int n from public.events where name = ${nm("Tx4")}`)[0]!.n).toBe(0)
    expect((await testSql!`select count(*)::int n from public.event_tariffs t join public.events e on e.id = t.event_id where e.name = ${nm("Tx4")}`)[0]!.n).toBe(0)
  })
})

test.skipIf(!testSql)("create_event: two identical concurrent calls create exactly one event", async () => {
  for (let i = 0; i < 5; i++) {
    const args = base(`Race${i}`)
    const rs = await Promise.all([call(admin, "create_event", args), call(admin, "create_event", args)])
    expect(rs.filter((r) => r.ok)).toHaveLength(1)
    const bad = rs.find((r) => !r.ok)
    expect(bad && !bad.ok && bad.error).toContain("Shu nom va sana bilan tadbir allaqachon bor")
    expect((await testSql!`select count(*)::int n from public.events where name = ${nm(`Race${i}`)}`)[0]!.n).toBe(1)
  }
})

test.skipIf(!testSql)("update_event: duplicate tariff ids are refused; only tariffs is a valid change", async () => {
  const d = await mk("Up6")
  const t0 = d.tariffs[0]!
  const dup = await call(admin, "update_event", { event_id: d.id, tariffs: [{ id: t0.id, name: "A", price: 1 }, { id: t0.id, name: "B", price: 2 }] })
  expect(dup.ok).toBe(false)
  if (!dup.ok) expect(dup.error).toContain("unique")
  expect((await testSql!`select count(*)::int n from public.event_tariffs where event_id = ${d.id}`)[0]!.n).toBe(2)
  const r = await call(admin, "update_event", { event_id: d.id, tariffs: [{ id: t0.id, name: "Only", price: 9 }] })
  expect(r.ok).toBe(true)
  if (r.ok) expect((r.data as Detail).tariffs.map((t) => t.name)).toEqual(["Only"])
  expect((await rowOf(d.id))!.name).toBe(nm("Up6"))
})

test.skipIf(!testSql)("create_event: a duplicate (name trimmed, any case, same day) is refused with the id, allowed with allow_duplicate", async () => {
  const first = await mk("Dup")
  const r = await call(admin, "create_event", base("Dup", { name: `  ${nm("DUP")}  ` }))
  expect(r).toEqual({ ok: false, error: `Shu nom va sana bilan tadbir allaqachon bor (${first.id}). Baribir yaratish uchun allow_duplicate: true bilan chaqiring` })
  expect(await count()).toBeGreaterThan(0)
  const other = await call(admin, "create_event", base("Dup", { date: "2027-03-11" }))
  expect(other.ok).toBe(true)
  const again = await call(admin, "create_event", base("Dup", { allow_duplicate: true }))
  expect(again.ok).toBe(true)
  if (again.ok) expect((again.data as Detail).id).not.toBe(first.id)
  expect((await testSql!`select count(*)::int n from public.events where name = ${nm("Dup")} and date::date = ${DAY}::date`)[0]!.n).toBe(2)
})

test.skipIf(!testSql)("create_event: copy_tasks_from copies the source's tasks", async () => {
  const d = await mk("Copy", { copy_tasks_from: eventId })
  expect(d.tasks_copied).toBe(1)
  expect(d.task_count).toBe(1)
  expect((await testSql!`select count(*)::int n from public.tasks where event_id = ${d.id} and title = 'Fixture task'`)[0]!.n).toBe(1)
})

test.skipIf(!testSql)("update_event: name and manager change, other fields untouched; location null clears; end_date null clears", async () => {
  const d = await mk("Up1", { location: "Hall", end_date: "2027-03-12", cashback_percent: 7, total_value: 500 })
  const r = await call(admin, "update_event", { event_id: d.id, name: nm("Up1 renamed"), manager_id: sell2 })
  expect(r.ok).toBe(true)
  if (r.ok) expect((r.data as Detail).tariffs).toHaveLength(2)
  expect(await rowOf(d.id)).toMatchObject({ name: nm("Up1 renamed"), manager_id: sell2, location: "Hall", e: "2027-03-12", cp: 7, tv: 500, d: DAY })
  expect((await call(admin, "update_event", { event_id: d.id, location: null })).ok).toBe(true)
  expect((await rowOf(d.id))!.location).toBeNull()
  expect((await call(admin, "update_event", { event_id: d.id, end_date: null, cashback_percent: 0 })).ok).toBe(true)
  expect(await rowOf(d.id)).toMatchObject({ e: null, cp: 0, name: nm("Up1 renamed") })
  const log = await testSql!`select actor_id from public.activity_log where entity_type = 'event' and entity_id = ${d.id} and action = 'updated'`
  expect(log.length).toBeGreaterThan(0)
  expect(log.every((l) => l.actor_id === admin)).toBe(true)
})

test.skipIf(!testSql)("update_event: nothing to change, bad values, unknown event, date order against the stored value", async () => {
  const d = await mk("Up2", { end_date: "2027-03-12" })
  expect(await call(admin, "update_event", { event_id: d.id })).toEqual({ ok: false, error: "O'zgartirish uchun hech narsa berilmadi" })
  expect(await call(admin, "update_event", { event_id: id(), name: "x" })).toEqual({ ok: false, error: "Tadbir topilmadi" })
  expect((await call(admin, "update_event", { event_id: d.id, name: null })).ok).toBe(false)
  expect((await call(admin, "update_event", { event_id: d.id, tariffs: [] })).ok).toBe(false)
  expect(await call(admin, "update_event", { event_id: d.id, manager_id: inactive })).toEqual({ ok: false, error: "Mas'ul topilmadi yoki nofaol" })
  expect(await call(admin, "update_event", { event_id: d.id, end_date: "2027-03-01" })).toEqual({ ok: false, error: "Tugash sanasi boshlanish sanasidan oldin bo'lmasin" })
  expect(await call(admin, "update_event", { event_id: d.id, date: "2027-03-20" })).toEqual({ ok: false, error: "Tugash sanasi boshlanish sanasidan oldin bo'lmasin" })
  expect(await rowOf(d.id)).toMatchObject({ d: DAY, e: "2027-03-12" })
  expect((await call(admin, "update_event", { event_id: d.id, date: "2027-03-20", end_date: "2027-03-21" })).ok).toBe(true)
})

test.skipIf(!testSql)("update_event tariffs: rename one, add one, drop an unused one; order follows the list", async () => {
  const d = await mk("Up3")
  const [t0, t1] = d.tariffs
  const r = await call(admin, "update_event", { event_id: d.id, tariffs: [{ name: "Yangi", price: 5 }, { id: t0!.id, name: "Renamed", price: 111 }] })
  expect(r.ok).toBe(true)
  const tr = await testSql!`select id, name, price::float p, sort_order from public.event_tariffs where event_id = ${d.id} order by sort_order`
  expect(tr.map((t) => [t.name, t.p, t.sort_order])).toEqual([["Yangi", 5, 0], ["Renamed", 111, 1]])
  expect(tr[1]!.id).toBe(t0!.id)
  expect(tr.some((t) => t.id === t1!.id)).toBe(false)
})

test.skipIf(!testSql)("update_event: dropping a tariff a participant uses is refused and nothing in the call is applied", async () => {
  const d = await mk("Up4")
  const [t0, t1] = d.tariffs
  await testSql!`insert into public.event_participants (event_id, full_name, tariff_id, price, paid) values (${d.id}, ${nm("P")}, ${t1!.id}, 250, 0)`
  const r = await call(admin, "update_event", { event_id: d.id, name: nm("Up4 changed"), tariffs: [{ id: t0!.id, name: "Changed", price: 1 }] })
  expect(r).toEqual({ ok: false, error: "O'chirilayotgan tarifda ishtirokchilar bor — avval ularni boshqa tarifga o'tkazing" })
  expect((await rowOf(d.id))!.name).toBe(nm("Up4"))
  const tr = await testSql!`select name from public.event_tariffs where event_id = ${d.id} order by sort_order`
  expect(tr.map((t) => t.name)).toEqual(["Standart", "VIP"])
})

test.skipIf(!testSql)("update_event: a tariff id of another event is refused and nothing is applied", async () => {
  const d = await mk("Up5")
  const r = await call(admin, "update_event", { event_id: d.id, name: nm("Up5 changed"), tariffs: [{ id: tariffA, name: "Hijack", price: 1 }] })
  expect(r).toEqual({ ok: false, error: "Tarif bu tadbirga tegishli emas" })
  expect((await rowOf(d.id))!.name).toBe(nm("Up5"))
  expect((await testSql!`select name from public.event_tariffs where id = ${tariffA}`)[0]!.name).toBe("Standart")
})

test.skipIf(!testSql)("create_event through handleMcp is audited with its arguments", async () => {
  const tok = (await openConnection(testSql!, admin, "test-client")).access_token
  const args = base("Mcp")
  const res = await handleMcp(new Request("https://x.test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${tok}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_event", arguments: args } }),
  }), testSql!, asUser)
  const j = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } }
  expect(j.result.isError).toBeFalsy()
  const eid = (JSON.parse(j.result.content[0]!.text) as { id: string }).id
  expect((await testSql!`select name from public.events where id = ${eid}`)[0]!.name).toBe(nm("Mcp"))
  const rows = await testSql!`select ok, args from public.mcp_calls where user_id = ${admin} and tool = 'create_event'`
  expect(rows).toHaveLength(1)
  expect(rows[0]!.ok).toBe(true)
  expect(JSON.stringify(rows[0]!.args)).toContain(nm("Mcp"))
})

test.skipIf(!testSql)("find_clients: a phone stored with separators matches by digits; under 3 digits the phone branch is off", async () => {
  const [fmt, short] = [id(), id()]
  await testSql!.begin(async (tx) => {
    await tx`set local session_replication_role = replica`   // skips the phone normaliser: legacy-style rows
    await tx`insert into public.clients (id, full_name, phone) values (${fmt}, ${`Legacy ${tag}`}, '+7 (912) 345-67-89'), (${short}, ${'Qwerty Zxcvb'}, '+7 (912) 111-22-33')`
  })
  try {
    const r = await call(evUser, "find_clients", { query: "9123456" })
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.data as { id: string }[]).map((c) => c.id)).toContain(fmt)
    const s = await call(evUser, "find_clients", { query: "A1" })
    expect(s.ok).toBe(true)
    if (s.ok) expect((s.data as { id: string }[]).map((c) => c.id)).not.toContain(short)
  } finally {
    await testSql!`delete from public.clients where id in (${fmt}, ${short})`
  }
})

// ─── delete_event ───
const savedSecret = process.env.JWT_SECRET
beforeAll(() => { process.env.JWT_SECRET = "delete-event-test-secret" })
const delExpenses: string[] = []
const delEvents: string[] = []
afterAll(async () => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret
  if (!testSql) return
  if (delExpenses.length) await testSql`delete from public.expenses where id in ${testSql(delExpenses)}`
  if (delEvents.length) await testSql`delete from public.activity_log where entity_type = 'event' and entity_id in ${testSql(delEvents)}`
})
const BADTOKEN = "Tasdiqlash kodi yaroqsiz yoki muddati o'tgan — avval tasdiq so'rang"
const exists = async (eid: string) => ((await testSql!`select count(*)::int n from public.events where id = ${eid}`)[0]!.n as number) === 1
type Preview = { event: { id: string; name: string }; will_delete: { participants: number; tariffs: number; tasks: number; voided_payments: number; participants_with_cashback: number }; also: string[]; will_detach: { expenses: number; pipelines: number }; blocked_by_payments: number; confirm_token?: string; expires_in?: number; next: string }
/** An owner-made event with 1 tariff, 1 participant, 1 task and 1 expense, and optionally a live payment */
async function delFixture(s: string, withPayment = false, withVoided = false) {
  const [eid, tid, pid, kid, xid] = [id(), id(), id(), id(), id()]
  delEvents.push(eid); delExpenses.push(xid)
  await testSql!`insert into public.events (id, name, date, manager_id) values (${eid}, ${nm(s)}, now(), ${mgr})`
  await testSql!`insert into public.event_tariffs (id, event_id, name, price) values (${tid}, ${eid}, 'T', 10)`
  await testSql!`insert into public.event_participants (id, event_id, full_name, tariff_id, price, paid) values (${pid}, ${eid}, ${`P ${tag}`}, ${tid}, 10, 0)`
  await testSql!`insert into public.tasks (id, event_id, title) values (${kid}, ${eid}, 'k')`
  await testSql!`insert into public.expenses (id, event_id, category, amount, spent_at) values (${xid}, ${eid}, 'boshqa', 5, current_date)`
  if (withPayment) await testSql!`insert into public.payments (participant_id, amount, method) values (${pid}, 10, 'naqd')`
  if (withVoided) await testSql!`insert into public.payments (participant_id, amount, method, voided_at, void_reason) values (${pid}, 10, 'naqd', now(), 'test')`
  return { eid, pid, xid }
}
async function dropFixture(f: { eid: string; pid: string }) {
  await testSql!`delete from public.payments where participant_id = ${f.pid}`
  await testSql!`delete from public.event_participants where event_id = ${f.eid}`
  await testSql!`delete from public.events where id = ${f.eid}`
}
const preview = async (uid: string, eid: string) => {
  const r = await call(uid, "delete_event", { event_id: eid })
  if (!r.ok) throw new Error(r.error)
  return r.data as Preview
}

test.skipIf(!testSql)("delete_event is a destructive writer behind the Tadbirlar gate, and the gate refuses before anything", async () => {
  const t = TOOLS.find((x) => x.name === "delete_event")
  expect(t?.write).toBe(true)
  expect(t?.destructive).toBe(true)
  expect(t?.module).toBe("tadbirlar")
  expect(t?.description).toContain("Deleting is permanent and removes the event's participants, tariffs and tasks. First call without confirm_token, show the returned summary to the user, and call again with the token only after they explicitly agree to delete this event.")
  expect(await call(seller, "delete_event", { event_id: eventId })).toEqual({ ok: false, error: GATE })
  const forged = await confirmToken("delete_event", seller, eventId)
  expect(await call(seller, "delete_event", { event_id: eventId, confirm_token: forged })).toEqual({ ok: false, error: GATE })
  expect(await exists(eventId)).toBe(true)
})

test.skipIf(!testSql)("tools/list marks delete_event destructive and not read-only", async () => {
  const tok = (await openConnection(testSql!, admin, "test-client")).access_token
  const res = await handleMcp(new Request("https://x.test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${tok}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  }), testSql!, asUser)
  const j = (await res.json()) as { result: { tools: { name: string; annotations?: { destructiveHint?: boolean; readOnlyHint?: boolean } }[] } }
  const t = j.result.tools.find((x) => x.name === "delete_event")
  expect(t?.annotations?.destructiveHint).toBe(true)
  expect(t?.annotations?.readOnlyHint).toBe(false)
})

test.skipIf(!testSql)("delete_event preview: counts, a token, nothing deleted, and a second preview deletes nothing either", async () => {
  const f = await delFixture("DelPrev")
  try {
    const p = await preview(admin, f.eid)
    expect(p.event).toMatchObject({ id: f.eid, name: nm("DelPrev") })
    expect(p.will_delete).toEqual({ participants: 1, tariffs: 1, tasks: 1, voided_payments: 0, participants_with_cashback: 0 })
    expect(p.will_detach).toEqual({ expenses: 1, pipelines: 0 })
    expect(p.blocked_by_payments).toBe(0)
    expect(p.expires_in).toBe(600)
    expect(p.confirm_token).toMatch(/^\d+\.[A-Za-z0-9_-]+$/)
    expect(p.next).toBe("Show this summary to the user and ask for an explicit yes. Only then call delete_event again with confirm_token.")
    expect(await exists(f.eid)).toBe(true)
    expect((await preview(admin, f.eid)).blocked_by_payments).toBe(0)
    expect(await exists(f.eid)).toBe(true)
  } finally { await dropFixture(f) }
})

const ALSO = [
  "Cancelled (voided) payments of its participants are removed together with them; cashback its participants earned from this event is taken back from their balances.",
  "The counts show only what you are allowed to see; expenses, payments and voronkas hidden from you are affected as well.",
]

test.skipIf(!testSql)("delete_event preview tells the whole truth: voided payments and cashback are counted, the delete removes them, and a Tadbirlar-only caller sees 0 but the same warning", async () => {
  const f = await delFixture("DelVoid", false, true)
  try {
    await testSql!`update public.event_participants set cashback_earned = 7 where id = ${f.pid}`
    const p = await preview(admin, f.eid)
    expect(p.will_delete.voided_payments).toBe(1)
    expect(p.will_delete.participants_with_cashback).toBe(1)
    expect(p.blocked_by_payments).toBe(0)
    expect(p.confirm_token).toBeTruthy()
    expect(p.also).toEqual(ALSO)
    const blind = await preview(evUser, f.eid)
    expect(blind.will_delete.voided_payments).toBe(0)
    expect(blind.also).toEqual(ALSO)
    expect(await exists(f.eid)).toBe(true)
    expect((await call(admin, "delete_event", { event_id: f.eid, confirm_token: p.confirm_token })).ok).toBe(true)
    expect(await exists(f.eid)).toBe(false)
    expect((await testSql!`select count(*)::int n from public.payments where participant_id = ${f.pid}`)[0]!.n).toBe(0)
  } finally { await dropFixture(f) }
})

test.skipIf(!testSql)("delete_event: a token of user A used by admin B is refused; a token for event 1 on event 2 is refused", async () => {
  const [f1, f2] = [await delFixture("DelX1"), await delFixture("DelX2")]
  try {
    const t1 = (await preview(evUser, f1.eid)).confirm_token!
    expect(await call(admin, "delete_event", { event_id: f1.eid, confirm_token: t1 })).toEqual({ ok: false, error: BADTOKEN })
    expect(await call(evUser, "delete_event", { event_id: f2.eid, confirm_token: t1 })).toEqual({ ok: false, error: BADTOKEN })
    expect(await call(evUser, "delete_event", { event_id: f1.eid, confirm_token: "x.y" })).toEqual({ ok: false, error: BADTOKEN })
    expect(await call(evUser, "delete_event", { event_id: f1.eid, confirm_token: await confirmToken("delete_event", evUser, f1.eid, Date.now() - 700_000) })).toEqual({ ok: false, error: BADTOKEN })
    expect(await exists(f1.eid)).toBe(true)
    expect(await exists(f2.eid)).toBe(true)
  } finally { await dropFixture(f1); await dropFixture(f2) }
})

test.skipIf(!testSql)("delete_event with a valid token removes the event, its tariffs, participants and tasks, detaches the expense; a replay is Tadbir topilmadi", async () => {
  const f = await delFixture("DelOk")
  const t = (await preview(evUser, f.eid)).confirm_token!
  const r = await call(evUser, "delete_event", { event_id: f.eid, confirm_token: t })
  expect(r).toEqual({ ok: true, data: { deleted: true, name: nm("DelOk") } })
  expect(await exists(f.eid)).toBe(false)
  for (const tbl of ["event_tariffs", "event_participants", "tasks"] as const)
    expect((await testSql!`select count(*)::int n from ${testSql!(`public.${tbl}`)} where event_id = ${f.eid}`)[0]!.n).toBe(0)
  const [x] = await testSql!`select event_id from public.expenses where id = ${f.xid}`
  expect(x!.event_id).toBeNull()
  expect(await call(evUser, "delete_event", { event_id: f.eid, confirm_token: t })).toEqual({ ok: false, error: "Tadbir topilmadi" })
  expect(await call(evUser, "delete_event", { event_id: f.eid })).toEqual({ ok: false, error: "Tadbir topilmadi" })
})

test.skipIf(!testSql)("delete_event: a live payment blocks the preview token for an admin; a hand-made token meets the DB guard and the event stays", async () => {
  const f = await delFixture("DelPay", true)
  try {
    const p = await preview(admin, f.eid)
    expect(p.blocked_by_payments).toBe(1)
    expect(p.confirm_token).toBeUndefined()
    expect(p.expires_in).toBeUndefined()
    expect(p.next).toContain("Moliya")
    const forged = await confirmToken("delete_event", admin, f.eid)
    expect(await call(admin, "delete_event", { event_id: f.eid, confirm_token: forged })).toEqual({ ok: false, error: "Tadbirda to'lovi bor ishtirokchilar bor — avval Moliyada to'lovlarni qaytaring yoki bekor qiling" })
    expect(await exists(f.eid)).toBe(true)
    expect((await testSql!`select count(*)::int n from public.event_participants where event_id = ${f.eid}`)[0]!.n).toBe(1)
  } finally { await dropFixture(f) }
})

test.skipIf(!testSql)("delete_event: a Tadbirlar user without Moliya cannot see the payment, gets a token, and the DB guard still refuses the delete", async () => {
  const f = await delFixture("DelBlind", true)
  try {
    const p = await preview(evUser, f.eid)
    expect(p.blocked_by_payments).toBe(0)
    expect(p.confirm_token).toBeTruthy()
    expect(await call(evUser, "delete_event", { event_id: f.eid, confirm_token: p.confirm_token })).toEqual({ ok: false, error: "Tadbirda to'lovi bor ishtirokchilar bor — avval Moliyada to'lovlarni qaytaring yoki bekor qiling" })
    expect(await exists(f.eid)).toBe(true)
  } finally { await dropFixture(f) }
})

test.skipIf(!testSql)("delete_event: unknown event is Tadbir topilmadi on both paths", async () => {
  const e = id()
  expect(await call(admin, "delete_event", { event_id: e })).toEqual({ ok: false, error: "Tadbir topilmadi" })
  expect(await call(admin, "delete_event", { event_id: e, confirm_token: await confirmToken("delete_event", admin, e) })).toEqual({ ok: false, error: "Tadbir topilmadi" })
})

test.skipIf(!testSql)("delete_event with JWT_SECRET unset refuses both paths and deletes nothing", async () => {
  const f = await delFixture("DelNoSecret")
  const t = (await preview(admin, f.eid)).confirm_token!
  delete process.env.JWT_SECRET
  try {
    expect(await call(admin, "delete_event", { event_id: f.eid })).toEqual({ ok: false, error: "O'chirish hozircha sozlanmagan" })
    expect(await call(admin, "delete_event", { event_id: f.eid, confirm_token: t })).toEqual({ ok: false, error: "O'chirish hozircha sozlanmagan" })
    expect(await exists(f.eid)).toBe(true)
  } finally { process.env.JWT_SECRET = "delete-event-test-secret"; await dropFixture(f) }
})

// ─── copy_event_tasks / enroll_participant / link_pipeline ───
const mkEvent = async (s: string) => {
  const eid = id()
  await testSql!`insert into public.events (id, name, date, manager_id) values (${eid}, ${nm(s)}, now(), ${mgr})`
  return eid
}
const mkTariff = async (eid: string, price: number) => {
  const tid = id()
  await testSql!`insert into public.event_tariffs (id, event_id, name, price, sort_order) values (${tid}, ${eid}, 'Std', ${price}, 1)`
  return tid
}
const newPhone = () => `+99891${String(Math.floor(Math.random() * 9000000) + 1000000)}`
const t5Clients: string[] = []
const t5Pipelines: string[] = []
const t5Phones: string[] = []
afterAll(async () => {
  if (!testSql) return
  if (t5Phones.length) await testSql`delete from public.clients where phone in ${testSql(t5Phones)}`
  if (t5Clients.length) await testSql`delete from public.clients where id in ${testSql(t5Clients)}`
  if (t5Pipelines.length) await testSql`delete from public.crm_pipelines where id in ${testSql(t5Pipelines)}`
})
const ADMIN_ONLY = "Bu amalni faqat admin bajara oladi"

test.skipIf(!testSql)("the three new tools are writers behind the Tadbirlar gate; link_pipeline is admin only; admin sees twenty", async () => {
  for (const n of ["copy_event_tasks", "enroll_participant", "link_pipeline"]) {
    const t = TOOLS.find((x) => x.name === n)
    expect(t?.write).toBe(true)
    expect(t?.module).toBe("tadbirlar")
    expect(t?.destructive).toBeUndefined()
  }
  expect(TOOLS.find((x) => x.name === "link_pipeline")?.adminOnly).toBe(true)
  expect(TOOLS.find((x) => x.name === "copy_event_tasks")?.adminOnly).toBeUndefined()
  expect(TOOLS.find((x) => x.name === "enroll_participant")?.adminOnly).toBeUndefined()
  const d = TOOLS.find((x) => x.name === "enroll_participant")!.description
  expect(d).toContain("debt")
  expect(d).toContain("no payment")
  expect(d).toContain("reference")
  expect(TOOLS.length).toBe(20)
  const [e1, e2] = [await mkEvent("Gt1"), await mkEvent("Gt2")]
  expect(await call(seller, "copy_event_tasks", { from_event_id: e1, to_event_id: e2 })).toEqual({ ok: false, error: GATE })
  expect(await call(seller, "enroll_participant", { event_id: e1, client_id: clientA })).toEqual({ ok: false, error: GATE })
  expect(await call(seller, "link_pipeline", { pipeline_id: pipelineId, event_id: null })).toEqual({ ok: false, error: GATE })
})

test.skipIf(!testSql)("copy_event_tasks: copies with a count; same id, unknown event, and a target with tasks are refused until add_anyway", async () => {
  const [from, to] = [await mkEvent("Cp1"), await mkEvent("Cp2")]
  await testSql!`insert into public.tasks (event_id, title, sort_order) values (${from}, 'A', 1), (${from}, 'B', 2)`
  expect(await call(evUser, "copy_event_tasks", { from_event_id: from, to_event_id: from })).toEqual({ ok: false, error: "Bir xil tadbir tanlandi" })
  expect(await call(evUser, "copy_event_tasks", { from_event_id: from, to_event_id: id() })).toEqual({ ok: false, error: "Tadbir topilmadi" })
  expect(await call(evUser, "copy_event_tasks", { from_event_id: id(), to_event_id: to })).toEqual({ ok: false, error: "Tadbir topilmadi" })
  expect(await call(evUser, "copy_event_tasks", { from_event_id: from, to_event_id: to })).toEqual({ ok: true, data: { copied: 2 } })
  expect((await testSql!`select count(*)::int n from public.tasks where event_id = ${to}`)[0]!.n).toBe(2)
  expect(await call(evUser, "copy_event_tasks", { from_event_id: from, to_event_id: to })).toEqual({ ok: false, error: "Bu tadbirda allaqachon 2 ta vazifa bor. Baribir qo'shish uchun add_anyway: true bilan chaqiring" })
  expect((await testSql!`select count(*)::int n from public.tasks where event_id = ${to}`)[0]!.n).toBe(2)
  expect(await call(evUser, "copy_event_tasks", { from_event_id: from, to_event_id: to, add_anyway: true })).toEqual({ ok: true, data: { copied: 2 } })
  expect((await testSql!`select count(*)::int n from public.tasks where event_id = ${to}`)[0]!.n).toBe(4)
})

test.skipIf(!testSql)("enroll_participant: an existing client by id copies the tariff's price and seller, no money moves", async () => {
  const ev = await mkEvent("En1")
  const tf = await mkTariff(ev, 175)
  const c = id(); t5Clients.push(c)
  await testSql!`insert into public.clients (id, full_name, phone) values (${c}, 'Zuhra Enrol', null)`
  const r = await call(evUser, "enroll_participant", { event_id: ev, tariff_id: tf, seller_id: sell2, client_id: c })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  const d = r.data as { participant_id: string; full_name: string; tariff: string; seller: string }
  expect(d.full_name).toBe("Zuhra Enrol")
  expect(d.tariff).toBe("Std")
  expect(d.seller).toContain("Fixture")
  expect(Object.keys(d).sort()).toEqual(["full_name", "participant_id", "seller", "tariff"])
  const [p] = await testSql!`select contact_id, tariff_id, seller_id, price::float pr, paid::float pd from public.event_participants where id = ${d.participant_id}`
  expect(p).toMatchObject({ contact_id: c, tariff_id: tf, seller_id: sell2, pr: 175, pd: 0 })
  expect((await testSql!`select count(*)::int n from public.payments where participant_id = ${d.participant_id}`)[0]!.n).toBe(0)
  // no seller → Belgilanmagan (null)
  const c2 = id(); t5Clients.push(c2)
  await testSql!`insert into public.clients (id, full_name) values (${c2}, 'Bez Sotuvchi')`
  const r2 = await call(evUser, "enroll_participant", { event_id: ev, tariff_id: tf, client_id: c2 })
  expect(r2.ok).toBe(true)
  if (r2.ok) expect((r2.data as { seller: string | null }).seller).toBeNull()
  // already enrolled
  expect(await call(evUser, "enroll_participant", { event_id: ev, tariff_id: tf, client_id: c })).toEqual({ ok: false, error: "Bu mijoz allaqachon ushbu tadbirga qo'shilgan" })
})

test.skipIf(!testSql)("enroll_participant: a new client by name + phone is created; the same phone again names the existing client and creates no second one", async () => {
  const ev = await mkEvent("En2")
  const tf = await mkTariff(ev, 90)
  const phone = newPhone(); t5Phones.push(phone)
  const r = await call(evUser, "enroll_participant", { event_id: ev, tariff_id: tf, full_name: "Yangi Odam", phone })
  expect(r.ok).toBe(true)
  const rows = await testSql!`select id, full_name from public.clients where phone = ${phone}`
  expect(rows).toHaveLength(1)
  expect(rows[0]!.full_name).toBe("Yangi Odam")
  const ev2 = await mkEvent("En2b")
  const tf2 = await mkTariff(ev2, 90)
  const again = await call(evUser, "enroll_participant", { event_id: ev2, tariff_id: tf2, full_name: "Boshqa Ism", phone })
  expect(again).toEqual({ ok: false, error: `Bu telefon raqami bilan mijoz bor: Yangi Odam. Shu mijozni yozish uchun client_id: ${rows[0]!.id} bilan qayta chaqiring` })
  expect((await testSql!`select count(*)::int n from public.clients where phone = ${phone}`)[0]!.n).toBe(1)
  expect((await testSql!`select count(*)::int n from public.event_participants where event_id = ${ev2}`)[0]!.n).toBe(0)
})

test.skipIf(!testSql)("enroll_participant: the web's texts for another event's tariff, a non-Sotuv seller, a missing tariff, no price, an unknown client, a bad phone", async () => {
  const [ev, other] = [await mkEvent("En3"), await mkEvent("En3o")]
  const tfOther = await mkTariff(other, 10)
  const tf = await mkTariff(ev, 10)
  const c = id(); t5Clients.push(c)
  await testSql!`insert into public.clients (id, full_name) values (${c}, 'Matn Tekshiruv')`
  const err = async (a: Record<string, unknown>) => (await call(evUser, "enroll_participant", a) as { ok: false; error: string }).error
  expect(await err({ event_id: ev, tariff_id: tfOther, client_id: c })).toBe("Tarif bu tadbirga tegishli emas")
  expect(await err({ event_id: ev, tariff_id: tf, seller_id: mgr, client_id: c })).toBe("Sotuvchi Sotuv bo'limining faol hodimi bo'lishi kerak")
  expect(await err({ event_id: ev, client_id: c })).toBe("Bu tadbirda tariflar bor — tarifni tanlang")
  expect(await err({ event_id: other, client_id: c, tariff_id: undefined })).toBe("Bu tadbirda tariflar bor — tarifni tanlang")
  const bare = await mkEvent("En3n")
  expect(await err({ event_id: bare, client_id: c })).toBe("Kelishilgan narxni kiriting")
  expect(await err({ event_id: ev, tariff_id: tf, client_id: id() })).toBe("Mijoz topilmadi")
  expect(await err({ event_id: ev, tariff_id: tf, full_name: "Xato Telefon", phone: "12" })).toBe("Ism va to'g'ri telefon raqamni kiriting")
  // an event with no tariffs takes an individual price
  const ok = await call(evUser, "enroll_participant", { event_id: bare, client_id: c, price: 42 })
  expect(ok.ok).toBe(true)
  if (ok.ok) {
    const [p] = await testSql!`select price::float pr, tariff_id from public.event_participants where id = ${(ok.data as { participant_id: string }).participant_id}`
    expect(p).toMatchObject({ pr: 42, tariff_id: null })
    expect((ok.data as { tariff: string | null }).tariff).toBeNull()
  }
})

test.skipIf(!testSql)("enroll_participant: client_id together with name/phone, neither, or only one of name/phone is refused before any SQL", async () => {
  const ev = await mkEvent("En4")
  const tf = await mkTariff(ev, 10)
  const phone = newPhone(); t5Phones.push(phone)
  for (const a of [
    { client_id: clientB, full_name: "X Y", phone },
    { client_id: clientB, full_name: "X Y" },
    {},
    { full_name: "Faqat Ism" },
    { phone },
  ]) {
    const r = await call(evUser, "enroll_participant", { event_id: ev, tariff_id: tf, ...a })
    expect(r.ok).toBe(false)
  }
  expect((await testSql!`select count(*)::int n from public.event_participants where event_id = ${ev}`)[0]!.n).toBe(0)
  expect((await testSql!`select count(*)::int n from public.clients where phone = ${phone} or full_name in ('Faqat Ism', 'X Y')`)[0]!.n).toBe(0)
})

test.skipIf(!testSql)("enroll_participant: a failure after the new client was inserted leaves no client behind", async () => {
  const ev = await mkEvent("En5")
  const tf = await mkTariff(ev, 10)
  const phone = newPhone(); t5Phones.push(phone)
  const marker = `bomb-${crypto.randomUUID()}`
  await withBomb("event_participants", "full_name", marker, async () => {
    const r = await call(evUser, "enroll_participant", { event_id: ev, tariff_id: tf, full_name: marker, phone })
    expect(r.ok).toBe(false)
  })
  expect((await testSql!`select count(*)::int n from public.clients where phone = ${phone}`)[0]!.n).toBe(0)
  expect((await testSql!`select count(*)::int n from public.event_participants where event_id = ${ev}`)[0]!.n).toBe(0)
})

test.skipIf(!testSql)("link_pipeline: an admin sets and clears the event; a non-admin with Tadbirlar is refused and nothing changes; unknown ids", async () => {
  const pid = id(); t5Pipelines.push(pid)
  await testSql!`insert into public.crm_pipelines (id, name) values (${pid}, ${nm("Link")})`
  const ev = await mkEvent("Lk1")
  const cur = async () => (await testSql!`select event_id from public.crm_pipelines where id = ${pid}`)[0]!.event_id as string | null
  expect(await call(evUser, "link_pipeline", { pipeline_id: pid, event_id: ev })).toEqual({ ok: false, error: ADMIN_ONLY })
  expect(await cur()).toBeNull()
  expect(await call(admin, "link_pipeline", { pipeline_id: pid, event_id: ev })).toEqual({ ok: true, data: { pipeline: { id: pid, name: nm("Link") }, event: { id: ev, name: nm("Lk1") } } })
  expect(await cur()).toBe(ev)
  expect(await call(evUser, "link_pipeline", { pipeline_id: pid, event_id: null })).toEqual({ ok: false, error: ADMIN_ONLY })
  expect(await cur()).toBe(ev)
  expect(await call(admin, "link_pipeline", { pipeline_id: pid, event_id: null })).toEqual({ ok: true, data: { pipeline: { id: pid, name: nm("Link") }, event: null } })
  expect(await cur()).toBeNull()
  expect(await call(admin, "link_pipeline", { pipeline_id: id(), event_id: ev })).toEqual({ ok: false, error: "Voronka topilmadi" })
  expect(await call(admin, "link_pipeline", { pipeline_id: pid, event_id: id() })).toEqual({ ok: false, error: "Tadbir topilmadi" })
  expect(await cur()).toBeNull()
})

// ─── export_stickers / export_signs ───
const savedBase = process.env.MCP_PUBLIC_URL
beforeAll(() => { process.env.MCP_PUBLIC_URL = "https://x.test" })
afterAll(() => { if (savedBase === undefined) delete process.env.MCP_PUBLIC_URL; else process.env.MCP_PUBLIC_URL = savedBase })
type Export = { url: string; file: string; pages: number; count: number; expires_in: number }
const exp = async (uid: string, name: string, args: unknown) => {
  const r = await call(uid, name, args)
  if (!r.ok) throw new Error(r.error)
  return r.data as Export
}

test.skipIf(!testSql)("export_stickers: event participants plus extra names make one downloadable PDF", async () => {
  const r = await exp(evUser, "export_stickers", { style: "onyx", event_id: eventId, names: ["Mehmon Bir"] })
  expect(r).toMatchObject({ count: 3, pages: 1, expires_in: 900 })
  expect(r.file.endsWith("_stikerlar.pdf")).toBe(true)
  expect(r.url.startsWith("https://x.test/mcp/files/")).toBe(true)
  const res = await handleConnector(new Request(r.url), testSql!, new URL(r.url))
  expect(res.status).toBe(200)
  expect(res.headers.get("content-type")).toBe("application/pdf")
  expect(res.headers.get("content-disposition")).toContain("attachment")
  expect(res.headers.get("content-disposition")).toContain("_stikerlar.pdf")
  expect(res.headers.get("cache-control")).toBe("no-store")
  expect(new TextDecoder().decode((await res.arrayBuffer()).slice(0, 5))).toBe("%PDF-")
})

test.skipIf(!testSql)("export_stickers: names only need a caption, which names the file; empty, too many, bad style, unknown event, no module", async () => {
  expect(await call(evUser, "export_stickers", { style: "linen", names: ["A B"] })).toEqual({ ok: false, error: "Stiker uchun yozuv (caption) kerak" })
  const r = await exp(evUser, "export_stickers", { style: "linen", names: ["A B"], caption: "Biznes kecha 2.0" })
  expect(r.file).toBe("Biznes_kecha_2_0_stikerlar.pdf")
  expect(await call(evUser, "export_stickers", { style: "linen", caption: "X" })).toEqual({ ok: false, error: "Stiker uchun ism yo'q" })
  const many = await call(evUser, "export_stickers", { style: "linen", caption: "X", names: Array.from({ length: 601 }, (_, i) => `N${i}`) })
  expect(many.ok).toBe(false)
  const ev600 = await call(evUser, "export_stickers", { style: "linen", event_id: eventId, caption: "X", names: Array.from({ length: 599 }, (_, i) => `N${i}`) })
  expect(ev600).toEqual({ ok: false, error: "Stikerlar soni 600 tadan oshmasin" })
  const bad = await call(evUser, "export_stickers", { style: "neon", names: ["A"], caption: "X" })
  expect(bad.ok).toBe(false)
  if (!bad.ok) expect(bad.error).toContain("style")
  expect(await call(evUser, "export_stickers", { style: "onyx", event_id: id() })).toEqual({ ok: false, error: "Tadbir topilmadi" })
  expect(await call(seller, "export_stickers", { style: "onyx", names: ["A"], caption: "X" })).toEqual({ ok: false, error: GATE })
  expect(await call(seller, "export_signs", { style: "signal", signs: [{ place: "Zal", direction: "left" }] })).toEqual({ ok: false, error: GATE })
})

test.skipIf(!testSql)("export_stickers: a very long event name gives a file base of at most 80 characters", async () => {
  const eid = id(), long = `${"Uzun ".repeat(60)}${tag}`.slice(0, 300)
  delEvents.push(eid)
  await testSql!`insert into public.events (id, name, date, manager_id) values (${eid}, ${long}, now(), ${mgr})`
  try {
    const r = await exp(evUser, "export_stickers", { style: "onyx", event_id: eid, names: ["A B"] })
    expect(r.file.length).toBeLessThanOrEqual(80 + "_stikerlar.pdf".length)
    expect(r.file.endsWith("_stikerlar.pdf")).toBe(true)
  } finally {
    await testSql!`delete from public.events where id = ${eid}`
  }
})

test.skipIf(!testSql)("export_signs: two per sheet, file named from the event or navigatsiya; bad direction and unknown event fail", async () => {
  const signs = [{ place: "Zal", direction: "left" }, { place: "Kofe", direction: "up-right" }, { place: "WC", direction: "both" }]
  const r = await exp(evUser, "export_signs", { style: "ember", signs })
  expect(r).toMatchObject({ pages: 2, count: 3, file: "navigatsiya.pdf", expires_in: 900 })
  const e = await exp(evUser, "export_signs", { style: "signal", signs, event_id: eventId })
  expect(e.file).toBe(`Fixture_${tag}_navigatsiya.pdf`)
  const bad = await call(evUser, "export_signs", { style: "signal", signs: [{ place: "Zal", direction: "sideways" }] })
  expect(bad.ok).toBe(false)
  if (!bad.ok) expect(bad.error).toContain("direction")
  expect(await call(evUser, "export_signs", { style: "signal", signs, event_id: id() })).toEqual({ ok: false, error: "Tadbir topilmadi" })
  expect(await call(evUser, "export_signs", { style: "signal", signs: [{ place: "   ", direction: "left" }] })).toMatchObject({ ok: false })
})

test.skipIf(!testSql)("the export tools are read-only tools behind the Tadbirlar gate", () => {
  for (const n of ["export_stickers", "export_signs"]) {
    const t = TOOLS.find((x) => x.name === n)
    expect(t?.write).toBeUndefined()
    expect(t?.module).toBe("tadbirlar")
  }
})
