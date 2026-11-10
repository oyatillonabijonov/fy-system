import { afterAll, beforeAll, expect, test } from "bun:test"
import { makeAsUser } from "./db"
import { staff, testSql } from "./testdb"

const url = process.env.TEST_DATABASE_URL
const asUser = makeAsUser(url ?? "postgres://unused")
const created: string[] = []
const [eventId, clientId, partId] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
let admin = ""
let seller = ""

beforeAll(async () => {
  if (!testSql) return
  admin = await staff(testSql, { role: "admin" }); created.push(admin)
  seller = await staff(testSql, { modules: ["dashboard", "sotuv-crmn"] }); created.push(seller)
  await testSql`insert into public.events (id, name, date) values (${eventId}, 'Fixture event', now())`
  await testSql`insert into public.clients (id, full_name) values (${clientId}, 'Fixture client')`
  await testSql`insert into public.event_participants (id, event_id, contact_id, full_name, price, paid) values (${partId}, ${eventId}, ${clientId}, 'Fixture client', 1000, 0)`
  await testSql`insert into public.payments (participant_id, amount, method) values (${partId}, 100, 'naqd')`
})
afterAll(async () => {
  await asUser.end()
  if (testSql) {
    await testSql`delete from public.payments where participant_id = ${partId}`
    await testSql`delete from public.event_participants where id = ${partId}`
    await testSql`delete from public.clients where id = ${clientId}`
    await testSql`delete from public.events where id = ${eventId}`
    if (created.length) {
      await testSql`delete from public.profiles where id in ${testSql(created)}`
      await testSql`delete from auth.users where id in ${testSql(created)}`
    }
  }
})

test.skipIf(!testSql)("the transaction runs as the user, with the API role", async () => {
  const [r] = await asUser(seller, (tx) => tx`select auth.uid()::text as uid, current_user as role`)
  expect(r).toEqual({ uid: seller, role: "authenticated" })
})

test.skipIf(!testSql)("RLS applies: a seller sees no payments, an admin sees them", async () => {
  expect((await asUser(seller, (tx) => tx`select count(*)::int as n from public.payments`))[0]!.n).toBe(0)
  expect((await asUser(admin, (tx) => tx`select count(*)::int as n from public.payments`))[0]!.n).toBeGreaterThan(0)
})

test.skipIf(!testSql)("read-only: a write is refused", async () => {
  await expect(asUser(admin, (tx) => tx`update public.profiles set full_name = 'x' where id = ${admin}`)).rejects.toThrow(/read-only/)
})

test.skipIf(!testSql)("nothing leaks: the owner stays the owner, and every user sees only themselves, even interleaved", async () => {
  await asUser(admin, (tx) => tx`select 1`)
  const [owner] = await testSql!`select current_user as u`
  expect(owner!.u).toBe("postgres")
  const seen = await Promise.all(Array.from({ length: 8 }, (_, i) => {
    const uid = i % 2 ? seller : admin
    return asUser(uid, (tx) => tx`select auth.uid()::text as uid, current_user as role`).then((r) => ({ uid, got: r[0]! }))
  }))
  for (const s of seen) expect(s.got).toEqual({ uid: s.uid, role: "authenticated" })
  const [after] = await testSql!`select current_user as u`
  expect(after!.u).toBe("postgres")
})

test.skipIf(!testSql)("an error in the callback rejects, and the next call is clean and itself", async () => {
  await expect(asUser(admin, async (tx) => { await tx`select 1`; throw new Error("boom") })).rejects.toThrow("boom")
  const [r] = await asUser(seller, (tx) => tx`select auth.uid()::text as uid, current_user as role`)
  expect(r).toEqual({ uid: seller, role: "authenticated" })
})

test("a uid that is not a UUID never reaches SQL", async () => {
  let ran = false
  await expect(asUser("x'; drop table profiles; --", async (tx) => { ran = true; return tx`select 1` })).rejects.toThrow()
  expect(ran).toBe(false)
})
