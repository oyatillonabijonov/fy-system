// SMS to ONE client (095): pick an approved template, fill its blanks, see the text with the client's
// name, send now or later. Used in the bitim composer, the phone-number menu and the Mijozlar card.
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { PaperPlaneRight } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useSendSmsTemplate, useSmsTemplates } from "@/hooks/useSms"
import { KIND_LABEL } from "@/lib/supabase/queries/sms"
import { blanks, fillTemplate, smsParts } from "@/lib/sms"

const FIELD = "w-full h-control-md px-3 rounded-control bg-surface border border-line text-base text-ink focus:outline-none focus:border-line-focus"

/** "2026-11-12T09:00" (the browser's clock, Tashkent for staff) → ISO; empty = now */
const toIso = (local: string) => (local ? new Date(local).toISOString() : null)

export function SmsSend({ clientId, clientName, optOut, onSent }: { clientId: string; clientName: string | null; optOut?: boolean; onSent?: () => void }) {
  const { hasAccess } = useAuth()
  const { data: all = [], isLoading } = useSmsTemplates()
  const templates = useMemo(() => all.filter((t) => t.status === "approved" && !t.hidden && t.kind), [all])
  const send = useSendSmsTemplate()
  const [id, setId] = useState("")
  const [values, setValues] = useState<Record<string, string>>({})
  const [later, setLater] = useState("")
  const [schedule, setSchedule] = useState(false)

  const t = templates.find((x) => x.id === id) ?? null
  const keys = t ? blanks(t.text) : []
  const text = t ? fillTemplate(t.text, values, clientName) : ""
  const missing = keys.some((k) => !values[k]?.trim())
  const blockedPromo = t?.kind === "promo" && optOut
  const { parts } = smsParts(text)

  if (isLoading) return <p className="text-sm text-ink-muted p-1">Yuklanmoqda…</p>
  if (templates.length === 0) {
    return (
      <p className="text-sm text-ink-muted p-1">
        Tasdiqlangan shablon yo'q.{hasAccess("sms") && <> <Link to="/sms?tab=templates" className="text-ink underline underline-offset-2">Shablon yozish</Link></>}
      </p>
    )
  }

  function submit() {
    if (!t || missing || blockedPromo) return
    send.mutate({ templateId: t.id, values, clientIds: [clientId], sendAt: schedule ? toIso(later) : null }, {
      onSuccess: () => { setId(""); setValues({}); setSchedule(false); setLater(""); onSent?.() },
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <select value={id} onChange={(e) => { setId(e.target.value); setValues({}) }} aria-label="Shablon" className={FIELD}>
        <option value="">Shablonni tanlang…</option>
        {(["reminder", "promo"] as const).map((k) => {
          const list = templates.filter((x) => x.kind === k)
          return list.length > 0 && (
            <optgroup key={k} label={KIND_LABEL[k]}>
              {list.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </optgroup>
          )
        })}
      </select>

      {keys.map((k) => (
        <input key={k} value={values[k] ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })}
          placeholder={k} aria-label={k} className={FIELD} />
      ))}

      {t && (
        <div className="rounded-control bg-surface-sunken px-3 py-2">
          <p className="text-base text-ink whitespace-pre-wrap break-words">{text}</p>
          <p className="mt-1 text-xs text-ink-faint tabular-nums">{KIND_LABEL[t.kind!]} · {text.length} belgi · {parts} SMS</p>
        </div>
      )}
      {blockedPromo && <p className="text-sm text-danger-text">Mijoz reklama SMS'idan voz kechgan — bu shablon unga yuborilmaydi.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Qachon" className="inline-flex gap-1 p-1 rounded-full bg-surface-sunken">
          {([[false, "Hozir"], [true, "Keyinroq"]] as const).map(([v, label]) => (
            <button key={label} type="button" role="radio" aria-checked={schedule === v} onClick={() => setSchedule(v)}
              className={`h-7 px-3 rounded-full text-sm font-medium whitespace-nowrap ${schedule === v ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}>{label}</button>
          ))}
        </div>
        {schedule && <input type="datetime-local" value={later} onChange={(e) => setLater(e.target.value)} aria-label="Yuborish vaqti"
          className="h-9 px-3 rounded-control bg-surface border border-line text-sm text-ink" />}
        <button type="button" onClick={submit} disabled={!t || missing || !!blockedPromo || send.isPending || (schedule && !later)}
          className="ml-auto h-9 px-4 shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent text-ink-on-accent text-sm font-medium hover:bg-accent-hover disabled:opacity-40">
          <PaperPlaneRight size={16} />{send.isPending ? "Yuborilmoqda…" : schedule ? "Rejalashtirish" : "SMS yuborish"}
        </button>
      </div>
      <p className="text-xs text-ink-faint">SMS 9:00–21:00 oralig'ida ketadi; kechroq yuborilgani ertalab 9:00 da jo'naydi.</p>
    </div>
  )
}
