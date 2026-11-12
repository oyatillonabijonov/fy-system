// Public page (097): a client fills in their own card through the link staff sent them. No sign-in — the
// token in the URL is the only key; the anon functions return just these fields. Looks like Login on purpose.
import { useEffect, useId, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { Camera, CheckCircle, UserCircle } from "@phosphor-icons/react"
import { useTheme } from "@/context/ThemeContext"
import { ImageCropModal } from "@/components/ui/ImageCropModal"
import { ANKETA_LABELS, type AnketaFields } from "@/lib/anketa"
import { anketaPhotoUrl, openAnketa, submitAnketa, uploadAnketaPhoto, type AnketaOpen } from "@/lib/supabase/queries/anketa"

const FIELD = "w-full h-control-lg max-sm:h-12 px-3.5 bg-surface-sunken border border-transparent rounded-control text-base text-ink placeholder:text-ink-faint hover:bg-surface-sunken-hover focus:border-line-focus outline-none transition-colors"
const PLACEHOLDER: Record<keyof AnketaFields, string> = { full_name: "Masalan, Anvar Karimov", company: "Kompaniya nomi", role: "Masalan, asoschi", activity: "Masalan, qurilish, savdo, IT" }

/** What the form keeps between sends: the typed phone and the sent row (a resend replaces it) */
type Draft = { phone: string; lastId: string | null }
type State = { step: "loading" } | { step: "invalid"; message: string } | { step: "form" | "sent"; info: AnketaOpen; draft: Draft }

export function Anketa() {
  const { token = "" } = useParams()
  const { themeId } = useTheme()
  const [state, setState] = useState<State>({ step: "loading" })

  useEffect(() => {
    document.title = "Fikr Yetakchilari — ma'lumotlaringiz"
    openAnketa(token).then((info) => setState({ step: "form", info, draft: { phone: "", lastId: null } }), (e: Error) => setState({ step: "invalid", message: e.message }))
  }, [token])

  return (
    <div className="min-h-screen max-sm:min-h-dvh relative overflow-hidden flex items-center justify-center p-4 max-sm:p-0 max-sm:bg-surface">
      <img src="/images/bg-field.jpg" alt="" className="absolute inset-0 w-full h-full object-cover max-sm:hidden" />
      <div className="absolute inset-0 bg-black/25 max-sm:hidden" />

      <div className="relative z-10 w-full max-w-[440px] max-sm:max-w-none max-sm:min-h-dvh max-sm:flex max-sm:flex-col">
        <div className="bg-surface border border-line rounded-overlay p-6 sm:p-8 flex flex-col gap-6 max-sm:flex-1 max-sm:border-0 max-sm:rounded-none max-sm:px-5 max-sm:pt-[max(24px,env(safe-area-inset-top))]">
          <div className="flex flex-col items-center gap-4 text-center">
            <img src={themeId === "dark" ? "/Sidebar/Logo-white.svg" : "/Sidebar/Logo.svg"} alt="Fikr Yetakchilari" className="h-8 w-auto" />
            <div className="flex flex-col gap-1">
              <h1 className="text-lg max-sm:text-xl font-semibold text-ink">Ma'lumotlaringiz</h1>
              <p className="text-base text-ink-muted">Klub a'zolari bazasi uchun — to'g'rilang va yetishmaganini to'ldiring</p>
            </div>
          </div>

          {state.step === "loading" && <p className="text-center text-base text-ink-muted py-8">Yuklanmoqda…</p>}
          {state.step === "invalid" && <div role="alert" className="px-3.5 py-3 bg-danger-soft rounded-control text-base text-danger-text">{state.message}</div>}
          {state.step === "form" && <AnketaForm token={token} info={state.info} draft={state.draft} onSent={(info, draft) => setState({ step: "sent", info, draft })} />}
          {state.step === "sent" && (
            <div className="flex flex-col items-center gap-3 text-center py-6">
              <CheckCircle size={48} weight="light" className="text-success" />
              <p className="text-lg font-semibold text-ink">Rahmat! Ma'lumotlaringiz yuborildi.</p>
              <p className="text-base text-ink-muted">Xodimlarimiz tekshirib, kartochkangizga qo'shadi.</p>
              <button type="button" onClick={() => setState({ ...state, step: "form" })}
                className="mt-2 h-10 px-5 rounded-full bg-surface-sunken text-ink text-base font-medium hover:bg-surface-sunken-hover">O'zgartirish</button>
            </div>
          )}
        </div>
        <p className="text-center text-sm text-white/85 max-sm:text-ink-faint mt-5 max-sm:mt-0 max-sm:pt-2 max-sm:pb-[max(20px,env(safe-area-inset-bottom))]">
          © 2026 Fikr Yetakchilari · Biznes Klub
        </p>
      </div>
    </div>
  )
}

function AnketaForm({ token, info, draft, onSent }: { token: string; info: AnketaOpen; draft: Draft; onSent: (info: AnketaOpen, draft: Draft) => void }) {
  const [values, setValues] = useState<AnketaFields>({ full_name: info.full_name, company: info.company, role: info.role, activity: info.activity })
  const [phone, setPhone] = useState(draft.phone)
  const [photoPath, setPhotoPath] = useState(info.photo_path)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState<"" | "photo" | "send">("")
  const [error, setError] = useState("")
  const honeypot = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const universal = info.kind === "universal"
  const photo = photoPath ? anketaPhotoUrl(photoPath) : info.image

  async function onCropped(blob: Blob) {
    setCropSrc(null)
    setBusy("photo"); setError("")
    try { setPhotoPath(await uploadAnketaPhoto(info.link_id, blob)) } catch (e) { setError((e as Error).message) } finally { setBusy("") }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    const sent = { ...info, ...values, photo_path: photoPath }
    if (honeypot.current?.value) { onSent(sent, draft); return }   // a bot filled the hidden field: pretend, send nothing
    setBusy("send")
    try {
      const id = await submitAnketa(token, { ...values, photo_path: photoPath, ...(universal ? { phone, replace_id: draft.lastId } : {}) })
      onSent(sent, { phone, lastId: id })
    } catch (err) { setError((err as Error).message) } finally { setBusy("") }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} aria-label="Rasm tanlash"
          className="relative size-28 rounded-full bg-surface-sunken overflow-hidden flex items-center justify-center text-ink-faint hover:bg-surface-sunken-hover">
          {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <UserCircle size={64} weight="thin" />}
          <span className="absolute bottom-1 right-1 size-8 rounded-full bg-accent text-ink-on-accent flex items-center justify-center"><Camera size={16} /></span>
        </button>
        <span className="text-sm text-ink-muted">{busy === "photo" ? "Rasm yuklanmoqda…" : photo ? "Rasmni almashtirish" : "Rasmingizni qo'shing"}</span>
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropSrc(URL.createObjectURL(f)); e.target.value = "" }} />
      </div>

      {(Object.keys(ANKETA_LABELS) as (keyof AnketaFields)[]).map((k) => (
        <div key={k}>
          <label htmlFor={`${id}-${k}`} className="text-sm font-medium text-ink mb-1.5 block">{ANKETA_LABELS[k]}</label>
          <input id={`${id}-${k}`} value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })}
            required={k === "full_name"} maxLength={k === "full_name" ? 100 : 150} placeholder={PLACEHOLDER[k]}
            autoComplete={k === "full_name" ? "name" : k === "company" ? "organization" : k === "role" ? "organization-title" : "off"} className={FIELD} />
        </div>
      ))}

      {universal ? (
        <div>
          <label htmlFor={`${id}-phone`} className="text-sm font-medium text-ink mb-1.5 block">Telefon</label>
          <input id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="90 123 45 67" className={FIELD} />
        </div>
      ) : info.phone_masked && (
        <p className="text-sm text-ink-muted">Telefon: <span className="tabular-nums text-ink">{info.phone_masked}</span></p>
      )}

      {/* Hidden from people; bots fill every field */}
      <input ref={honeypot} name="fy_hp_field" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] size-px opacity-0" />

      {error && <div role="alert" className="px-3.5 py-2.5 bg-danger-soft rounded-control text-sm text-danger-text font-medium">{error}</div>}

      <button type="submit" disabled={!!busy}
        className="w-full h-control-lg max-sm:h-12 mt-1 bg-accent text-ink-on-accent rounded-full text-base font-medium max-sm:font-semibold hover:bg-accent-hover disabled:opacity-50">
        {busy === "send" ? "Yuborilmoqda…" : "Yuborish"}
      </button>

      {cropSrc && <ImageCropModal isOpen imageSrc={cropSrc} onClose={() => setCropSrc(null)} onCropped={onCropped} outputWidth={1000} outputHeight={1000} />}
    </form>
  )
}
