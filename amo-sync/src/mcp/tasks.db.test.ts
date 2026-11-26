import { afterAll, beforeAll, expect, test } from "bun:test"
import { makeAsUser } from "./db"
import { staff, testSql } from "./testdb"
import { callTool, TOOLS } from "./tools"

const asUser = makeAsUser(process.env.TEST_DATABASE_URL ?? "postgres://unused")
const created: string[] = []
const eventId = crypto.randomUUID()
const T = { mine: crypto.randomUUID(), later: crypto.randomUUID(), nodue: crypto.randomUUID(), done: crypto.randomUUID(), failed: crypto.randomUUID(), others: crypto.randomUUID() }
let a = "", b = "", gone = ""

type Task = { id: string; title: string; section: string | null; status: string; due_date: string | null; due_time: string | null
  event: { id: string; name: string } | null; project: unknown; assigned_by: { id: string; name: string } | null
  updated_at: string; completed_at: string | null; completed_by: { id: string; name: string } | null; last_comment: string | null; already_done?: boolean }
const call = async <D>(uid: string, name: string, args: object) => {
  const r = await callTool(asUser, uid, name, args)
  if (!r.ok) throw new Error(r.error)
  return r.data as D
}
const mine = (uid: string, args: object = {}) => call<{ total: number; tasks: Task[] }>(uid, "my_tasks", args)
const row = async (id: string) => (await testSql!`select status, completed_by, completed_at from public.tasks where id = ${id}`)[0]!

beforeAll(async () => {
  if (!testSql) return
  a = await staff(testSql, {}); b = await staff(testSql, {}); gone = await staff(testSql, { active: false }); created.push(a, b, gone)
  await testSql`insert into public.events (id, name, date) values (${eventId}, 'Vazifa tadbiri', now())`
  await testSql`insert into public.tasks (id, title, section, status, assignee_id, created_by, event_id, due_date, due_time) values
    (${T.mine}, 'Zalni band qilish', 'Zal', 'in_progress', ${a}, ${b}, ${eventId}, '2031-05-10', '14:30'),
    (${T.later}, 'Keyinroq', null, 'todo', ${a}, ${a}, ${eventId}, '2031-06-01', null),
    (${T.nodue}, 'Muddatsiz', null, 'todo', ${a}, null, null, null, null),
    (${T.done}, 'Bajarilgan', null, 'done', ${a}, ${a}, ${eventId}, '2031-05-11', null),
    (${T.failed}, 'Bajarilmadi', null, 'failed', ${a}, ${a}, ${eventId}, null, null),
    (${T.others}, 'Boshqaniki', null, 'todo', ${b}, ${a}, ${eventId}, '2031-05-10', null)`
  await testSql`insert into public.task_comments (task_id, author_id, body, created_at) values
    (${T.mine}, ${b}, 'eski izoh', now() - interval '1 hour'), (${T.mine}, ${b}, 'oxirgi izoh', now())`
})
afterAll(async () => {
  await asUser.end()
  if (!testSql) return
  await testSql`delete from public.tasks where id in ${testSql(Object.values(T))}`
  await testSql`delete from public.events where id = ${eventId}`
  await testSql`delete from public.mcp_calls where user_id in ${testSql(created)}`
  await testSql`delete from public.profiles where id in ${testSql(created)}`
  await testSql`delete from auth.users where id in ${testSql(created)}`
})

test.skipIf(!testSql)("my_tasks: the caller's open tasks, nearest deadline first, with event, who assigned and the last comment", async () => {
  const r = await mine(a)
  expect(r.total).toBe(3)
  expect(r.tasks.map((t) => t.id)).toEqual([T.mine, T.later, T.nodue])
  const t = r.tasks[0]!
  expect(t).toMatchObject({ title: "Zalni band qilish", section: "Zal", status: "in_progress", due_date: "2031-05-10", due_time: "14:30",
    event: { id: eventId, name: "Vazifa tadbiri" }, project: null, completed_at: null, completed_by: null, last_comment: "oxirgi izoh" })
  expect(t.assigned_by!.id).toBe(b)
  expect(t.updated_at).toBeTruthy()
  expect(r.tasks[2]).toMatchObject({ event: null, assigned_by: null, due_date: null, last_comment: null })
  expect("total" in t).toBe(false)
})

