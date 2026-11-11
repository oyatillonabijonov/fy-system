import { afterAll, beforeAll, expect, test } from "bun:test"
import { makeAsUser } from "./db"
import type { AsUser } from "./db"
import { handleMcp } from "./server"
import { openConnection } from "./store"
import { staff, testSql } from "./testdb"
import { tool } from "./def"
import { callTool, loadMe, TOOLS, toolsFor } from "./tools"

process.env.MCP_PUBLIC_URL ??= "https://x.test"
const asUser = makeAsUser(process.env.TEST_DATABASE_URL ?? "postgres://unused")
const created: string[] = []
const [eventId, clientId, partId] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
const callUuid = `t5-${crypto.randomUUID()}`
let admin = "", sellerA = "", sellerB = "", dashOnly = ""

beforeAll(async () => {
  if (!testSql) return
  admin = await staff(testSql, { role: "admin" }); created.push(admin)
  sellerA = await staff(testSql, { modules: ["dashboard", "sotuv-crmn"], department: "sotuv" }); created.push(sellerA)
  sellerB = await staff(testSql, { modules: ["dashboard", "sotuv-crmn"], department: "sotuv" }); created.push(sellerB)
  dashOnly = await staff(testSql, { modules: ["dashboard"] }); created.push(dashOnly)
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

const ADMIN_TOOLS = ["whoami", "reference", "sales_stats", "call_analysis_stats", "call_analyses", "call_analysis", "finance_summary", "debtors", "event_results",
  "events", "event", "find_clients", "create_event", "update_event", "delete_event", "copy_event_tasks", "enroll_participant", "link_pipeline", "export_stickers", "export_signs"]

test.skipIf(!testSql)("a seller gets six tools, an admin all twenty, a Tadbirlar-only user twelve", async () => {
  expect(await names(sellerA)).toEqual(["whoami", "reference", "sales_stats", "call_analysis_stats", "call_analyses", "call_analysis"])
  expect(await names(admin)).toEqual(ADMIN_TOOLS)
  const ev = await staff(testSql!, { modules: ["tadbirlar"] }); created.push(ev)
  expect(await names(ev)).toEqual(["whoami", "reference", ...ADMIN_TOOLS.slice(9).filter((n) => n !== "link_pipeline")])
  expect(await names(ev)).toHaveLength(12)
})

test.skipIf(!testSql)("tools/list hints: readers read-only, the six writers not, only delete_event destructive", async () => {
  const tok = (await openConnection(testSql!, admin, "test-client")).access_token
  const j = (await (await mcp(tok, { jsonrpc: "2.0", id: 1, method: "tools/list" })).json()) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }[] } }
  const writers = ["create_event", "update_event", "delete_event", "copy_event_tasks", "enroll_participant", "link_pipeline"]
  expect(j.result.tools).toHaveLength(20)
  for (const t of j.result.tools) {
    expect(t.annotations.readOnlyHint).toBe(!writers.includes(t.name))
    expect(t.annotations.destructiveHint).toBe(t.name === "delete_event")
  }
})

test.skipIf(!testSql)("reference: no Sotuv module gives an explicit marker for pipelines, a seller gets the list", async () => {
  const no = await callTool(asUser, dashOnly, "reference", {})
  expect(no.ok).toBe(true)
  if (no.ok) {
    const d = no.data as { pipelines: unknown; events: unknown; sellers: unknown }
    expect(d.pipelines).toEqual({ error: "«Sotuv bo'limi» bo'limiga ruxsatingiz yo'q" })
    expect(Array.isArray(d.events)).toBe(true); expect(Array.isArray(d.sellers)).toBe(true)
  }
  const yes = await callTool(asUser, sellerA, "reference", {})
  expect(yes.ok).toBe(true)
  if (yes.ok) expect(Array.isArray((yes.data as { pipelines: unknown }).pipelines)).toBe(true)
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

test.skipIf(!testSql)("handleMcp: a deactivated staff member's live token is 401 on the very next request", async () => {
  const uid = await staff(testSql!, { modules: ["dashboard", "sotuv-crmn"], department: "sotuv" }); created.push(uid)
  const tok = (await openConnection(testSql!, uid, "test-client")).access_token
  expect((await mcp(tok, { jsonrpc: "2.0", id: 1, method: "tools/list" })).status).toBe(200)
  await testSql!`update public.profiles set is_active = false where id = ${uid}`
  const r = await mcp(tok, { jsonrpc: "2.0", id: 1, method: "tools/list" })
  expect(r.status).toBe(401)
  expect(r.headers.get("www-authenticate")).toContain("resource_metadata")
})

test.skipIf(!testSql)("handleMcp: tools/list shows the caller's six tools; whoami returns the caller and is audited", async () => {
  const tok = (await openConnection(testSql!, sellerA, "test-client")).access_token
  const list = await mcp(tok, { jsonrpc: "2.0", id: 1, method: "tools/list" })
  expect(list.status).toBe(200)
  expect(list.headers.get("cache-control")).toBe("no-store")
  const listed = (await list.json()) as { result: { tools: { name: string; annotations?: { readOnlyHint?: boolean } }[] } }
  expect(listed.result.tools.map((t) => t.name).sort()).toEqual(["call_analyses", "call_analysis", "call_analysis_stats", "reference", "sales_stats", "whoami"])
  expect(listed.result.tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true)
  expect(listed.result.tools.some((t) => (t.annotations as { destructiveHint?: boolean } | undefined)?.destructiveHint === true)).toBe(false)

  const call = await mcp(tok, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "whoami", arguments: {} } })
  const res = (await call.json()) as { result: { content: { text: string }[]; isError?: boolean } }
  expect(res.result.isError).toBeFalsy()
  expect(JSON.parse(res.result.content[0]!.text).id).toBe(sellerA)
  const rows = await testSql!`select tool, ok from public.mcp_calls where user_id = ${sellerA} and tool = 'whoami'`
  expect(rows).toHaveLength(1)
  expect(rows[0]!.ok).toBe(true)

  const denied = await mcp(tok, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "finance_summary", arguments: {} } })
  const dj = (await denied.json()) as { result: { isError: boolean; content: { text: string }[] } }
  expect(dj.result.isError).toBe(true)
  expect(dj.result.content[0]!.text).toContain("Moliya")
  expect(JSON.stringify(dj)).not.toContain("income")
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
  expect(i.result.instructions).toContain("never invent it")
  expect(i.result.instructions).toContain("expire in 15 minutes")
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

