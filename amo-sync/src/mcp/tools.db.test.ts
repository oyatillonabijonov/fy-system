import { afterAll, beforeAll, expect, test } from "bun:test"
import { makeAsUser } from "./db"
import type { AsUser } from "./db"
import { handleMcp } from "./server"
import { openConnection } from "./store"
import { staff, testSql } from "./testdb"
import { callTool, loadMe, toolsFor } from "./tools"

process.env.MCP_PUBLIC_URL ??= "https://x.test"
const asUser = makeAsUser(process.env.TEST_DATABASE_URL ?? "postgres://unused")
const created: string[] = []
const [eventId, clientId, partId] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
const callUuid = `t5-${crypto.randomUUID()}`
let admin = "", sellerA = "", sellerB = ""

beforeAll(async () => {
  if (!testSql) return
  admin = await staff(testSql, { role: "admin" }); created.push(admin)
  sellerA = await staff(testSql, { modules: ["dashboard", "sotuv-crmn"], department: "sotuv" }); created.push(sellerA)
  sellerB = await staff(testSql, { modules: ["dashboard", "sotuv-crmn"], department: "sotuv" }); created.push(sellerB)
  await testSql`insert into public.events (id, name, date) values (${eventId}, 'Fixture event', now())`
  await testSql`insert into public.clients (id, full_name) values (${clientId}, 'Fixture client')`
  await testSql`insert into public.event_participants (id, event_id, contact_id, full_name, price, paid) values (${partId}, ${eventId}, ${clientId}, 'Fixture client', 1000, 0)`
  await testSql`insert into public.payments (participant_id, amount, method) values (${partId}, 100, 'naqd')`
  await testSql`insert into public.crm_calls (uuid, direction, phone, staff_id, client_id, started_at, duration, talk_time)
    values (${callUuid}, 'in', '+998900000555', ${sellerA}, ${clientId}, now() - interval '1 minute', 60, 50)`
  await testSql`insert into public.crm_call_analyses (call_uuid, status, summary, outcome, score, transcript) values (${callUuid}, 'done', 'Fixture summary', 'follow_up', 70, '[]'::jsonb)`
})
afterAll(async () => {
  await asUser.end()
  if (testSql) {
    await testSql`delete from public.crm_calls where uuid = ${callUuid}`
    await testSql`delete from public.payments where participant_id = ${partId}`
    await testSql`delete from public.event_participants where id = ${partId}`
    await testSql`delete from public.clients where id = ${clientId}`
    await testSql`delete from public.events where id = ${eventId}`
    if (created.length) {
      await testSql`delete from public.mcp_calls where user_id in ${testSql(created)}`
      await testSql`delete from public.profiles where id in ${testSql(created)}`
      await testSql`delete from auth.users where id in ${testSql(created)}`
    }
  }
})

const names = (uid: string) => asUser(uid, async (tx) => toolsFor(await loadMe(tx)).map((t) => t.name))

test.skipIf(!testSql)("a seller gets six tools, an admin all nine", async () => {
  expect(await names(sellerA)).toEqual(["whoami", "reference", "sales_stats", "call_analysis_stats", "call_analyses", "call_analysis"])
  expect(await names(admin)).toHaveLength(9)
})

test.skipIf(!testSql)("finance without the module is an explicit error naming it, not zeros; an admin gets numbers", async () => {
  const denied = await callTool(asUser, sellerA, "finance_summary", {})
  expect(denied.ok).toBe(false)
  if (!denied.ok) expect(denied.error).toBe("«Moliya» bo'limiga ruxsatingiz yo'q")
  for (const t of ["debtors", "event_results"]) expect((await callTool(asUser, sellerA, t, {})).ok).toBe(false)
  const r = await callTool(asUser, admin, "finance_summary", {})
  expect(r.ok).toBe(true)
  if (r.ok) expect(Number((r.data as { income: string }).income)).toBeGreaterThan(0)
})

test.skipIf(!testSql)("sales_stats returns the dashboard keys for an admin; a user without the module is refused", async () => {
  const r = await callTool(asUser, admin, "sales_stats", { from: "2026-10-01", to: "2026-10-31" })
  expect(r.ok).toBe(true)
  if (r.ok) for (const k of ["kpi", "funnel", "by_source", "sellers", "calls", "attention"]) expect(r.data).toHaveProperty(k)
  const noModule = await staff(testSql!, { modules: ["sotuv-crmn"] }); created.push(noModule)
  const d = await callTool(asUser, noModule, "sales_stats", { from: "2026-10-01", to: "2026-10-31" })
  expect(d.ok).toBe(false)
  if (!d.ok) expect(d.error).toContain("Dashboard")
})

