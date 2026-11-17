// Telegram templates (100): admins write them once — text with {ism}/{tadbir}/{sana} and up to 5 files —
// sellers send them from the bitim page in one click.
import { useRef, useState } from "react"
import { ArrowDown, ArrowUp, Paperclip, Plus, Trash, X } from "@phosphor-icons/react"
import { Sheet } from "@/components/ui/Sheet"
import { useDeleteTgTemplate, useSaveTgTemplate, useTgTemplates } from "@/hooks/useTelegram"
import { uploadTgFile, type TgFileRef, type TgTemplate } from "@/lib/supabase/queries/telegram"
import { TG_BLANKS, TG_MAX_FILE } from "@/lib/telegram"
import { confirmAction } from "@/lib/confirm"
import { toast } from "@/lib/toast"

const FIELD = "w-full px-3 border border-line rounded-control text-base text-ink bg-surface focus:outline-none focus:border-line-focus"

export function TgTemplates() {
  const { data: list = [] } = useTgTemplates()
  const save = useSaveTgTemplate()
  const [open, setOpen] = useState<TgTemplate | "new" | null>(null)

  const move = (i: number, d: -1 | 1) => {
    const a = list[i], b = list[i + d]
    if (!a || !b) return
    save.mutate({ ...a, sort: b.sort === a.sort ? a.sort + d : b.sort })
    save.mutate({ ...b, sort: a.sort })
  }

  return (
    <div className="flex flex-col gap-3 mt-2">
      <div className="flex items-center justify-between gap-3 max-lg:px-1">
        <h3 className="text-base font-semibold text-ink">Shablonlar</h3>
        <button type="button" onClick={() => setOpen("new")} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-mute-soft text-sm font-medium text-ink hover:bg-mute-soft-hover whitespace-nowrap">
          <Plus size={16} /> Shablon
        </button>
      </div>
      <div className="rounded-surface bg-surface-sunken overflow-hidden">
        {list.length === 0 ? <p className="py-8 text-center text-base text-ink-muted">Shablon yo'q — "Nonushta haqida", "Narxlar", "Manzil" kabi tayyor xabarlarni qo'shing</p>
          : list.map((t, i) => (
            <div key={t.id} className="min-h-14 px-4 py-2.5 flex items-center gap-3 border-b border-line last:border-0">
              <button type="button" onClick={() => setOpen(t)} className="flex-1 min-w-0 flex flex-col text-left">
                <span className="text-base font-medium text-ink truncate">{t.title}</span>
                <span className="text-sm text-ink-muted truncate">{t.body.split("\n")[0] || "—"}{t.files.length ? ` · 📎 ${t.files.length}` : ""}</span>
              </button>
              <span className="flex gap-1 shrink-0">
                <button type="button" aria-label="Yuqoriga" disabled={i === 0} onClick={() => move(i, -1)} className="size-8 rounded-full flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover disabled:opacity-30"><ArrowUp size={16} /></button>
                <button type="button" aria-label="Pastga" disabled={i === list.length - 1} onClick={() => move(i, 1)} className="size-8 rounded-full flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover disabled:opacity-30"><ArrowDown size={16} /></button>
              </span>
            </div>
          ))}
      </div>
      {open && <TemplateSheet template={open === "new" ? null : open} nextSort={(list.at(-1)?.sort ?? 0) + 1} onClose={() => setOpen(null)} />}
    </div>
  )
}

function TemplateSheet({ template, nextSort, onClose }: { template: TgTemplate | null; nextSort: number; onClose: () => void }) {
  const save = useSaveTgTemplate()
  const del = useDeleteTgTemplate()
  const [title, setTitle] = useState(template?.title ?? "")
  const [body, setBody] = useState(template?.body ?? "")
  const [files, setFiles] = useState<TgFileRef[]>(template?.files ?? [])
  const [uploading, setUploading] = useState(false)
  const text = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const insert = (blank: string) => {
    const el = text.current
    const at = el?.selectionStart ?? body.length
    setBody(body.slice(0, at) + blank + body.slice(el?.selectionEnd ?? at))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + blank.length, at + blank.length) })
  }

  async function add(list: FileList | null) {
    const picked = [...(list ?? [])].slice(0, 5 - files.length)
    if (picked.some((f) => f.size > TG_MAX_FILE)) { toast.error("Fayl juda katta", "Har bir fayl 10 MB gacha"); return }
    setUploading(true)
    try { const up = await Promise.all(picked.map((f) => uploadTgFile("templates", f))); setFiles((fs) => [...fs, ...up]) }
    catch (e) { toast.error("Fayl yuklanmadi", (e as Error).message) }
    finally { setUploading(false) }
  }

  const footer = (
    <div className="flex gap-2">
      {template && (
        <button type="button" aria-label="O'chirish" onClick={async () => { if (await confirmAction({ title: "Shablonni o'chirish", message: template.title, confirmLabel: "O'chirish", danger: true })) del.mutate(template.id, { onSuccess: onClose }) }}
          className="size-10 rounded-full flex items-center justify-center text-danger-text hover:bg-danger-soft"><Trash size={18} /></button>
      )}
      <button type="button" disabled={!title.trim() || (!body.trim() && !files.length) || uploading || save.isPending}
        onClick={() => save.mutate({ id: template?.id, title, body, files, sort: template?.sort ?? nextSort }, { onSuccess: onClose })}
        className="flex-1 h-10 rounded-full bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover disabled:opacity-40">Saqlash</button>
    </div>
  )

  return (
    <Sheet open onClose={onClose} title={template ? "Shablon" : "Yangi shablon"} className="sm:max-w-lg" footer={footer}>
      <div className="flex flex-col gap-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Nomi, masalan: Nonushta haqida" aria-label="Nomi" className={`${FIELD} h-control-md`} />
        <div className="flex flex-col gap-2">
          <textarea ref={text} value={body} onChange={(e) => setBody(e.target.value)} rows={7} maxLength={4000} placeholder="Assalomu alaykum, {ism}! …" aria-label="Matn" className={`${FIELD} py-2.5 resize-y`} />
          <div className="flex flex-wrap gap-1.5">
            {TG_BLANKS.map((b) => (
              <button key={b.key} type="button" onClick={() => insert(b.key)} className="h-7 px-2.5 rounded-full bg-mute-soft text-sm text-ink hover:bg-mute-soft-hover whitespace-nowrap">{b.label} <span className="text-ink-faint">{b.key}</span></button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {files.map((f) => (
            <div key={f.path} className="h-10 pl-3 pr-1 flex items-center gap-2 rounded-control bg-surface-sunken">
              <Paperclip size={16} className="text-ink-muted shrink-0" /><span className="flex-1 min-w-0 truncate text-sm text-ink">{f.name}</span>
              <button type="button" aria-label="Olib tashlash" onClick={() => setFiles(files.filter((x) => x.path !== f.path))} className="size-8 rounded-full flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover"><X size={16} /></button>
            </div>
          ))}
          {files.length < 5 && (
            <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="h-10 px-3 self-start inline-flex items-center gap-2 rounded-full bg-mute-soft text-sm font-medium text-ink hover:bg-mute-soft-hover disabled:opacity-50">
              <Paperclip size={16} />{uploading ? "Yuklanmoqda…" : "Fayl qo'shish (PDF, rasm, video)"}
            </button>
          )}
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => { void add(e.target.files); e.target.value = "" }} />
        </div>
      </div>
    </Sheet>
  )
}
