import { expect, test } from "bun:test"
import { receiptCaption, renderReceipt, type ReceiptData } from "./receipt"

const exp: ReceiptData = {
  kind: "expense", number: "F7000000", amount: 2_000_000, at: new Date("2026-09-29T09:30:00Z"),
  client: "Zal", phone: null, event: "Tog' safari 7.0", method: null, staff: "Hikmat", reason: null,
  note: "Avans, qolgani tadbir kuni", price: 0, paid: 0,
}

test("expense receipt: a PNG, caption with category · event and the note", () => {
  const png = renderReceipt(exp)
  expect([...png.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47])   // "PNG"
  expect(receiptCaption(exp)).toBe("💸 Xarajat kiritildi: 2 000 000 so'm\nZal · Tog' safari 7.0 · 29-sentyabr 2026, 14:30\nIzoh: Avans, qolgani tadbir kuni")
})

test("voided expense: the reason under the photo; payment captions unchanged", () => {
  expect(receiptCaption({ ...exp, kind: "expense_void", reason: "Xato kiritildi" }))
    .toBe("❌ Xarajat bekor qilindi: 2 000 000 so'm\nZal · Tog' safari 7.0 · 29-sentyabr 2026, 14:30\nSabab: Xato kiritildi")
  expect(receiptCaption({ ...exp, kind: "payment", client: "Nuriddin Aliyev", note: null, price: 22_000_000, paid: 15_000_000 }))
    .toBe("🧾 To'lov qabul qilindi: 2 000 000 so'm\nNuriddin Aliyev · 29-sentyabr 2026, 14:30")
})
