// The chat's footer (100, redesigned 2026-11-18): template chips, 📎, a growing text field — Enter sends,
// Shift+Enter breaks the line — and the send button.
import { useLayoutEffect, useRef, useState } from "react"
import { Lightning, Paperclip, PaperPlaneRight, X } from "@phosphor-icons/react"
import { useSendTelegram, useTgTemplates } from "@/hooks/useTelegram"
import { useLead } from "@/hooks/useSotuv"
import { uploadTgFile, type TgFileRef } from "@/lib/supabase/queries/telegram"
import { TG_MAX_FILE, smsFallback } from "@/lib/telegram"
import { openSms } from "@/lib/smsOffer"

const CHIP = "h-7 px-2.5 shrink-0 inline-flex items-center gap-1.5 rounded-full text-sm whitespace-nowrap max-w-56"

export function TgComposer({ leadId }: { leadId: string }) {
  const { data: all = [] } = useTgTemplates()
  const { data: lead } = useLead(leadId)
  // 101: this bitim's voronka's templates plus the general ones — another event's PDF never shows here
  const templates = all.filter((t) => !t.pipeline_id || t.pipeline_id === lead?.pipeline_id)
  const send = useSendTelegram()
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [files, setFiles] = useState<TgFileRef[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [offerSms, setOfferSms] = useState(false)   // Telegram can't reach this person: SMS instead
  const fileRef = useRef<HTMLInputElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  // grow with the text up to 160px (Safari has no field-sizing: content)
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])
  const template = templates.find((t) => t.id === templateId) ?? null

  function pick(id: string) {
    if (templateId === id) { setTemplateId(null); setText(""); return }
    const t = templates.find((x) => x.id === id)
    if (t) { setTemplateId(id); setText(t.body) }
  }

  async function attach(list: FileList | null) {
    const picked = [...(list ?? [])].slice(0, 5 - files.length)
    if (picked.some((f) => f.size > TG_MAX_FILE)) { setError("Har bir fayl 10 MB gacha"); return }
    setUploading(true); setError("")
    try { const up = await Promise.all(picked.map((f) => uploadTgFile(`out/${leadId}`, f))); setFiles((fs) => [...fs, ...up]) }
    catch (e) { setError((e as Error).message) }
    finally { setUploading(false) }
  }

  const empty = !text.trim() && !files.length && !template?.files.length
  function submit() {
    if (empty || uploading || send.isPending) return
    setError(""); setOfferSms(false)
    send.mutate({ lead_id: leadId, text, template_id: templateId, files }, {
      onSuccess: () => { setText(""); setFiles([]); setTemplateId(null) },
      onError: (e) => { setError(e.message); setOfferSms(smsFallback((e as { code?: string }).code)) },
    })
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {templates.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => pick(t.id)} aria-pressed={templateId === t.id}
              className={`${CHIP} transition-colors ${templateId === t.id ? "bg-[#2AABEE] text-white" : "bg-mute-soft text-ink hover:bg-mute-soft-hover"}`}>
              <Lightning size={12} weight={templateId === t.id ? "fill" : "bold"} className={`shrink-0 ${templateId === t.id ? "" : "text-[#2AABEE]"}`} />
              <span className="truncate">{t.title}</span>{t.files.length > 0 && <Paperclip size={12} weight="bold" className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
      {(template?.files.length || files.length) ? (
        <div className="flex flex-wrap gap-1.5">
          {template?.files.map((f) => <span key={f.path} className={`${CHIP} bg-surface-sunken text-ink-muted`}><Paperclip size={12} weight="bold" /><span className="truncate">{f.name}</span></span>)}
          {files.map((f) => (
            <span key={f.path} className={`${CHIP} pr-1 bg-surface-sunken text-ink`}>
              <Paperclip size={12} weight="bold" /><span className="truncate">{f.name}</span>
              <button type="button" aria-label="Olib tashlash" onClick={() => setFiles(files.filter((x) => x.path !== f.path))} className="size-5 rounded-full flex items-center justify-center hover:bg-mute-ghost-hover"><X size={12} weight="bold" /></button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-1.5">
        <button type="button" aria-label="Fayl biriktirish" disabled={uploading || files.length >= 5} onClick={() => fileRef.current?.click()}
          className="size-10 shrink-0 rounded-full flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover disabled:opacity-40"><Paperclip size={20} /></button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { void attach(e.target.files); e.target.value = "" }} />
        <textarea ref={field} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} aria-label="Xabar"
          placeholder={uploading ? "Fayl yuklanmoqda…" : "Xabar yozing…"}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
          className="flex-1 min-h-10 max-h-40 resize-none overflow-y-auto rounded-[20px] bg-surface-sunken px-4 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none" />
        <button type="button" onClick={submit} disabled={empty || uploading || send.isPending} aria-label="Yuborish"
          className="size-10 shrink-0 rounded-full bg-[#2AABEE] text-white flex items-center justify-center hover:bg-[#229ED9] disabled:opacity-40">
          <PaperPlaneRight size={18} weight="fill" />
        </button>
      </div>
      {error && (
        <div role="alert" className="px-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-danger-text">
          <span>{error}</span>
          {offerSms && lead?.client && (
            <button type="button" onClick={() => openSms({ clientId: lead.client!.id, clientName: lead.client!.full_name })}
              className="h-7 px-3 rounded-full bg-mute-soft text-ink font-medium whitespace-nowrap hover:bg-mute-soft-hover">SMS yuborish</button>
          )}
        </div>
      )}
    </div>
  )
}
