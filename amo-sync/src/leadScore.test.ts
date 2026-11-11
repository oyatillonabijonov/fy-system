import { describe, expect, test } from "bun:test"
import { clientMeta, scoreLead, splitCapi } from "./leadScore"

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
