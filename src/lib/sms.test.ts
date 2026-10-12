// bun test src/lib/sms.test.ts
import { expect, test } from "bun:test"
import { fitsTemplate, smsParts } from "./sms"

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
