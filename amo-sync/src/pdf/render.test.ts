import { describe, expect, test } from "bun:test"
import { fileSafe, signsPdf, stickersPdf } from "./render"

const names = (n: number) => Array.from({ length: n }, (_, i) => `Mehmon Nomi${i + 1}`)
const head = (b: Uint8Array) => new TextDecoder().decode(b.subarray(0, 5))
const tail = (b: Uint8Array) => new TextDecoder().decode(b.subarray(b.length - 16))

describe("stickersPdf", () => {
  test("15 names → 2 sheets, a valid PDF", async () => {
    const r = await stickersPdf(names(15), "Kaizen 8.0", "onyx")
    expect(head(r.bytes)).toBe("%PDF-")
    expect(tail(r.bytes)).toContain("%%EOF")
    expect(r.pages).toBe(2)
  })
  test("1 name → 1 page", async () => {
    expect((await stickersPdf(["Aziz Karimov"], "", "onyx")).pages).toBe(1)
  })
  test.each(["onyx", "sandstone", "graphite", "linen", "ivory"])("style %s renders", async (s) => {
    const r = await stickersPdf(names(3), "Kaizen", s)
    expect(head(r.bytes)).toBe("%PDF-")
  })
  test("unknown style rejects", async () => {
    await expect(stickersPdf(["A"], "", "neon")).rejects.toThrow(/uslubi/)
  })
  test("empty list and whitespace-only names reject", async () => {
    await expect(stickersPdf([], "", "onyx")).rejects.toThrow(/ism/i)
    await expect(stickersPdf(["  ", "\n", ""], "", "onyx")).rejects.toThrow(/ism/i)
  })
  test("whitespace-only names are dropped before counting", async () => {
    expect((await stickersPdf(["A B", " ", ...names(13)], "", "onyx")).pages).toBe(1)
  })
  test("601 names reject, 600 render (43 pages)", async () => {
    await expect(stickersPdf(names(601), "", "onyx")).rejects.toThrow(/600/)
    expect((await stickersPdf(names(600), "", "linen")).pages).toBe(43)
  })
  test("Cyrillic and Uzbek apostrophe names render", async () => {
    const r = await stickersPdf(["Азиз Каримов", "Bobur Yo'ldoshev", "G‘ulom O‘rinov"], "Кайзен 8.0", "onyx")
    expect(head(r.bytes)).toBe("%PDF-")
  })
})

describe("signsPdf", () => {
  const three = [
    { place: "Ro'yxatdan o'tish", direction: "right" },
    { place: "Asosiy zal", direction: "up" },
    { place: "Kofe-brek", direction: "down-left" },
  ]
  test("3 signs → 2 pages", async () => {
    const r = await signsPdf(three, "signal")
    expect(head(r.bytes)).toBe("%PDF-")
    expect(tail(r.bytes)).toContain("%%EOF")
    expect(r.pages).toBe(2)
  })
  test.each(["signal", "ember"])("style %s with every direction", async (s) => {
    const dirs = ["left", "up", "right", "up-left", "up-right", "down", "down-left", "down-right", "both"]
    const r = await signsPdf(dirs.map((direction) => ({ place: "Zal", direction })), s)
    expect(r.pages).toBe(5)
  })
  test("unknown style / direction / empty / over 100 reject", async () => {
    await expect(signsPdf(three, "neon")).rejects.toThrow(/uslubi/)
    await expect(signsPdf([{ place: "Zal", direction: "sideways" }], "signal")).rejects.toThrow(/direction/i)
    await expect(signsPdf([], "signal")).rejects.toThrow()
    await expect(signsPdf([{ place: "  ", direction: "up" }], "signal")).rejects.toThrow()
    await expect(signsPdf(Array.from({ length: 101 }, () => ({ place: "Zal", direction: "up" })), "signal")).rejects.toThrow(/100/)
  })
})

describe("fileSafe", () => {
  test("the web's file name rule", () => {
    expect(fileSafe("Kaizen 8.0 — Toshkent")).toBe("Kaizen_8_0_Toshkent")
  })
})
