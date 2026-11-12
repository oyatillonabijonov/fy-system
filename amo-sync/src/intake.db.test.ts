// The site webhook end to end against the throwaway stand (TEST_DATABASE_URL); skipped without it.
// Every case asks the same question first: is the lead kept, and does the site get ok:true?
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { testSql as sql } from "./mcp/testdb"
import { handleFbLead, handleSiteLead } from "./intake"

const TOKEN = "t-intake-db"
const [pipeA, pipeB, stageA, stageB] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
const run = sql ? test : test.skip

const post = (body: unknown, opts: { pipe?: string; token?: string; raw?: string; ip?: string } = {}) => {
  const url = new URL(`https://api.test/hooks/lead/sayt?token=${opts.token ?? TOKEN}&voronka=${opts.pipe ?? pipeA}`)
  const req = new Request(url, {
    method: "POST", body: opts.raw ?? JSON.stringify(body),
    headers: { "content-type": "application/json", "cf-connecting-ip": opts.ip ?? "203.0.113.7", "x-forwarded-for": "10.0.2.24", "user-agent": "TestUA" },
  })
  return handleSiteLead(req, sql!, "sayt", url)
}
const form = (phone: string, extra: Record<string, string> = {}) => ({
  name: "Anvar", phone, Kompaniya: "Test MChJ", Lavozim: "Biznes egasi / asoschi", "Oylik aylanma": "100–500 mln so‘m",
  event_id: crypto.randomUUID(), event_source_url: "https://nonushta.test/", content_name: "Biznes nonushta #11", ...extra,
})
const leadsOf = (phone: string) => sql!<{ id: string; pipeline_id: string; lead_score: number | null; qualified: boolean | null; capi: Record<string, string> | null; fields: { k: string; v: string }[] }[]>`
  select l.id, l.pipeline_id, l.lead_score, l.qualified, l.capi, l.fields from crm_leads l join clients c on c.id = l.client_id where c.phone = ${phone} order by l.created_at`
const metaOf = (leadId: string) => sql!<{ event_name: string; event_id: string }[]>`select event_name, event_id from meta_events_log where lead_id = ${leadId}`

beforeAll(async () => {
  if (!sql) return
  await sql`insert into crm_pipelines (id, name) values (${pipeA}, 'Intake A'), (${pipeB}, 'Intake B')`
  await sql`insert into crm_stages (id, pipeline_id, name, sort_order) values (${stageA}, ${pipeA}, 'Yangi', 0), (${stageB}, ${pipeB}, 'Yangi', 0)`
  await sql`insert into crm_lead_sources (id, label, token, enabled, pipeline_id) values ('sayt', 'Sayt', ${TOKEN}, true, ${pipeA})
            on conflict (id) do update set token = excluded.token, enabled = true, pipeline_id = excluded.pipeline_id`
})
afterAll(async () => {
  if (!sql) return
  await sql`delete from crm_leads where pipeline_id in (${pipeA}, ${pipeB})`
  await sql`delete from crm_pipelines where id in (${pipeA}, ${pipeB})`
  await sql`delete from clients where phone like '+99890999%'`
  await sql`delete from webhook_logs where source in ('sayt', 'fb-lead')`
})