test.skipIf(!testSql)("a bad date is refused naming the field, before the tool runs", async () => {
  let reachedSql = 0
  const spy = Object.assign(async <T>(uid: string, fn: Parameters<AsUser>[1]): Promise<T> =>
    asUser(uid, (tx) => fn(new Proxy(tx, { apply: (t, th, a) => { reachedSql++; return Reflect.apply(t, th, a) } }) as typeof tx)) as Promise<T>, { end: () => asUser.end() }) as AsUser
  await callTool(spy, admin, "whoami", {})
  const loadOnly = reachedSql   // whoami runs no SQL of its own: this is what loadMe costs
  const r = await callTool(spy, admin, "sales_stats", { from: "2026-13-99", to: "x" })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.error).toContain("from")
  expect(reachedSql - loadOnly).toBe(loadOnly)   // only loadMe ran again, the tool's own query did not
  await callTool(spy, admin, "sales_stats", { from: "2026-10-01", to: "2026-10-31" })
  expect(reachedSql - loadOnly).toBeGreaterThan(2 * loadOnly)
})

test.skipIf(!testSql)("call_analysis: another seller gets 'topilmadi', the owner gets the summary", async () => {
  const b = await callTool(asUser, sellerB, "call_analysis", { call_uuid: callUuid })
  expect(b.ok).toBe(false)
  if (!b.ok) expect(b.error).toContain("topilmadi")
  const a = await callTool(asUser, sellerA, "call_analysis", { call_uuid: callUuid })
  expect(a.ok).toBe(true)
  if (a.ok) expect((a.data as { summary: string }).summary).toBe("Fixture summary")
})

test.skipIf(!testSql)("call_analyses lists the analysed call with names; call_analysis_stats answers", async () => {
  const r = await callTool(asUser, sellerA, "call_analyses", { from: "2020-01-01", to: "2100-01-01" })
  expect(r.ok).toBe(true)
  const row = r.ok ? (r.data as { call_uuid: string; client: string | null; seller: string | null; score: number }[]).find((x) => x.call_uuid === callUuid) : undefined
  expect(row?.score).toBe(70)
  expect(row?.client).toBe("Fixture client")
  expect(row?.seller).toContain("Fixture")
  expect((await callTool(asUser, sellerA, "call_analysis_stats", { from: "2020-01-01", to: "2100-01-01" })).ok).toBe(true)
})

test.skipIf(!testSql)("reference lists pipelines, events and Sotuv sellers; debtors pages with a total; limits are clamped", async () => {
  const r = await callTool(asUser, admin, "reference", {})
  expect(r.ok).toBe(true)
  if (r.ok) {
    const d = r.data as { pipelines: unknown[]; events: { id: string }[]; sellers: { id: string }[] }
    expect(d.events.some((e) => e.id === eventId)).toBe(true)
    expect(d.sellers.some((s) => s.id === sellerA)).toBe(true)
    expect(d.sellers.some((s) => s.id === admin)).toBe(false)
  }
  const debt = await callTool(asUser, admin, "debtors", { event_id: eventId, limit: 1 })
  expect(debt.ok).toBe(true)
  if (debt.ok) expect((debt.data as { total: number; rows: unknown[] }).total).toBe(1)
  expect((await callTool(asUser, admin, "debtors", { limit: 201 })).ok).toBe(false)
})

test.skipIf(!testSql)("an unknown tool is an error; a database error is a result, not a crash", async () => {
  const u = await callTool(asUser, admin, "no_such_tool", {})
  expect(u.ok).toBe(false)
  const bad = await callTool(asUser, admin, "sales_stats", { from: "2026-10-31", to: "2026-10-01" })
  expect(bad.ok).toBe(false)
})

