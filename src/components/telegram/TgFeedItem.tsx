// One Telegram message in the bitim feed (100): direction, who, text, files (5-minute signed link), ✓ / ✓✓.
import { Check, Checks, Paperclip, TelegramLogo } from "@phosphor-icons/react"
import { tgFileUrl, type TgMessage } from "@/lib/supabase/queries/telegram"
import { toast } from "@/lib/toast"

const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })

export function TgFeedItem({ msg, chatTitle }: { msg: TgMessage; chatTitle: string }) {
  const out = msg.direction === "out"
  const open = (path: string) => tgFileUrl(path).then((u) => window.open(u, "_blank", "noopener"), (e: Error) => toast.error("Fayl ochilmadi", e.message))
  return (
    <div className="flex gap-3 py-2">
      <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${out ? "bg-surface-sunken max-lg:bg-card text-ink-muted" : "bg-info-soft text-info-text"}`}><TelegramLogo size={16} /></span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
          <span className="text-ink">Telegram</span>
          <span className="truncate">· {out ? (msg.sender?.full_name ?? "Telegram ilovasidan") : chatTitle || "Mijoz"}</span>
          {out && <span className={msg.read_at ? "text-info" : ""} title={msg.read_at ? "O'qildi" : "Yuborildi"}>{msg.read_at ? <Checks size={16} /> : <Check size={16} />}</span>}
          <span className="tabular-nums ml-auto shrink-0">{when(msg.created_at)}</span>
        </div>
        {msg.text && <p className={`mt-1 rounded-control px-3 py-2 text-base text-ink whitespace-pre-wrap break-words ${out ? "bg-surface-sunken" : "bg-info-soft"}`}>{msg.text}</p>}
        {msg.files.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.files.map((f) => (
              <button key={f.path} type="button" onClick={() => void open(f.path)}
                className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-surface-sunken text-sm text-ink hover:bg-surface-sunken-hover max-w-64">
                <Paperclip size={16} className="shrink-0" /><span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
