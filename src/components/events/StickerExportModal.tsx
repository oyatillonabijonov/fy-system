import { useState } from "react"
import { type Event, type Participant } from "@/lib/supabase/queries/events"
import { STICKER_STYLES, PER_SHEET, type StickerStyle } from "@/lib/stickers/drawStickers"
import { INPUT, LABEL } from "@/components/moliya/PaymentActionModals"
import { ModalOrSheet } from "@/components/events/ModalOrSheet"
import { useUsers } from "@/hooks/useUsers"

const rgb = (c: [number, number, number]) => `rgb(${c.join(",")})`

/** A tiny drawing of the sticker: band + strip for classic, plain ground + rule for minimal */
function Swatch({ s }: { s: StickerStyle }) {
  if (s.layout === "classic") return (
    <span className="h-9 rounded-item overflow-hidden flex flex-col">
      <span className="flex-1 flex items-center gap-1.5 px-1.5" style={{ background: rgb(s.band[1]) }}>
        <span className="size-2.5 shrink-0" style={{ background: rgb(s.mark) }} />
        <span className="h-1.5 flex-1 rounded-full" style={{ background: rgb(s.name) }} />
      </span>
      <span className="h-2.5" style={{ background: rgb(s.strip[0]) }} />
    </span>
  )
  return (
    <span className="h-9 rounded-item flex flex-col justify-between px-1.5 py-1.5" style={{ background: rgb(s.bg) }}>
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 flex-1 rounded-full" style={{ background: rgb(s.ink) }} />
        <span className="size-2 shrink-0" style={{ background: rgb(s.metal) }} />
      </span>
      <span className="h-px w-4" style={{ background: rgb(s.metal) }} />
    </span>
  )
}

/** A titled checklist with "select all" (participants, team) */
function PickList({ title, empty, items, picked, onChange }: {
  title: string; empty: string; items: { id: string; name: string }[]; picked: Set<string>; onChange: (next: Set<string>) => void
}) {
  const all = items.length > 0 && items.every((i) => picked.has(i.id))
  const toggle = (id: string) => { const n = new Set(picked); if (n.has(id)) n.delete(id); else n.add(id); onChange(n) }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={LABEL}>{title} · {items.filter((i) => picked.has(i.id)).length}/{items.length}</span>
        {items.length > 0 && (
          <button type="button" onClick={() => onChange(all ? new Set() : new Set(items.map((i) => i.id)))}
            className="text-sm text-ink hover:underline">{all ? "Hammasini olib tashlash" : "Hammasini belgilash"}</button>
        )}
      </div>
      <div className="max-h-40 max-sm:max-h-52 overflow-y-auto rounded-control border border-line">
        {items.length === 0 ? <p className="px-3 py-4 text-sm text-ink-muted text-center">{empty}</p>
          : items.map((i) => (
            <label key={i.id} className="flex items-center gap-2.5 px-3 h-9 max-sm:h-11 text-base text-ink cursor-pointer hover:bg-mute-ghost-hover border-b border-line last:border-b-0">
              <input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} className="size-4 accent-[var(--ds-color-bg-inverted)]" />
              <span className="truncate">{i.name}</span>
            </label>
          ))}
      </div>
    </div>
  )
}

/** Name stickers for an event: design, the occasion line, who gets one — participants, the team, names typed by hand → vector PDF */
export function StickerExportModal({ event, participants, onClose }: { event: Event; participants: Participant[]; onClose: () => void }) {
  const [styleId, setStyleId] = useState(STICKER_STYLES[0].id)
  const [caption, setCaption] = useState(event.name)
  const [picked, setPicked] = useState<Set<string>>(() => new Set(participants.map((p) => p.id)))
  const { data: users = [] } = useUsers()
  const team = users.filter((u) => u.is_active !== false).map((u) => ({ id: u.id, name: u.full_name }))
  const [pickedTeam, setPickedTeam] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extraNames = extra.split("\n").map((s) => s.trim()).filter(Boolean)
  const names = [
    ...participants.filter((p) => picked.has(p.id)).map((p) => p.full_name),
    ...team.filter((t) => pickedTeam.has(t.id)).map((t) => t.name),
    ...extraNames,
  ]
  const sheets = Math.ceil(names.length / PER_SHEET)

  async function submit() {
    setPending(true); setError(null)
    try {
      const { generateStickers } = await import("@/lib/stickers/generateStickers")
      await generateStickers(names, caption.trim(), STICKER_STYLES.find((s) => s.id === styleId)!, event.name)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF tayyorlab bo'lmadi")
    } finally {
      setPending(false)
    }
  }

  return (
    <ModalOrSheet title="Ism stikerlari" error={error} submitLabel="PDF yuklab olish"
      canSubmit={names.length > 0} pending={pending} onSubmit={submit} onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Dizayn</span>
        <div role="radiogroup" aria-label="Dizayn" className="grid grid-cols-3 gap-2">
          {STICKER_STYLES.map((st) => (
            <button key={st.id} type="button" role="radio" aria-checked={styleId === st.id} onClick={() => setStyleId(st.id)}
              className={`flex flex-col gap-1.5 p-1.5 rounded-control border transition-colors ${styleId === st.id ? "border-line-focus" : "border-line hover:bg-mute-ghost-hover"}`}>
              <Swatch s={st} />
              <span className="text-sm text-ink">{st.label}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Pastki yozuv</span>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Biznes nonushta 3.0" className={`${INPUT} max-sm:h-12`} />
      </label>

      <PickList title="Ishtirokchilar" empty="Ishtirokchi yo'q — ismlarni pastga yozing"
        items={participants.map((p) => ({ id: p.id, name: p.full_name }))} picked={picked} onChange={setPicked} />
      <PickList title="Jamoa" empty="Faol xodim yo'q" items={team} picked={pickedTeam} onChange={setPickedTeam} />

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Qo'shimcha ismlar (har qatorda bittasi)</span>
        <textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={"Aziz Karimov\nMehmon Mehmonov"} className={`${INPUT} resize-none`} />
      </label>

      <p className="text-sm text-ink-muted -mt-1">
        {names.length ? `${names.length} ta stiker · ${sheets} ta A4 varaq (varaqda 14 ta)` : "Kamida bitta ism tanlang"}
      </p>
    </ModalOrSheet>
  )
}
