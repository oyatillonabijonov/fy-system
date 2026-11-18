// The scheduler's SQL against the throwaway stand (TEST_DATABASE_URL with 100–102); skipped without it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { testSql as sql } from "../mcp/testdb"
import { runSchedules } from "./schedules"

const run = sql ? test : test.skip
const [P, E, S1, S2, WON, T] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
const lead = () => crypto.randomUUID()
const [L1, L2, L3] = [lead(), lead(), lead()]

beforeAll(async () => {
  if (!sql) return
  await sql`insert into events (id, name, date) values (${E}, 'Nonushta T', '2026-11-20')`
  await sql`insert into crm_pipelines (id, name, event_id) values (${P}, 'Sched T', ${E})`
  await sql`insert into crm_stages (id, pipeline_id, name, sort_order) values (${S1}, ${P}, 'Yangi', 0), (${S2}, ${P}, 'Yozildi', 1)`
  await sql`insert into crm_stages (id, pipeline_id, name, sort_order, is_won) values (${WON}, ${P}, 'Yutildi', 2, true)`
  await sql`insert into crm_leads (id, name, pipeline_id, stage_id) values (${L1}, 'a', ${P}, ${S1}), (${L2}, 'b', ${P}, ${S2}), (${L3}, 'c', ${P}, ${WON})`
  await sql`insert into tg_templates (id, title, body) values (${T}, 'Eslatma', 'Ertaga!')`
})
afterAll(async () => {
  if (!sql) return
  await sql`delete from crm_leads where pipeline_id = ${P}`
  await sql`delete from crm_stages where pipeline_id = ${P}`
  await sql`delete from crm_pipelines where id = ${P}`
  await sql`delete from events where id = ${E}`
  await sql`delete from tg_templates where id = ${T}`
})

describe("runSchedules on a real database", () => {
  run("open bitimlar by default, each once; a stage filter narrows it", async () => {
    const [s] = await sql!<{ id: string }[]>`insert into tg_schedules (pipeline_id, template_id, days_before, at_time) values (${P}, ${T}, 1, '10:00') returning id`
    const sent: string[] = []
    const send = async (_: unknown, __: string | null, b: { lead_id: string }) => { sent.push(b.lead_id) }
    await runSchedules(sql!, new Date("2026-11-19T06:00:00Z"), send, async () => {})
    await runSchedules(sql!, new Date("2026-11-19T06:05:00Z"), send, async () => {})   // a second tick: nothing new
    expect(sent.sort()).toEqual([L1, L2].sort())
    const runs = await sql!<{ status: string }[]>`select status from tg_schedule_runs where schedule_id = ${s.id}`
    expect(runs.length).toBe(2)

    const [f] = await sql!<{ id: string }[]>`insert into tg_schedules (pipeline_id, template_id, days_before, at_time, stage_ids) values (${P}, ${T}, 1, '10:00', ${[S2]}::uuid[]) returning id`
    const only: string[] = []
    await runSchedules(sql!, new Date("2026-11-19T06:10:00Z"), async (_, __, b) => { only.push(b.lead_id) }, async () => {})
    expect(only).toEqual([L2])
    await sql!`delete from tg_schedules where id in (${s.id}, ${f.id})`
  })
})
