// The bitim's Telegram tab (100): pick a template and/or type, attach files, send from the company account.
import { useRef, useState } from "react"
import { Paperclip, PaperPlaneRight, X } from "@phosphor-icons/react"
import { useSendTelegram, useTgTemplates } from "@/hooks/useTelegram"
import { uploadTgFile, type TgFileRef } from "@/lib/supabase/queries/telegram"
import { TG_MAX_FILE } from "@/lib/telegram"
import { toast } from "@/lib/toast"

export function TgComposer({ leadId, onSent }: { leadId: string; onSent?: () => void }) {
  const { data: templates = [] } = useTgTemplates()
  const send = useSendTelegram()
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [files, setFiles] = useState<TgFileRef[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const template = templates.find((t) => t.id === templateId) ?? null

  function pick(id: string) {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    if (templateId === id) { setTemplateId(null); setText(""); return }
    setTemplateId(id)
    setText(t.body)
  }

  async function attach(list: FileList | null) {
    const picked = [...(list ?? [])].slice(0, 5 - files.length)
    if (picked.some((f) => f.size > TG_MAX_FILE)) { setError("Har bir fayl 10 MB gacha"); return }
    setUploading(true); setError("")
    try { const up = await Promise.all(picked.map((f) => uploadTgFile(`out/${leadId}`, f))); setFiles((fs) => [...fs, ...up]) }
    catch (e) { setError((e as Error).message) }
    finally { setUploading(false) }
  }

  function submit() {
    setError("")
    send.mutate({ lead_id: leadId, text, template_id: templateId, files }, {
      onSuccess: () => { setText(""); setFiles([]); setTemplateId(null); toast.success("Telegramga yuborildi"); onSent?.() },
      onError: (e) => setError(e.message),
    })
  }

  const empty = !text.trim() && !files.length && !template?.files.length
  return (
    <div className="flex flex-col gap-2 p-2">
      {templates.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-1">
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => pick(t.id)} aria-pressed={templateId === t.id}
              className={`h-8 px-3 shrink-0 rounded-full text-sm whitespace-nowrap border transition-colors ${templateId === t.id ? "border-ink text-ink bg-surface-sunken" : "border-line text-ink-muted hover:text-ink"}`}>
              {t.title}{t.files.length ? ` · 📎${t.files.length}` : ""}
            </button>
          ))}
        </div>
      )}
      {(template?.files.length || files.length) ? (
        <div className="flex flex-wrap gap-1.5 px-1">
          {template?.files.map((f) => <span key={f.path} className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-full bg-surface-sunken text-sm text-ink-muted max-w-56"><Paperclip size={12} weight="bold" /><span className="truncate">{f.name}</span></span>)}
          {files.map((f) => (
            <span key={f.path} className="h-7 pl-2.5 pr-1 inline-flex items-center gap-1.5 rounded-full bg-surface-sunken text-sm text-ink max-w-56">
              <Paperclip size={12} weight="bold" /><span className="truncate">{f.name}</span>
              <button type="button" aria-label="Olib tashlash" onClick={() => setFiles(files.filter((x) => x.path !== f.path))} className="size-5 rounded-full flex items-center justify-center hover:bg-mute-ghost-hover"><X size={12} weight="bold" /></button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <button type="button" aria-label="Fayl biriktirish" disabled={uploading || files.length >= 5} onClick={() => fileRef.current?.click()}
          className="size-9 shrink-0 rounded-full flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover disabled:opacity-40"><Paperclip size={18} /></button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { void attach(e.target.files); e.target.value = "" }} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000}
          placeholder={uploading ? "Fayl yuklanmoqda…" : "Telegram xabari… ({ism} o'zi to'ldiriladi)"}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !empty) submit() }}
          className="flex-1 resize-none bg-transparent px-1.5 py-1 text-base text-ink placeholder:text-ink-faint focus:outline-none" />
        <button type="button" onClick={submit} disabled={empty || uploading || send.isPending}
          className="h-9 px-4 shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent text-ink-on-accent text-sm font-medium hover:bg-accent-hover disabled:opacity-40">
          <PaperPlaneRight size={16} />{send.isPending ? "Yuborilmoqda…" : "Yuborish"}
        </button>
      </div>
      {error && <p role="alert" className="px-1.5 text-sm text-danger-text">{error}</p>}
    </div>
  )
}
