import { describe, expect, test } from "bun:test"
import { clientMeta, noBusiness, scoreLead, splitCapi } from "./leadScore"

const form = (Lavozim: string, aylanma: string, Kompaniya: string) => ({ name: "Anvar", phone: "+998901234567", Lavozim, "Oylik aylanma": aylanma, Kompaniya })

describe("scoreLead", () => {
  test("the brief's two test cases", () => {
    expect(scoreLead(form("Biznes egasi / asoschi", "100–500 mln so‘m", "Test MChJ"))).toBe(5)
    expect(scoreLead(form("Xodim / mutaxassis", "Hali biznesim yo‘q", "yo‘q"))).toBe(0)
  })
  test("every option scores as the brief says", () => {
    expect(scoreLead(form("Direktor / top-menejer", "1 mlrd so‘mdan yuqori", ""))).toBe(5)
    expect(scoreLead(form("Bo‘lim rahbari", "500 mln – 1 mlrd so‘m", ""))).toBe(3)
    expect(scoreLead(form("Hozircha biznesim yo‘q", "100 mln so‘mgacha", ""))).toBe(0)
  })
  test("apostrophe and dash variants score the same", () => {
    expect(scoreLead(form("Bo'lim rahbari", "500 mln - 1 mlrd so'm", "x"))).toBe(3)
    expect(scoreLead(form("Boʻlim rahbari", "500 mln — 1 mlrd soʻm", "x"))).toBe(3)
    expect(scoreLead(form("BIZNES EGASI  /  ASOSCHI", "100-500 mln so’m", "x"))).toBe(4)
  })
  test("the company counts only when it is a real name or field", () => {
    for (const c of ["", "12", "--", "TEST", "Talaba", "ishsiz", "нет", "yoq", "Yo'q", "IT"]) expect(scoreLead(form("Xodim / mutaxassis", "", c))).toBe(0)
    expect(scoreLead(form("Xodim / mutaxassis", "", "Savdo"))).toBe(1)
  })
  test("an old form with neither position nor turnover is not scored", () => {
    expect(scoreLead({ name: "A", phone: "901234567", Kompaniya: "Savdo" })).toBeNull()
    expect(scoreLead({ name: "A", lavozim: "Biznes egasi / asoschi" })).toBe(3)
  })
})

describe("splitCapi", () => {
  test("the five CAPI keys leave the answers, the rest stay", () => {
    const { fields, capi } = splitCapi({ name: "A", Kompaniya: "Savdo", event_id: " 3f1c ", event_source_url: "https://x.uz/?a=1", content_name: "Biznes nonushta #11", fbc: "fb.1.2.IwAR", fbp: "", })
    expect(fields).toEqual({ name: "A", Kompaniya: "Savdo" })
    expect(capi).toEqual({ event_id: "3f1c", event_source_url: "https://x.uz/?a=1", content_name: "Biznes nonushta #11", fbc: "fb.1.2.IwAR" })
  })
})

describe("clientMeta", () => {
  test("Cloudflare's header first, else the first forwarded address", () => {
    expect(clientMeta(new Headers({ "cf-connecting-ip": "5.6.7.8", "x-forwarded-for": "1.2.3.4", "user-agent": "UA" }))).toEqual({ client_ip: "5.6.7.8", user_agent: "UA" })
    expect(clientMeta(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toEqual({ client_ip: "1.2.3.4" })
    expect(clientMeta(new Headers())).toEqual({})
  })
})

describe("noBusiness (agreed variant 1: no business = never qualified)", () => {
  test("either 'no business' answer, any apostrophe", () => {
    expect(noBusiness(form("Biznes egasi / asoschi", "Hali biznesim yo‘q", "947270899bdhj"))).toBe(true)
    expect(noBusiness(form("Hozircha biznesim yo'q", "1 mlrd so‘mdan yuqori", "Savdo"))).toBe(true)
    expect(noBusiness(form("Biznes egasi / asoschi", "Hali biznesim yoʻq", "x"))).toBe(true)
  })
  test("a real business, or an old form without the fields, is not 'no business'", () => {
    expect(noBusiness(form("Direktor / top-menejer", "100–500 mln so‘m", "Savdo"))).toBe(false)
    expect(noBusiness({ name: "A" })).toBe(false)
  })
})

describe("unexpected values never throw", () => {
  test("long, emoji, Cyrillic, digits-only companies and unknown options", () => {
    expect(scoreLead(form("Boshqa lavozim", "2 mlrd", "🚀".repeat(300) + "Ж".repeat(300)))).toBe(1)
    expect(scoreLead(form("", "", "1234567"))).toBe(0)
    expect(scoreLead(form("Biznes egasi / asoschi", "", "ООО Ромашка"))).toBe(4)
  })
})

describe("site options as of 2026-11-12", () => {
  test("'Mutaxassis / xodim' and 'Bilmayman' score 0; real ones still count", () => {
    expect(scoreLead(form("Mutaxassis / xodim", "Bilmayman", "Savdo"))).toBe(1)
    expect(scoreLead(form("Direktor / top-menejer", "Bilmayman", "Savdo"))).toBe(3)
    expect(scoreLead(form("Biznes egasi / asoschi", "1 mlrd so‘mdan yuqori", "Savdo"))).toBe(7)
  })
  test("no business yet: turnover comes as 'yo‘q' — 0 points and never qualified", () => {
    const f = form("Hozircha biznesim yo‘q", "yo‘q", "Savdo")
    expect(scoreLead(f)).toBe(1)
    expect(noBusiness(f)).toBe(true)
  })
  test("the site's own ball / qualified are kept aside, never counted as answers", () => {
    const { fields, capi } = splitCapi({ name: "A", Lavozim: "Biznes egasi / asoschi", ball: "7", qualified: "true" })
    expect(fields).toEqual({ name: "A", Lavozim: "Biznes egasi / asoschi" })
    expect(capi).toEqual({ site_score: "7", site_qualified: "true" })
  })
})
