import { useState } from "react"
import { type Event, type Participant } from "@/lib/supabase/queries/events"
import { STICKER_PALETTES, PER_SHEET } from "@/lib/stickers/drawStickers"
import { ModalShell, INPUT, LABEL } from "@/components/moliya/PaymentActionModals"

const rgb = (c: [number, number, number]) => `rgb(${c.join(",")})`

/** Name stickers for an event: palette, the occasion line, who gets one (+ names typed by hand) → vector PDF */
export function StickerExportModal({ event, participants, onClose }: { event: Event; participants: Participant[]; onClose: () => void }) {
  const [paletteId, setPaletteId] = useState(STICKER_PALETTES[0].id)
  const [caption, setCaption] = useState(event.name)
  const [picked, setPicked] = useState<Set<string>>(() => new Set(participants.map((p) => p.id)))
  const [extra, setExtra] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extraNames = extra.split("\n").map((s) => s.trim()).filter(Boolean)
  const names = [...participants.filter((p) => picked.has(p.id)).map((p) => p.full_name), ...extraNames]
  const sheets = Math.ceil(names.length / PER_SHEET)
  const all = participants.length > 0 && picked.size === participants.length
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function submit() {
    setPending(true); setError(null)
    try {
      const { generateStickers } = await import("@/lib/stickers/generateStickers")
      await generateStickers(names, caption.trim(), STICKER_PALETTES.find((p) => p.id === paletteId)!, event.name)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF tayyorlab bo'lmadi")
    } finally {
      setPending(false)
    }
  }

  return (
    <ModalShell title="Ism stikerlari" error={error} submitLabel="PDF yuklab olish"
      canSubmit={names.length > 0} pending={pending} onSubmit={submit} onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Rang</span>
        <div role="radiogroup" aria-label="Rang" className="grid grid-cols-3 gap-2">
          {STICKER_PALETTES.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={paletteId === p.id} onClick={() => setPaletteId(p.id)}
              className={`flex flex-col gap-1.5 p-1.5 rounded-control border transition-colors ${paletteId === p.id ? "border-line-focus" : "border-line hover:bg-mute-ghost-hover"}`}>
              <span className="h-9 rounded-item flex flex-col justify-between px-2 py-1.5" style={{ background: rgb(p.bg) }}>
                <span className="h-1.5 w-10 rounded-full" style={{ background: rgb(p.ink) }} />
                <span className="h-px w-4" style={{ background: rgb(p.metal) }} />
              </span>
              <span className="text-sm text-ink">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Pastki yozuv</span>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Biznes nonushta 3.0" className={INPUT} />
      </label>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Ishtirokchilar · {picked.size}/{participants.length}</span>
          {participants.length > 0 && (
            <button type="button" onClick={() => setPicked(all ? new Set() : new Set(participants.map((p) => p.id)))}
              className="text-sm text-ink hover:underline">{all ? "Hammasini olib tashlash" : "Hammasini belgilash"}</button>
          )}
        </div>
        <div className="max-h-48 overflow-y-auto rounded-control border border-line">
          {participants.length === 0 ? <p className="px-3 py-4 text-sm text-ink-muted text-center">Ishtirokchi yo'q — ismlarni pastga yozing</p>
            : participants.map((p) => (
              <label key={p.id} className="flex items-center gap-2.5 px-3 h-9 text-base text-ink cursor-pointer hover:bg-mute-ghost-hover border-b border-line last:border-b-0">
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="size-4 accent-[var(--ds-color-bg-inverted)]" />
                <span className="truncate">{p.full_name}</span>
              </label>
            ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Qo'shimcha ismlar (har qatorda bittasi)</span>
        <textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={"Aziz Karimov\nMehmon Mehmonov"} className={`${INPUT} resize-none`} />
      </label>

      <p className="text-sm text-ink-muted -mt-1">
        {names.length ? `${names.length} ta stiker · ${sheets} ta A4 varaq (varaqda 14 ta)` : "Kamida bitta ism tanlang"}
      </p>
    </ModalShell>
  )
}