test.skipIf(!testSql)("my_tasks filters: status, deadline range, updated_since, another person, paging", async () => {
  expect((await mine(a, { status: "done" })).tasks.map((t) => t.id)).toEqual([T.done])
  expect((await mine(a, { status: "all" })).total).toBe(5)
  expect((await mine(a, { due_from: "2031-05-01", due_to: "2031-05-31" })).tasks.map((t) => t.id)).toEqual([T.mine])
  expect((await mine(a, { status: "all", due_from: "2031-05-11" })).tasks.map((t) => t.id)).toEqual([T.done, T.later])
  expect((await mine(a, { updated_since: "2099-01-01T00:00:00+05:00" })).total).toBe(0)
  expect((await mine(a, { updated_since: "2020-01-01T00:00:00Z" })).total).toBe(3)
  expect((await mine(a, { assignee_id: b })).tasks.map((t) => t.id)).toEqual([T.others])
  const page = await mine(a, { limit: 1, offset: 1 })
  expect(page.total).toBe(3)
  expect(page.tasks.map((t) => t.id)).toEqual([T.later])
  const bad = await callTool(asUser, a, "my_tasks", { updated_since: "kecha" })
  expect(bad.ok).toBe(false)
})

test.skipIf(!testSql)("complete_task: done, who and when recorded, gone from the open list; a second call changes nothing", async () => {
  const t = await call<Task>(a, "complete_task", { task_id: T.mine })
  expect(t).toMatchObject({ id: T.mine, status: "done", already_done: false })
  expect(t.completed_by!.id).toBe(a)
  expect(t.completed_at).toBeTruthy()
  expect((await mine(a)).tasks.map((x) => x.id)).toEqual([T.later, T.nodue])
  expect((await mine(a, { status: "done" })).tasks.map((x) => x.id)).toContain(T.mine)
  const first = await row(T.mine)
  const again = await call<Task>(b, "complete_task", { task_id: T.mine })
  expect(again.already_done).toBe(true)
  expect(again.completed_by!.id).toBe(a)
  expect((await row(T.mine)).completed_at).toEqual(first.completed_at)
})

test.skipIf(!testSql)("reopen_task: a done task is open again and nobody is recorded; only a done task can be reopened", async () => {
  const t = await call<Task>(b, "reopen_task", { task_id: T.mine })
  expect(t).toMatchObject({ id: T.mine, status: "todo", completed_at: null, completed_by: null })
  expect((await mine(a)).tasks.map((x) => x.id)).toContain(T.mine)
  const twice = await callTool(asUser, b, "reopen_task", { task_id: T.mine })
  expect(twice).toEqual({ ok: false, error: "Bu vazifa bajarilgan deb belgilanmagan (holati: todo)" })
  expect(await callTool(asUser, a, "reopen_task", { task_id: T.failed })).toMatchObject({ ok: false })
  expect((await row(T.failed)).status).toBe("failed")
})

test.skipIf(!testSql)("an unknown task is an error; a deactivated staff member changes nothing", async () => {
  expect(await callTool(asUser, a, "complete_task", { task_id: crypto.randomUUID() })).toEqual({ ok: false, error: "Vazifa topilmadi" })
  expect(await callTool(asUser, a, "complete_task", { task_id: "not-a-uuid" })).toMatchObject({ ok: false })
  expect((await callTool(asUser, gone, "complete_task", { task_id: T.later })).ok).toBe(false)
  expect((await callTool(asUser, gone, "reopen_task", { task_id: T.done })).ok).toBe(false)
  expect((await row(T.later)).status).toBe("todo")
  expect((await row(T.done)).status).toBe("done")
  const seen = await callTool(asUser, gone, "my_tasks", { assignee_id: a })
  expect(seen.ok && (seen.data as { total: number }).total).toBeFalsy()
})

test("there is no tool that deletes a task", () => {
  expect(TOOLS.filter((t) => /task/.test(t.name)).map((t) => t.name).sort()).toEqual(["complete_task", "copy_event_tasks", "my_tasks", "reopen_task"])
})
