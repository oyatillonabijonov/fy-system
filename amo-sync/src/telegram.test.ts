import { expect, test } from "bun:test"
import { expenseText } from "./telegram"

const d = { amount: 2_000_000, category: "zal", event: "Tog' safari 7.0", note: "Avans <50%>", reason: null, staff: "Hikmat", at: new Date("2026-09-29T09:30:00Z") }

test("expense message: amount, category · event, note, who and when (Tashkent)", () => {
  expect(expenseText("expense", d)).toBe(
    "💸 <b>Chiqim · 2 000 000 so'm</b>\nZal · Tog' safari 7.0\nIzoh: Avans &lt;50%&gt;\nKiritdi: Hikmat · 29-sentyabr 2026, 14:30")
})

test("voided expense: struck amount, reason, general expense when no event", () => {
  const msg = expenseText("expense_void", { ...d, event: null, note: null, reason: "Xato kiritildi" })
  expect(msg).toBe("↩️ <b>Chiqim bekor qilindi · <s>2 000 000 so'm</s></b>\nZal · Umumiy xarajat\nSabab: Xato kiritildi\nBekor qildi: Hikmat · 29-sentyabr 2026, 14:30")
})
