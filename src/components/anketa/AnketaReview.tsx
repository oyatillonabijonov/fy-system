// Anketalar (097): what clients sent through their links, old → new, approve (staff may fix the text first) or reject.
import { useEffect, useRef, useState } from "react"
import { Copy, IdentificationCard, LinkSimple, QrCode } from "@phosphor-icons/react"
import { useAnketaSubmissions, useApproveAnketa, usePendingAnketaFor, useRejectAnketa, useUniversalAnketaLink } from "@/hooks/useAnketa"
import { AnketaQrSheet } from "@/components/anketa/AnketaQr"
import { toast } from "@/lib/toast"
import { ANKETA_LABELS, fieldChanges, type AnketaFields } from "@/lib/anketa"
import { anketaPhotoUrl, type AnketaSubmission } from "@/lib/supabase/queries/anketa"
import { Sheet } from "@/components/ui/Sheet"
import { Pager, usePaged } from "@/components/ui/Pager"
import { tbl } from "@/components/ui/table"
import { PersonDot } from "@/components/vazifalar/pickers"
import { confirmAction } from "@/lib/confirm"
import { formatPhone } from "@/lib/format"

const KEYS = Object.keys(ANKETA_LABELS) as (keyof AnketaFields)[]
const FIELD = "w-full h-control-md px-3 rounded-control bg-surface border border-line text-base text-ink focus:outline-none focus:border-line-focus"
const STATUS = { pending: "Kutilmoqda", approved: "Tasdiqlangan", rejected: "Rad etilgan" } as const

const when = (iso: string) => new Date(iso).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
const sentFields = (s: AnketaSubmission): AnketaFields => ({ full_name: s.full_name, company: s.company ?? "", role: s.role ?? "", activity: s.activity ?? "" })
const cardFields = (s: AnketaSubmission): AnketaFields =>
  ({ full_name: s.client?.full_name ?? "", company: s.client?.company ?? "", role: s.client?.role ?? "", activity: s.client?.activity ?? "" })

