import { afterAll, beforeAll, expect, test } from "bun:test"
import { makeAsUser } from "./db"
import { staff, testSql } from "./testdb"
import { handleMcp } from "./server"
import { openConnection } from "./store"
import { callTool, TOOLS } from "./tools"

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

test.skipIf(!testSql)("create_event and update_event are writers behind the Tadbirlar gate; admin sees fourteen tools", async () => {
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

test.skipIf(!testSql)("create_event: a failure inside the database after the insert (unknown copy_tasks_from) leaves nothing", async () => {
  const before = await count()
  expect(await call(admin, "create_event", base("Tx1", { copy_tasks_from: id() }))).toEqual({ ok: false, error: "Nusxa olinadigan tadbir topilmadi" })
  expect(await count()).toBe(before)
  expect((await testSql!`select count(*)::int n from public.event_tariffs t join public.events e on e.id = t.event_id where e.name = ${nm("Tx1")}`)[0]!.n).toBe(0)
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
    await tx`insert into public.clients (id, full_name, phone) values (${fmt}, ${`Legacy ${tag}`}, '+7 (912) 345-67-89'), (${short}, ${`Qwerty ${tag}`}, '+7 (912) 111-22-33')`
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
