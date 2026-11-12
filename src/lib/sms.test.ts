// bun test src/lib/sms.test.ts
import { expect, test } from "bun:test"
import { blanks, fillTemplate, fitsTemplate, smsParts, toPattern } from "./sms"

// Real templates from the Eskiz account and the texts it approved them from
const MISSED = "Sizga afsus bog'lana olmadik.  \n%w{1,15} uchun %d{1,3} ga qayta aloqaga chiqing."
const RAFT = "Raftingga kettikmi?\nFikr yetakchilari bilan 29-avgust kuni Rafting mashg'uloti o'tkazyapmiz.\n\nQo'shilish uchun: %w"

test("approved examples fit their templates", () => {
  expect(fitsTemplate("Sizga afsus bog'lana olmadik.  \n23-25 oktabrdagi Tog' safari uchun +998555160077 ga qayta aloqaga chiqing.", [MISSED])).toBe(true)
  expect(fitsTemplate("Raftingga kettikmi?\nFikr yetakchilari bilan 29-avgust kuni Rafting mashg'uloti o'tkazyapmiz.\n\nQo'shilish uchun: https://t.me/mehr_menejeri_1", [RAFT])).toBe(true)
})

test("changed fixed text or a non-number in %d does not fit", () => {
  expect(fitsTemplate("Sizga bog'lana olmadik. Safar uchun +998555160077 ga qayta aloqaga chiqing.", [MISSED])).toBe(false)
  expect(fitsTemplate("Sizga afsus bog'lana olmadik. Safar uchun telefon ga qayta aloqaga chiqing.", [MISSED])).toBe(false)
  expect(fitsTemplate("Raftingga kettikmi? Qo'shilish uchun: a b", [RAFT])).toBe(false)
})

test("SMS parts: Latin 160/153, Cyrillic 70/67", () => {
  expect(smsParts("a".repeat(160)).parts).toBe(1)
  expect(smsParts("a".repeat(161)).parts).toBe(2)
  expect(smsParts("я".repeat(70)).parts).toBe(1)
  expect(smsParts("я".repeat(71)).parts).toBe(2)
})

test("blanks: the {…} keys except ism, in order, once each", () => {
  expect(blanks("Salom, {ism}! {sana} kuni {joy}da. {sana} esingizda bo'lsin")).toEqual(["sana", "joy"])
  expect(blanks("Tayyor matn")).toEqual([])
})

test("fillTemplate: blanks from values, {ism} = the first name only", () => {
  expect(fillTemplate("Salom, {ism}! {sana} kuni", { sana: "28-noyabr" }, "Anvar Karimov")).toBe("Salom, Anvar! 28-noyabr kuni")
  expect(fillTemplate("Salom, {ism}!", {}, null)).toBe("Salom, !")
})

test("toPattern: what Eskiz gets to approve — {ism} one word, other blanks up to 10 words", () => {
  expect(toPattern("Salom, {ism}! {sana} kuni")).toBe("Salom, %w! %w{1,10} kuni")
  expect(fitsTemplate(fillTemplate("Salom, {ism}! {sana} kuni", { sana: "28-noyabr, shanba" }, "Ali"), [toPattern("Salom, {ism}! {sana} kuni")])).toBe(true)
})

test("{havola}: the anketa link blank (097) is an ordinary blank and a filled URL fits its pattern", () => {
  const t = "{ism}, ma'lumotlaringizni to'ldiring: {havola}"
  expect(blanks(t)).toEqual(["havola"])
  expect(fitsTemplate(fillTemplate(t, { havola: "https://app.fikryetakchilari.uz/anketa/3f9c0a1b2c3d4e5f60718293a4b5c6d7" }, "Ali Valiyev"), [toPattern(t)])).toBe(true)
})
