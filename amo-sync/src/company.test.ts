import { describe, expect, test } from "bun:test"
import { companyFrom } from "./company"

const product = { PRODUCT_MODE: "1", COMPANY_NAME: "Test Kompaniya", APP_URL: "https://app.test.uz/", API_URL: "https://api.test.uz", SUPABASE_ANON_KEY: "k" }

describe("without PRODUCT_MODE", () => {
  test("nothing set = today's values", () => {
    expect(companyFrom({})).toEqual({
      product: false, name: "Fikr Yetakchilari", shortName: "FY Tizim", tagline: "Biznes Klub", kind: "biznes klubi",
      about: "Klub tadbirkorlar uchun pullik tadbirlar o'tkazadi; sotuvchining maqsadi — mijozni tadbirga yozish yoki keyingi aniq qadamni kelishish.",
      appUrl: "https://app.fikryetakchilari.uz", apiUrl: "https://api.fikryetakchilari.uz", pixel: "1647118073645060", fyAppUrl: "https://com.fikryetakchilari.uz",
    })
  })
  test("one value overrides only itself; the old PUBLIC_API_URL still counts", () => {
    const c = companyFrom({ COMPANY_NAME: "Boshqa", PUBLIC_API_URL: "https://x.uz/" })
    expect(c.name).toBe("Boshqa")
    expect(c.shortName).toBe("FY Tizim")
    expect(c.apiUrl).toBe("https://x.uz")
    expect(c.pixel).toBe("1647118073645060")
  })
})

describe("PRODUCT_MODE=1", () => {
  test("a missing required value stops the start and names what is missing", () => {
    expect(() => companyFrom({ PRODUCT_MODE: "1", COMPANY_NAME: "X", API_URL: " " })).toThrow("APP_URL, API_URL, SUPABASE_ANON_KEY berilmagan")
    expect(() => companyFrom({ PRODUCT_MODE: "1" })).toThrow("COMPANY_NAME")
  })
  test("nothing of ours is assumed: no pixel, no FY app, no club words", () => {
    const c = companyFrom(product)
    expect(c).toMatchObject({ product: true, name: "Test Kompaniya", shortName: "Test Kompaniya", tagline: "", kind: "", pixel: "", fyAppUrl: "", appUrl: "https://app.test.uz", apiUrl: "https://api.test.uz" })
    expect(JSON.stringify(c)).not.toMatch(/fikr|klub|tadbir/i)
  })
  test("COMPANY_ABOUT keeps special characters and line breaks, real or written as \\n", () => {
    const odd = `Biz "Savdo & Co" <mebel> sotamiz: 100% sifat, narx $5 — \`arzon\` \${emas}; 'tez' \\ yetkazamiz.`
    expect(companyFrom({ ...product, COMPANY_ABOUT: `${odd}\nIkkinchi qator.\n  Uchinchi.` }).about).toBe(`${odd}\nIkkinchi qator.\n  Uchinchi.`)
    expect(companyFrom({ ...product, COMPANY_ABOUT: "Birinchi.\\nIkkinchi." }).about).toBe("Birinchi.\nIkkinchi.")
  })
})