describe("lead is kept and the site hears ok", () => {
  run("a normal application: saved, scored, qualified, real visitor IP", async () => {
    const res = await post(form("+998909990001"))
    expect(await res.json()).toEqual({ ok: true, duplicate: false, qualified: true })
    const [l] = await leadsOf("+998909990001")
    expect(l.lead_score).toBe(5)
    expect(l.capi?.client_ip).toBe("203.0.113.7")
    expect(l.capi?.user_agent).toBe("TestUA")
    expect((await metaOf(l.id)).map((m) => m.event_name)).toEqual(["Lead"])
  })

  run("variant 1: owner who has no business yet is not qualified, and Meta hears nothing", async () => {
    const res = await post(form("+998909990002", { "Oylik aylanma": "Hali biznesim yo‘q", Kompaniya: "947270899bdhj" }))
    expect(await res.json()).toEqual({ ok: true, duplicate: false, qualified: false })
    const [l] = await leadsOf("+998909990002")
    expect([l.lead_score, l.qualified]).toEqual([4, false])
    expect(await metaOf(l.id)).toHaveLength(0)
  })

  run("unknown or missing options, odd companies, no fbc/fbp/UTM, mixed apostrophes: all saved", async () => {
    const cases: Record<string, string>[] = [
      { Lavozim: "Yangi variant", "Oylik aylanma": "10 mlrd" },
      { Lavozim: "", "Oylik aylanma": "" },
      { Kompaniya: "Ж".repeat(300) + "🚀".repeat(200) },
      { Kompaniya: "1234567" },
      { name: "O‘g‘il ʻAli' Ma’ruf" },
    ]
    for (const [i, extra] of cases.entries()) {
      const phone = `+99890999010${i}`
      const res = await post(form(phone, extra))
      expect((await res.json() as { ok: boolean }).ok).toBe(true)
      expect(await leadsOf(phone)).toHaveLength(1)
    }
    const [l] = await leadsOf("+998909990100")
    expect(Object.keys(l.capi ?? {}).some((k) => k === "fbc" || k === "fbp")).toBe(false)
  })

  run("the scoring step failing does not lose the lead: ok:true, no qualified key", async () => {
    await sql!`create function public.t_fail_score() returns trigger language plpgsql as $$ begin if new.lead_score is not null then raise exception 'boom'; end if; return new; end $$`
    await sql!`create trigger t_fail_score before update on crm_leads for each row execute function public.t_fail_score()`
    try {
      const res = await post(form("+998909990003"))
      expect(await res.json()).toEqual({ ok: true, duplicate: false })
      expect(await leadsOf("+998909990003")).toHaveLength(1)
    } finally {
      await sql!`drop trigger t_fail_score on crm_leads`
      await sql!`drop function public.t_fail_score()`
    }
  })
})

describe("duplicates", () => {
  run("the same event_id twice (a retried request): one lead, one Lead event, no second feed row", async () => {
    const f = form("+998909990004")
    await post(f)
    const res = await post(f)
    expect(await res.json()).toEqual({ ok: true, duplicate: true, qualified: true })
    const ls = await leadsOf("+998909990004")
    expect(ls).toHaveLength(1)
    expect(await metaOf(ls[0].id)).toHaveLength(1)
    const [{ n }] = await sql!<{ n: number }[]>`select count(*)::int as n from crm_notes where lead_id = ${ls[0].id} and kind = 'lead'`
    expect(n).toBe(1)
  })

  run("same phone, new answers in the same voronka: kept on the bitim, not lost", async () => {
    await post(form("+998909990005"))
    const res = await post(form("+998909990005", { Lavozim: "Direktor / top-menejer" }))
    expect((await res.json() as { duplicate: boolean }).duplicate).toBe(true)
    const [l] = await leadsOf("+998909990005")
    expect(l.fields.find((f) => f.k === "Lavozim")?.v).toBe("Direktor / top-menejer")
  })

  run("same phone, another event's voronka: a separate bitim, not a duplicate", async () => {
    await post(form("+998909990006"))
    const res = await post(form("+998909990006"), { pipe: pipeB })
    expect((await res.json() as { duplicate: boolean }).duplicate).toBe(false)
    expect((await leadsOf("+998909990006")).map((l) => l.pipeline_id).sort()).toEqual([pipeA, pipeB].sort())
  })
})

describe("refused requests keep their body", () => {
  run("wrong token: 403, the body is logged with the reason", async () => {
    const res = await post(form("+998909990007"), { token: "wrong" })
    expect(res.status).toBe(403)
    const [log] = await sql!<{ error: string; raw_body: Record<string, string> }[]>`select error, raw_body from webhook_logs where raw_body->>'phone' = '+998909990007'`
    expect(log.error).toContain("token")
    expect(await leadsOf("+998909990007")).toHaveLength(0)
  })

  run("a body that isn't JSON: 500 ok:false, the text is logged so the lead can be restored", async () => {
    const res = await post(null, { raw: '{"name":"Buzuq","phone":"+998909990008"' })
    expect(res.status).toBe(500)
    const [log] = await sql!<{ error: string; raw_body: { _raw: string } }[]>`select error, raw_body from webhook_logs where raw_body->>'_raw' like '%909990008%'`
    expect(log.raw_body._raw).toContain("Buzuq")
    expect(log.error).toBeTruthy()
  })
})