const mcp = (token: string | null, body: unknown) => handleMcp(new Request("https://x.test/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}), testSql!, asUser)

test.skipIf(!testSql)("handleMcp: no token, a bad token and an expired token are 401 with WWW-Authenticate", async () => {
  for (const t of [null, "fya_nope"]) {
    const r = await mcp(t, { jsonrpc: "2.0", id: 1, method: "tools/list" })
    expect(r.status).toBe(401)
    expect(r.headers.get("www-authenticate")).toContain("resource_metadata")
    expect(r.headers.get("cache-control")).toBe("no-store")
  }
  const tok = await openConnection(testSql!, sellerB, "test-client")
  await testSql!`update public.mcp_connections set access_expires_at = now() - interval '1 second' where user_id = ${sellerB}`
  expect((await mcp(tok.access_token, { jsonrpc: "2.0", id: 1, method: "tools/list" })).status).toBe(401)
})

test.skipIf(!testSql)("handleMcp: tools/list shows the caller's six tools; whoami returns the caller and is audited", async () => {
  const tok = (await openConnection(testSql!, sellerA, "test-client")).access_token
  const list = await mcp(tok, { jsonrpc: "2.0", id: 1, method: "tools/list" })
  expect(list.status).toBe(200)
  expect(list.headers.get("cache-control")).toBe("no-store")
  const listed = (await list.json()) as { result: { tools: { name: string; annotations?: { readOnlyHint?: boolean } }[] } }
  expect(listed.result.tools.map((t) => t.name).sort()).toEqual(["call_analyses", "call_analysis", "call_analysis_stats", "reference", "sales_stats", "whoami"])
  expect(listed.result.tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true)

  const call = await mcp(tok, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "whoami", arguments: {} } })
  const res = (await call.json()) as { result: { content: { text: string }[]; isError?: boolean } }
  expect(res.result.isError).toBeFalsy()
  expect(JSON.parse(res.result.content[0]!.text).id).toBe(sellerA)
  const rows = await testSql!`select tool, ok from public.mcp_calls where user_id = ${sellerA} and tool = 'whoami'`
  expect(rows).toHaveLength(1)
  expect(rows[0]!.ok).toBe(true)

  const denied = await mcp(tok, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "finance_summary", arguments: {} } })
  expect(JSON.stringify(await denied.json())).not.toContain("income")
})

test.skipIf(!testSql)("handleMcp: GET is refused", async () => {
  const tok = (await openConnection(testSql!, sellerA, "test-client")).access_token
  const r = await handleMcp(new Request("https://x.test/mcp", { method: "GET", headers: { authorization: `Bearer ${tok}`, accept: "text/event-stream" } }), testSql!, asUser)
  expect(r.status).toBe(405)
  expect(r.headers.get("cache-control")).toBe("no-store")
})

test.skipIf(!testSql)("handleMcp: initialize answers JSON with the instructions; a refused tool is isError and audited as failed", async () => {
  const tok = (await openConnection(testSql!, sellerB, "test-client")).access_token
  const init = await mcp(tok, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } })
  expect(init.headers.get("content-type")).toContain("application/json")
  const i = (await init.json()) as { result: { instructions: string; serverInfo: { name: string } } }
  expect(i.result.serverInfo.name).toBe("fy-system")
  expect(i.result.instructions).toContain("Fikr Yetakchilari")
  const bad = await mcp(tok, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "call_analysis", arguments: { call_uuid: callUuid } } })
  const r = (await bad.json()) as { result: { isError: boolean; content: { text: string }[] } }
  expect(r.result.isError).toBe(true)
  expect(r.result.content[0]!.text).toContain("topilmadi")
  const rows = await testSql!`select ok, error from public.mcp_calls where user_id = ${sellerB} and tool = 'call_analysis'`
  expect(rows).toHaveLength(1)
  expect(rows[0]!.ok).toBe(false)
})

test.skipIf(!testSql)("handleMcp: a failing audit insert does not change the tool result", async () => {
  const tok = (await openConnection(testSql!, sellerA, "test-client")).access_token
  const failing = new Proxy(testSql!, { apply: (t, th, a: unknown[]) => {
    if (Array.isArray(a[0]) && (a[0] as string[]).join("").includes("mcp_calls")) return Promise.reject(new Error("audit down"))
    return Reflect.apply(t, th, a)
  } }) as typeof testSql & object
  const orig = console.error
  const logged: unknown[][] = []
  console.error = (...a: unknown[]) => { logged.push(a) }
  try {
    const r = await handleMcp(new Request("https://x.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }) }), failing, asUser)
    const j = (await r.json()) as { result: { isError?: boolean; content: { text: string }[] } }
    expect(j.result.isError).toBeFalsy()
    expect(JSON.parse(j.result.content[0]!.text).id).toBe(sellerA)
  } finally { console.error = orig }
  expect(logged.some((l) => String(l[0]).includes("audit insert failed"))).toBe(true)
})