export function AnketaReview() {
  const [view, setView] = useState<"pending" | "reviewed">("pending")
  const { data = [], isLoading } = useAnketaSubmissions(view)
  const { page, setPage, pageCount, pageItems } = usePaged(data)
  const [open, setOpen] = useState<AnketaSubmission | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Anketalar" className="inline-flex gap-1 p-1 rounded-full bg-surface-sunken">
          {([["pending", "Kutilmoqda"], ["reviewed", "Ko'rib chiqilgan"]] as const).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}
              className={`h-8 px-3.5 rounded-full text-sm font-medium whitespace-nowrap ${view === v ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}>{label}</button>
          ))}
        </div>
        <BlankAnketaButton />
      </div>

      <div className={tbl.scroll}>
        <table className={tbl.table}>
          <thead><tr>{["Mijoz", "Telefon", "Havola", view === "pending" ? "Yuborilgan" : "Holat"].map((h) => <th key={h} className={tbl.th}>{h}</th>)}</tr></thead>
          <tbody>
            {pageItems.map((s) => (
              <tr key={s.id} className={`${tbl.tr} cursor-pointer`} onClick={() => setOpen(s)}>
                <td className={tbl.td}>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <PersonDot name={s.full_name} url={s.photo_path ? anketaPhotoUrl(s.photo_path) : s.client?.image} size={32} />
                    <span className="truncate">{s.full_name}</span>
                  </span>
                </td>
                <td className={`${tbl.td} tabular-nums whitespace-nowrap`}>{formatPhone(s.phone ?? s.client?.phone)}</td>
                <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{s.phone ? "Umumiy" : "Shaxsiy"}</td>
                <td className={`${tbl.td} text-ink-muted whitespace-nowrap tabular-nums`}>{view === "pending" ? when(s.created_at) : STATUS[s.status]}</td>
              </tr>
            ))}
            {pageItems.length === 0 && <tr><td colSpan={4} className={tbl.empty}>{isLoading ? "Yuklanmoqda…" : view === "pending" ? "Tekshirishni kutayotgan anketa yo'q" : "Hali hech narsa ko'rib chiqilmagan"}</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={pageCount} total={data.length} onPage={setPage} />
      {open && <AnketaSheet submission={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Old → new, the four texts editable, the photo, who it lands on; Tasdiqlash / Rad etish */
export function AnketaSheet({ submission: s, onClose }: { submission: AnketaSubmission; onClose: () => void }) {
  const approve = useApproveAnketa()
  const reject = useRejectAnketa()
  const card = cardFields(s)
  const [values, setValues] = useState<AnketaFields>(sentFields(s))
  const changed = new Set(fieldChanges(card, values))
  const pending = s.status === "pending"
  const photo = s.photo_path ? anketaPhotoUrl(s.photo_path) : null
  const busy = approve.isPending || reject.isPending

  async function onReject() {
    if (await confirmAction({ title: "Anketani rad etish", message: "Kartochka o'zgarmaydi. Mijoz havola orqali qayta yuborishi mumkin.", confirmLabel: "Rad etish" })) {
      reject.mutate(s.id, { onSuccess: onClose })
    }
  }

  return (
    <Sheet open onClose={onClose} title="Anketa" className="sm:max-w-lg" footer={pending && (
      <div className="flex gap-2">
        <button type="button" onClick={onReject} disabled={busy} className="h-10 px-4 rounded-full bg-surface-sunken text-ink text-base font-medium hover:bg-surface-sunken-hover disabled:opacity-50">Rad etish</button>
        <button type="button" disabled={busy || !values.full_name.trim()}
          onClick={() => approve.mutate({ id: s.id, overrides: { ...values, ...(photo ? { image: photo } : {}) } }, { onSuccess: onClose })}
          className="flex-1 h-10 px-4 rounded-full bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover disabled:opacity-50">
          {approve.isPending ? "Saqlanmoqda…" : "Tasdiqlash"}
        </button>
      </div>
    )}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          {s.phone ? <>Umumiy havola · {formatPhone(s.phone)} · {s.client ? <>Bor mijoz: <span className="text-ink">{s.client.full_name}</span></> : "Yangi mijoz ochiladi"}</> : "Shaxsiy havola"}
          {" · "}{when(s.created_at)}{!pending && ` · ${STATUS[s.status]}`}
        </p>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <PersonDot name={card.full_name || s.full_name} url={s.client?.image} size={56} />
            <span className="text-xs text-ink-faint">Hozir</span>
          </div>
          <span className="text-ink-faint" aria-hidden>→</span>
          <div className="flex flex-col items-center gap-1">
            {photo ? <img src={photo} alt="Yangi rasm" className="size-14 rounded-full object-cover" /> : <PersonDot name={s.full_name} url={s.client?.image} size={56} />}
            <span className={`text-xs ${photo ? "text-success-text font-medium" : "text-ink-faint"}`}>{photo ? "Yangi rasm" : "Rasm yo'q"}</span>
          </div>
        </div>

        {KEYS.map((k) => (
          <div key={k} className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink flex items-center gap-2">
              {ANKETA_LABELS[k]}{changed.has(k) && <span className="text-xs font-medium px-1.5 rounded-full bg-success-soft text-success-text">o'zgargan</span>}
            </span>
            {card[k] && changed.has(k) && <span className="text-sm text-ink-faint line-through break-words">{card[k]}</span>}
            {pending
              ? <input value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })} aria-label={ANKETA_LABELS[k]} className={FIELD} />
              : <span className="text-base text-ink break-words">{values[k] || "—"}</span>}
          </div>
        ))}
        {pending && <p className="text-xs text-ink-faint">Bo'sh qoldirilgan maydon kartochkadagi qiymatni o'zgartirmaydi.</p>}
      </div>
    </Sheet>
  )
}

/** The universal (blank) anketa link for someone not in the base yet — a friend's referral, no form, no phone:
 *  they fill in everything themselves, the anketa lands here, approval adds them to Mijozlar */
function BlankAnketaButton() {
  const { data: url } = useUniversalAnketaLink(true)   // fetched up front: iOS copies only inside the tap
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc) }
  }, [open])
  const row = "w-full h-10 px-3 flex items-center gap-2.5 rounded-item text-base text-ink hover:bg-mute-ghost-hover disabled:opacity-40"

  function copy() {
    setOpen(false)
    if (!url) return
    navigator.clipboard.writeText(url).then(
      () => toast.success("Bo'sh anketa havolasi nusxalandi", "Yangi odamga Telegram orqali yuboring"),
      () => toast.info("Havolani qo'lda nusxalang", url),
    )
  }

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}
        className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-full bg-accent text-ink-on-accent text-sm font-medium whitespace-nowrap hover:bg-accent-hover">
        <LinkSimple size={16} />Bo'sh anketa havolasi
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-20 w-72 p-1 rounded-menu bg-surface border border-line">
          <p className="px-3 py-2 text-sm text-ink-muted">Bazada yo'q odam uchun: ma'lumotlari va telefonini o'zi yozadi, tasdiqlasangiz Mijozlar'ga qo'shiladi.</p>
          <button role="menuitem" type="button" className={row} onClick={copy} disabled={!url}><Copy size={18} />{url ? "Nusxalash" : "Tayyorlanmoqda…"}</button>
          <button role="menuitem" type="button" className={row} disabled={!url} onClick={() => { setOpen(false); setQr(true) }}><QrCode size={18} />QR kod</button>
        </div>
      )}
      <AnketaQrSheet url={url} open={qr} onClose={() => setQr(false)} />
    </div>
  )
}

/** On the bitim page / client card: the client sent an anketa that waits for a check */
export function AnketaPending({ clientId }: { clientId: string }) {
  const { data } = usePendingAnketaFor(clientId)
  const [open, setOpen] = useState(false)
  if (!data) return null
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-warning-soft text-warning-text text-sm font-medium whitespace-nowrap">
        <IdentificationCard size={16} />Anketa yuborildi — tekshirish
      </button>
      {open && <AnketaSheet submission={data} onClose={() => setOpen(false)} />}
    </>
  )
}