// --- 2026-07-28 era: no initialize, a _meta envelope on every request, MCP-Protocol-Version / Mcp-Method / Mcp-Name headers
const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": {},
}
const modern = (token: string, method: string, params: Record<string, unknown> = {}, name?: string) => handleMcp(new Request("https://x.test/mcp", {
  method: "POST",
  headers: {
    "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}`,
    "mcp-protocol-version": "2026-07-28", "mcp-method": method, ...(name ? { "mcp-name": name } : {}),
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: META } }),
}), testSql!, asUser)
const toolNames = async (r: Response) => ((await r.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name).sort()
const SELLER_TOOLS = ["call_analyses", "call_analysis", "call_analysis_stats", "reference", "sales_stats", "whoami"]

test.skipIf(!testSql)("2026 era: tools/list is per caller (seller six, admin twenty, back to back), JSON and no-store", async () => {
  const a = (await openConnection(testSql!, sellerA, "test-client")).access_token
  const adm = (await openConnection(testSql!, admin, "test-client")).access_token
  const r1 = await modern(a, "tools/list")
  expect(r1.status).toBe(200)
  expect(r1.headers.get("content-type")).toContain("application/json")
  expect(r1.headers.get("cache-control")).toBe("no-store")
  expect(await toolNames(r1)).toEqual(SELLER_TOOLS)
  expect(await toolNames(await modern(adm, "tools/list"))).toHaveLength(20)
  expect(await toolNames(await modern(a, "tools/list"))).toEqual(SELLER_TOOLS)
})

test.skipIf(!testSql)("2026 era: tools/call whoami returns the caller and is audited", async () => {
  const u = await staff(testSql!, { modules: ["sotuv-crmn"] }); created.push(u)
  const tok = (await openConnection(testSql!, u, "test-client")).access_token
  const r = await modern(tok, "tools/call", { name: "whoami", arguments: {} }, "whoami")
  const j = (await r.json()) as { result: { isError?: boolean; content: { text: string }[] } }
  expect(j.result.isError).toBeFalsy()
  expect(JSON.parse(j.result.content[0]!.text).id).toBe(u)
  expect((await testSql!`select count(*)::int n from public.mcp_calls where user_id = ${u} and tool = 'whoami' and ok`)[0]!.n).toBe(1)
})

test.skipIf(!testSql)("2026 era: server/discover is answered, not an error", async () => {
  const tok = (await openConnection(testSql!, sellerA, "test-client")).access_token
  const r = await modern(tok, "server/discover")
  expect(r.status).toBe(200)
  const j = (await r.json()) as { result?: { supportedVersions?: string[]; instructions?: string; _meta?: Record<string, { name: string }> }; error?: unknown }
  expect(j.error).toBeUndefined()
  expect(j.result?.supportedVersions).toContain("2026-07-28")
  expect(j.result?._meta?.["io.modelcontextprotocol/serverInfo"]?.name).toBe("fy-system")
  expect(j.result?.instructions).toContain("Fikr Yetakchilari")
})

test.skipIf(!testSql)("a tool the caller does not have is an explicit module error, audited, with no data (both eras)", async () => {
  const u = await staff(testSql!, { modules: ["dashboard", "sotuv-crmn"] }); created.push(u)
  const tok = (await openConnection(testSql!, u, "test-client")).access_token
  const legacy = await mcp(tok, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "finance_summary", arguments: {} } })
  const modernRes = await modern(tok, "tools/call", { name: "finance_summary", arguments: {} }, "finance_summary")
  for (const r of [legacy, modernRes]) {
    const j = (await r.json()) as { result: { isError: boolean; content: { text: string }[] } }
    expect(j.result.isError).toBe(true)
    expect(j.result.content[0]!.text).toBe("«Moliya» bo'limiga ruxsatingiz yo'q")
  }
  const rows = await testSql!`select ok, error from public.mcp_calls where user_id = ${u} and tool = 'finance_summary'`
  expect(rows).toHaveLength(2)
  expect(rows.every((x) => x.ok === false && String(x.error).includes("Moliya"))).toBe(true)
  const unknown = await mcp(tok, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nowhere", arguments: {} } })
  expect(JSON.stringify(await unknown.json())).not.toContain("Moliya")
  const list = await mcp(tok, { jsonrpc: "2.0", id: 7, method: "tools/list" })
  expect(await toolNames(list)).toEqual(SELLER_TOOLS)
})

