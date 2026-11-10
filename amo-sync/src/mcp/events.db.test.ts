import { afterAll, beforeAll, expect, test } from "bun:test"
import { makeAsUser } from "./db"
import { staff, testSql } from "./testdb"
import { callTool } from "./tools"

const asUser = makeAsUser(process.env.TEST_DATABASE_URL ?? "postgres://unused")
const created: string[] = []
const id = () => crypto.randomUUID()
const [eventId, tariffA, tariffB, clientA, clientB, partA, partB, taskId, pipelineId] = [id(), id(), id(), id(), id(), id(), id(), id(), id()]
const tag = crypto.randomUUID().slice(0, 8)
const nameA = `Zaynab ${tag}`
const phoneA = `+99890${String(Math.floor(Math.random() * 9000000) + 1000000)}`
let admin = "", evUser = "", seller = "", mgr = "", sell2 = ""

beforeAll(async () => {
  if (!testSql) return
  admin = await staff(testSql, { role: "admin" }); created.push(admin)
  evUser = await staff(testSql, { modules: ["tadbirlar"] }); created.push(evUser)
  seller = await staff(testSql, { modules: ["dashboard", "sotuv-crmn"] }); created.push(seller)
  mgr = await staff(testSql, {}); created.push(mgr)
  sell2 = await staff(testSql, { department: "sotuv" }); created.push(sell2)
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
    await testSql`delete from public.crm_pipelines where id = ${pipelineId}`
    await testSql`delete from public.tasks where id = ${taskId}`
    await testSql`delete from public.event_participants where id in (${partA}, ${partB})`
    await testSql`delete from public.event_tariffs where event_id = ${eventId}`
    await testSql`delete from public.clients where id in (${clientA}, ${clientB})`
    await testSql`delete from public.events where id = ${eventId}`
    if (created.length) {
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
