import { expect, test } from "bun:test"
import type { Sql } from "postgres"
import { fetchMetaLead, health, parseLead } from "./intake"

test("Tilda form: name/phone by field name, the rest as details, service fields dropped", () => {
  const p = parseLead({ Name: "Aziz Karimov", Phone: "+998 (90) 123-45-67", Soha: "IT", tranid: "123:456", formid: "form1", COOKIES: "x" })
  expect(p).toEqual({ name: "Aziz Karimov", phone: "+998 (90) 123-45-67", details: "Soha: IT", fields: [{ k: "Soha", v: "IT" }] })
})

test("Meta lead form: first + last name, phone_number, custom questions kept", () => {
  const p = parseLead({ first_name: "Malika", last_name: "Umarova", phone_number: "+998901112233", "qaysi_tadbir?": "Safar 8.0" })
  expect(p).toEqual({ name: "Malika Umarova", phone: "+998901112233", details: "qaysi tadbir?: Safar 8.0", fields: [{ k: "qaysi tadbir?", v: "Safar 8.0" }] })
})

test("unknown field names: a phone-looking value is still found", () => {
  const p = parseLead({ "Ismingiz": "Bobur", "Bog'lanish uchun": "90 123 45 67", "Izoh": "kechqurun" })
  expect(p.name).toBe("Bobur")
  expect(p.phone).toBe("90 123 45 67")
  expect(p.details).toBe("Izoh: kechqurun")
})

test("empty values are ignored", () => {
  expect(parseLead({ name: "", phone: " ", email: "a@b.uz" })).toEqual({ name: "", phone: "", details: "email: a@b.uz", fields: [{ k: "email", v: "a@b.uz" }] })
})

test("health: a fresh backup is enough — the AmoCRM sync is gone, so no amocrm check (080)", async () => {
  const sql = (async () => [{ key: "backup_last_ok", age: 60 }]) as unknown as Sql
  const pbx = process.env.ONLINEPBX_KEY
  delete process.env.ONLINEPBX_KEY   // the calls check needs a live PBX sync; this test is about the rest
  const res = await health(sql)
  if (pbx !== undefined) process.env.ONLINEPBX_KEY = pbx
  const body = (await res.json()) as { ok: boolean; checks: Record<string, unknown> }
  expect(body.checks.amocrm).toBeUndefined()
  expect(body.checks.backup).toBe(true)
  expect(res.status).toBe(200)
})

test("Meta: when Graph refuses the ad fields, the lead is fetched again without them", async () => {
  const urls: string[] = []
  const fake = (async (u: string | URL | Request) => {
    urls.push(String(u))
    return urls.length === 1
      ? new Response('{"error":{"code":200}}', { status: 400 })
      : Response.json({ form_id: "9", field_data: [{ name: "phone_number", values: ["+998901112233"] }] })
  }) as typeof fetch
  const lead = await fetchMetaLead("777", "tok", fake)
  expect(urls).toHaveLength(2)
  expect(urls[0]).toContain("campaign_id")
  expect(urls[1]).not.toContain("campaign_id")
  expect(lead.field_data?.[0].name).toBe("phone_number")
})

test("Meta: a Graph answer with ad fields is returned as is, in one request", async () => {
  let n = 0
  const fake = (async () => { n++; return Response.json({ form_id: "9", campaign_id: "3", field_data: [] }) }) as typeof fetch
  expect((await fetchMetaLead("777", "tok", fake)).campaign_id).toBe("3")
  expect(n).toBe(1)
})

test("Meta: both requests failing is an error (the caller logs it, as today)", async () => {
  const fake = (async () => new Response("nope", { status: 500 })) as typeof fetch
  await expect(fetchMetaLead("777", "tok", fake)).rejects.toThrow("Graph 500")
})