/** Runs `fn` with temporary tools on TOOLS, always removed afterwards */
async function withTools(extra: ReturnType<typeof tool>[], fn: () => Promise<void>) {
  TOOLS.push(...extra)
  try { await fn() } finally { for (const t of extra) TOOLS.splice(TOOLS.indexOf(t), 1) }
}

test.skipIf(!testSql)("a writer is gated by its module before it runs; an admin reaches it", async () => {
  let reached = 0
  const w = tool({ name: "tmp_writer", title: "tmp", description: "tmp", module: "tadbirlar", write: true, input: {}, run: async () => { reached++; return { done: true } } })
  await withTools([w], async () => {
    const denied = await callTool(asUser, sellerA, "tmp_writer", {})
    expect(denied).toEqual({ ok: false, error: "«Tadbirlar» bo'limiga ruxsatingiz yo'q" })
    expect(reached).toBe(0)
    expect(await callTool(asUser, admin, "tmp_writer", {})).toEqual({ ok: true, data: { done: true } })
    expect(reached).toBe(1)
  })
})

test.skipIf(!testSql)("an adminOnly tool is hidden from and refused to a non-admin with every module, audited as a refusal", async () => {
  let reached = 0
  const a = tool({ name: "tmp_admin", title: "tmp", description: "tmp", module: null, adminOnly: true, input: {}, run: async () => { reached++; return 1 } })
  const all = await staff(testSql!, { modules: ["dashboard", "sotuv-crmn", "tadbirlar", "tadbirlar-moliya"] }); created.push(all)
  await withTools([a], async () => {
    expect(await callTool(asUser, all, "tmp_admin", {})).toEqual({ ok: false, error: "Bu amalni faqat admin bajara oladi" })
    expect(reached).toBe(0)
    expect(await asUser(all, async (tx) => toolsFor(await loadMe(tx)).map((t) => t.name))).not.toContain("tmp_admin")
    expect(await asUser(admin, async (tx) => toolsFor(await loadMe(tx)).map((t) => t.name))).toContain("tmp_admin")
    const tok = (await openConnection(testSql!, all, "test-client")).access_token
    const r = await mcp(tok, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "tmp_admin", arguments: {} } })
    const j = (await r.json()) as { result: { isError: boolean; content: { text: string }[] } }
    expect(j.result.isError).toBe(true)
    expect(j.result.content[0]!.text).toBe("Bu amalni faqat admin bajara oladi")
    const rows = await testSql!`select ok, error from public.mcp_calls where user_id = ${all} and tool = 'tmp_admin'`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ok).toBe(false)
    expect(reached).toBe(0)
  })
})

test.skipIf(!testSql)("a writer that inserts and then throws is rolled back: ok false, no row", async () => {
  const name = `Rollback ${crypto.randomUUID()}`
  const w = tool({ name: "tmp_rollback", title: "tmp", description: "tmp", module: null, write: true, input: {},
    run: async (tx) => { await tx`insert into public.events (name) values (${name})`; throw new Error("after insert") } })
  await withTools([w], async () => {
    expect((await callTool(asUser, admin, "tmp_rollback", {})).ok).toBe(false)
    expect(await testSql!`select id from public.events where name = ${name}`).toHaveLength(0)
  })
})

test.skipIf(!testSql)("a non-writer tool that tries to INSERT is refused as read-only and writes nothing", async () => {
  const name = `ReadOnly ${crypto.randomUUID()}`
  const w = tool({ name: "tmp_sneaky", title: "tmp", description: "tmp", module: null, input: {},
    run: async (tx) => tx`insert into public.events (name) values (${name}) returning id` })
  await withTools([w], async () => {
    const r = await callTool(asUser, admin, "tmp_sneaky", {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/read-only/)
    expect(await testSql!`select id from public.events where name = ${name}`).toHaveLength(0)
  })
})
