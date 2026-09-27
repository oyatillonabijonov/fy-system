import { useId, useState } from "react"
import { useEvents } from "@/hooks/useEvents"
import { useAddExpense, useVoidExpense } from "@/hooks/useFinance"
import { EXPENSE_CATEGORY_LABEL, type ExpenseCategory, type ExpenseRow } from "@/lib/supabase/queries/finance"
import { ModalShell, INPUT, LABEL } from "@/components/moliya/PaymentActionModals"
import { tashkentToday } from "@/lib/period"
import { formatMoney, formatNumber } from "@/lib/format"
import { ReceiptInput } from "@/components/moliya/Receipt"

// Both modals are mounted only while open, so their state starts fresh.
export function AddExpenseModal({ defaultEventId, onClose }: { defaultEventId: string | null; onClose: () => void }) {
  const add = useAddExpense()
  const { data: events = [] } = useEvents()
  const categoryId = useId()
  const eventId = useId()
  const amountId = useId()
  const dateId = useId()
  const noteId = useId()
  const [category, setCategory] = useState<ExpenseCategory | "">("")
  const [event, setEvent] = useState(defaultEventId ?? "")
  const [amount, setAmount] = useState("")
  const [spentAt, setSpentAt] = useState(tashkentToday())
  const [note, setNote] = useState("")
  const [receipt, setReceipt] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const amountNum = amount ? Number(amount) : 0

  return (
    <ModalShell
      title="Xarajat qo'shish"
      error={error}
      submitLabel="Saqlash"
      canSubmit={category !== "" && amountNum > 0 && spentAt !== ""}
      pending={add.isPending}
      onClose={onClose}
      onSubmit={() =>
        category !== "" &&
        add.mutate(
          { category, amount: amountNum, spentAt, eventId: event || null, note: note.trim(), receipt },
          {
            onSuccess: (attached) => {
              if (!attached) window.alert("Xarajat saqlandi, lekin chek yuklanmadi — Xarajatlar ro'yxatidan qayta biriktiring")
              onClose()
            },
            onError: (e) => setError(e.message),
          },
        )
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={categoryId} className={LABEL}>Kategoriya *</label>
        <select id={categoryId} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory | "")} className={INPUT} autoFocus>
          <option value="">Tanlang</option>
          {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
            <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={eventId} className={LABEL}>Tadbir</label>
        <select id={eventId} value={event} onChange={(e) => setEvent(e.target.value)} className={INPUT}>
          <option value="">Umumiy (tadbirsiz)</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={amountId} className={LABEL}>Summa *</label>
        <input
          id={amountId}
          inputMode="numeric"
          value={amount ? formatNumber(Number(amount)) : ""}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          placeholder="0"
          className={INPUT}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={dateId} className={LABEL}>Sana *</label>
        <input id={dateId} type="date" value={spentAt} max={tashkentToday()} onChange={(e) => setSpentAt(e.target.value)} className={INPUT} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={noteId} className={LABEL}>Izoh</label>
        <input id={noteId} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} placeholder="Masalan: zal ijarasi, 2-kun" />
      </div>
      <ReceiptInput file={receipt} onChange={setReceipt} />
    </ModalShell>
  )
}

export function VoidExpenseModal({ expense, onClose }: { expense: ExpenseRow; onClose: () => void }) {
  const voidExp = useVoidExpense()
  const reasonId = useId()
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  return (
    <ModalShell
      title="Xarajatni bekor qilish"
      error={error}
      submitLabel="Bekor qilish"
      danger
      canSubmit={reason.trim().length > 0}
      pending={voidExp.isPending}
      onClose={onClose}
      onSubmit={() =>
        voidExp.mutate({ id: expense.id, reason: reason.trim() }, { onSuccess: onClose, onError: (e) => setError(e.message) })
      }
    >
      <p className="text-sm text-ink-muted">
        <span className="font-semibold text-ink">{EXPENSE_CATEGORY_LABEL[expense.category]}</span> · {formatMoney(expense.amount)}.
        Yozuv o'chirilmaydi — ro'yxatda chizilgan holda qoladi va hisobga kirmaydi.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={reasonId} className={LABEL}>Sabab *</label>
        <textarea id={reasonId} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus className={`${INPUT} resize-none`} placeholder="Masalan: summa xato kiritilgan" />
      </div>
    </ModalShell>
  )
}