// Facebook / Instagram lead forms through Make.com (2026-11-13)
const FB_SECRET = "s-fb-test"
const fb = (body: unknown, secret: string | null = FB_SECRET) => {
  const url = new URL(`https://api.test/hooks/fb-lead?voronka=${pipeB}`)
  return handleFbLead(new Request(url, {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(secret === null ? {} : { "x-fy-secret": secret }) },
  }), sql!, url)
}
const fbLead = (phone: string, leadgen: string) => ({
  name: "TEST Fb", phone, company: "Savdo MChJ", role: "Biznes egasi / asoschi", turnover: "500 mln – 1 mlrd so‘m",
  leadgen_id: leadgen, ad_id: "120200001", ad_name: "Nonushta video", adset_name: "Toshkent 25-45", campaign_name: "BN11 lid", platform: "ig",
})

describe("fb-lead (Make.com)", () => {
  run("no or wrong secret: 401, no bitim, the refusal is logged", async () => {
    process.env.FB_LEAD_SECRET = FB_SECRET
    expect((await fb(fbLead("+998909990201", "lg-1"), null)).status).toBe(401)
    expect((await fb(fbLead("+998909990201", "lg-1"), "wrong")).status).toBe(401)
    expect(await leadsOf("+998909990201")).toHaveLength(0)
    const [log] = await sql!<{ error: string }[]>`select error from webhook_logs where source = 'fb-lead' and raw_body::text like '%909990201%' limit 1`
    expect(log?.error).toBeTruthy()
  })

  run("a lead: bitim in the given voronka like a site lead — form answers, UTM + ad_id, score", async () => {
    process.env.FB_LEAD_SECRET = FB_SECRET
    const res = await fb(fbLead("+998909990202", "lg-2"))
    const json = await res.json() as { ok: boolean; lead_id: string }
    const [l] = await leadsOf("+998909990202")
    expect(json).toEqual({ ok: true, lead_id: l.id })
    expect(l.pipeline_id).toBe(pipeB)
    expect(l.fields).toEqual([{ k: "Kompaniya", v: "Savdo MChJ" }, { k: "Lavozim", v: "Biznes egasi / asoschi" }, { k: "Oylik aylanma", v: "500 mln – 1 mlrd so‘m" }])
    expect(l.lead_score).toBe(6)
    const [{ attribution }] = await sql!<{ attribution: Record<string, string> }[]>`select attribution from crm_leads where id = ${l.id}`
    expect(attribution).toEqual({ utm_source: "ig", utm_medium: "form", utm_campaign: "BN11 lid", utm_term: "Toshkent 25-45", utm_content: "Nonushta video", ad_id: "120200001", leadgen_id: "lg-2" })
    expect(await metaOf(l.id)).toHaveLength(0)   // no site pixel event behind it, so nothing for the Conversions API
  })

  run("the same leadgen_id again: 200 with the same lead_id, no second bitim, no feed row", async () => {
    process.env.FB_LEAD_SECRET = FB_SECRET
    const first = await (await fb(fbLead("+998909990203", "lg-3"))).json() as { lead_id: string }
    const notes = () => sql!<{ n: number }[]>`select count(*)::int as n from crm_notes where lead_id = ${first.lead_id}`.then(([r]) => r.n)
    const before = await notes()
    const again = await fb(fbLead("+998909990203", "lg-3"))
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ ok: true, lead_id: first.lead_id, duplicate: true })
    expect(await leadsOf("+998909990203")).toHaveLength(1)
    expect(await notes()).toBe(before)
  })
})
