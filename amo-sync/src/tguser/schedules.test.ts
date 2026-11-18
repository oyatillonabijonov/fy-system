import { describe, expect, test } from "bun:test"
import { dueAt, isDue, runSchedules } from "./schedules"
import { fakeSql } from "./fake"
import { TgError } from "./port"

describe("dueAt / isDue (Tashkent)", () => {
  test("1 day before a 2026-11-20 event at 10:00 = 2026-11-19 05:00 UTC", () => {
    expect(dueAt("2026-11-20", 1, "10:00:00").toISOString()).toBe("2026-11-19T05:00:00.000Z")
    expect(dueAt("2026-12-01", 3, "09:30").toISOString()).toBe("2026-11-28T04:30:00.000Z")
  })
  test("fires from the due time for 12 hours only", () => {
    const due = new Date("2026-11-19T05:00:00Z")
    expect(isDue(new Date("2026-11-19T04:59:00Z"), due)).toBe(false)
    expect(isDue(new Date("2026-11-19T05:00:00Z"), due)).toBe(true)
    expect(isDue(new Date("2026-11-19T16:59:00Z"), due)).toBe(true)
    expect(isDue(new Date("2026-11-19T17:01:00Z"), due)).toBe(false)
  })
})

const RULE = { id: "s1", template_id: "t1", body: "Ertaga ko'rishamiz, {ism}!", created_by: "u1", event_date: "2026-11-20", days_before: 1, at_time: "10:00:00" }

describe("runSchedules", () => {
  test("a due rule claims each bitim, sends, and records a refusal", async () => {
    const sent: string[] = []
    const { sql, calls } = fakeSql((t, v) => {
      if (t.includes("from tg_schedules")) return [RULE]
      if (t.includes("from crm_leads")) return [{ id: "L1" }, { id: "L2" }]
      if (t.includes("insert into tg_schedule_runs")) return [{ lead_id: v[1] }]
      return []
    })
    const send = async (_sql: unknown, uid: string | null, b: { lead_id: string; text: string; template_id?: string | null }) => {
      expect(uid).toBe("u1"); expect(b.template_id).toBe("t1"); expect(b.text).toBe(RULE.body)
      if (b.lead_id === "L2") throw new TgError("tg_not_found")
      sent.push(b.lead_id)
    }
    await runSchedules(sql, new Date("2026-11-19T06:00:00Z"), send, async () => {})
    expect(sent).toEqual(["L1"])
    const fail = calls.find((c) => c.text.includes("update tg_schedule_runs set status = 'failed'"))
    expect(fail?.values).toEqual(["tg_not_found", "s1", "L2"])
  })

  test("a rule that isn't due sends nothing; a bitim another tick already claimed is skipped", async () => {
    let sends = 0
    const early = fakeSql((t) => (t.includes("from tg_schedules") ? [RULE] : t.includes("from crm_leads") ? [{ id: "L1" }] : []))
    await runSchedules(early.sql, new Date("2026-11-18T06:00:00Z"), async () => { sends++ }, async () => {})
    expect(sends).toBe(0)
    expect(early.calls.some((c) => c.text.includes("from crm_leads"))).toBe(false)

    const claimed = fakeSql((t) => (t.includes("from tg_schedules") ? [RULE] : t.includes("from crm_leads") ? [{ id: "L1" }] : []))   // insert returns no row
    await runSchedules(claimed.sql, new Date("2026-11-19T06:00:00Z"), async () => { sends++ }, async () => {})
    expect(sends).toBe(0)
  })
})
