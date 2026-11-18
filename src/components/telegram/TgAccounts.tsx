// Integratsiyalar → Telegram (100): the company accounts connected to the ERP, and "Telegram ulash" (QR + 2FA).
import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { CheckCircle, Plus } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { Sheet } from "@/components/ui/Sheet"
import { tbl } from "@/components/ui/table"
import { useUsers } from "@/hooks/useUsers"
import { TG_KEY, tgBeginLogin, tgLoginState, tgSubmitPassword, useTgAccounts, useTgLogout, useTgStatus } from "@/hooks/useTelegram"
import type { LoginState } from "@/lib/supabase/queries/telegram"
import { confirmAction } from "@/lib/confirm"
import { formatPhone } from "@/lib/format"

const FIELD = "w-full h-control-md max-sm:h-12 border border-line rounded-control px-3 text-base text-ink bg-surface focus:outline-none focus:border-line-focus"
const PRIMARY = "h-control-md max-sm:h-12 px-4 inline-flex items-center justify-center gap-2 rounded-full bg-accent text-ink-on-accent text-base font-medium whitespace-nowrap hover:bg-accent-hover disabled:opacity-40"
const STATUS = { active: { label: "Ulangan", dot: "bg-success" }, logged_out: { label: "Uzilgan", dot: "bg-danger" }, pending: { label: "Ulanmoqda", dot: "bg-warning" } } as const

export function TelegramSection() {
  const { data: enabled } = useTgStatus()
  const { data: accounts = [], isLoading } = useTgAccounts()
  const logout = useTgLogout()
  const [connecting, setConnecting] = useState(false)

  return (
    <section className="flex flex-col gap-4 max-lg:gap-2">
      {enabled && <button type="button" onClick={() => setConnecting(true)} className={`${PRIMARY} self-start`}><Plus size={16} /> Telegram ulash</button>}
      {enabled === false && (
        <p className="px-4 py-3 rounded-surface bg-warning-soft text-sm text-warning-text">
          Serverda Telegram sozlanmagan: my.telegram.org dan olingan TELEGRAM_API_ID va TELEGRAM_API_HASH kerak.
        </p>
      )}
      <div className={tbl.scroll}>
        <table className={tbl.table}>
          <thead><tr>{["Akkaunt", "Raqam", "Kimniki", "Holat", ""].map((h, i) => <th key={i} className={`${tbl.th} ${i === 1 || i === 2 ? "max-md:hidden" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={5} className={tbl.empty}>Yuklanmoqda…</td></tr>
              : accounts.length === 0 ? <tr><td colSpan={5} className={tbl.empty}>Hali akkaunt ulanmagan</td></tr>
              : accounts.map((a) => (
                <tr key={a.id} className={tbl.tr}>
                  <td className={`${tbl.td} font-medium`}>{a.title}</td>
                  <td className={`${tbl.td} tabular-nums whitespace-nowrap max-md:hidden`}>{a.phone ? formatPhone(`+${a.phone.replace(/^\+/, "")}`) : "—"}</td>
                  <td className={`${tbl.td} text-ink-muted max-md:hidden`}>{a.owner?.full_name ?? "Umumiy"}</td>
                  <td className={tbl.td}><span className="inline-flex items-center gap-2 text-sm text-ink-muted whitespace-nowrap"><span className={`size-2 rounded-full ${STATUS[a.status].dot}`} />{STATUS[a.status].label}</span></td>
                  <td className={`${tbl.td} text-right`}>
                    {a.status === "active" && (
                      <button type="button" disabled={logout.isPending}
                        onClick={async () => { if (await confirmAction({ title: "Akkauntni uzish", message: `${a.title} ERP'dan uziladi. Yozishmalar tarixi saqlanib qoladi.`, confirmLabel: "Uzish", danger: true })) logout.mutate(a.id) }}
                        className="h-8 px-3 rounded-full text-sm text-danger-text hover:bg-danger-soft whitespace-nowrap">Uzish</button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {connecting && <ConnectSheet onClose={() => setConnecting(false)} />}
    </section>
  )
}

function ConnectSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: users = [] } = useUsers()
  const sellers = users.filter((u) => u.is_active && u.department === "sotuv")
  const [title, setTitle] = useState("Kompaniya")
  const [owner, setOwner] = useState("")
  const [id, setId] = useState<string | null>(null)
  const [state, setState] = useState<LoginState | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!id) return
    let stop = false
    const poll = async () => {
      if (stop) return
      const s = await tgLoginState(id).catch((e: Error) => ({ state: "error", message: e.message }) as LoginState)
      if (stop) return
      setState(s)
      if (s.state === "done") void qc.invalidateQueries({ queryKey: TG_KEY })
      else if (s.state !== "error") setTimeout(poll, 1500)
    }
    void poll()
    return () => { stop = true }
  }, [id, qc])

  useEffect(() => { if (state?.state === "qr") void QRCode.toDataURL(state.url, { width: 512, margin: 2 }).then(setQr) }, [state])

  async function start() {
    setError("")
    try { setId((await tgBeginLogin(title.trim() || "Kompaniya", owner || null)).id) } catch (e) { setError((e as Error).message) }
  }

  return (
    <Sheet open onClose={onClose} title="Telegram ulash">
      {!id ? (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5"><span className="text-sm font-medium text-ink">Nomi</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} className={FIELD} /></label>
          <label className="flex flex-col gap-1.5"><span className="text-sm font-medium text-ink">Kimniki</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className={FIELD}>
              <option value="">Umumiy — hamma sotuvchilar shundan yozadi</option>
              {sellers.map((u) => <option key={u.id} value={u.id}>{u.full_name} — shaxsiy ish raqami</option>)}
            </select></label>
          {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          <button type="button" onClick={start} className={PRIMARY}>QR kodni ko'rsatish</button>
        </div>
      ) : state?.state === "done" ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle size={48} weight="light" className="text-success" />
          <p className="text-lg font-semibold text-ink">Ulandi: {state.title}</p>
          <button type="button" onClick={onClose} className={PRIMARY}>Tayyor</button>
        </div>
      ) : state?.state === "password" ? (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void tgSubmitPassword(id, password); setPassword("") }}>
          <p className="text-base text-ink">Akkauntda ikki bosqichli himoya bor — Telegram parolini kiriting.</p>
          <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Telegram paroli" className={FIELD} />
          <p className="text-xs text-ink-faint">Parol faqat Telegramga uzatiladi, ERP uni saqlamaydi.</p>
          <button type="submit" disabled={!password} className={PRIMARY}>Davom etish</button>
        </form>
      ) : state?.state === "error" ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="px-3.5 py-3 rounded-control bg-danger-soft text-base text-danger-text">{state.message}</p>
          <button type="button" onClick={() => { setId(null); setState(null); setQr(null) }} className={PRIMARY}>Qaytadan</button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {qr ? <img src={qr} alt="Telegramga kirish QR kodi" className="w-64 h-64 rounded-control bg-white" /> : <div className="w-64 h-64 rounded-control bg-surface-sunken flex items-center justify-center text-sm text-ink-muted">QR kod tayyorlanmoqda…</div>}
          <ol className="text-sm text-ink-muted list-decimal pl-5 flex flex-col gap-1 self-stretch">
            <li>Kompaniya raqami ochilgan telefonda Telegramni oching</li>
            <li>Sozlamalar → Qurilmalar → Qurilmani ulash</li>
            <li>Shu QR kodni skanerlang</li>
          </ol>
        </div>
      )}
    </Sheet>
  )
}
