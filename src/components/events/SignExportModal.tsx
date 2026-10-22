import { useState } from "react"
import { Plus, Trash } from "@phosphor-icons/react"
import { type Event } from "@/lib/supabase/queries/events"
import { SIGN_STYLES, DIRECTIONS, type Direction } from "@/lib/signs/drawSigns"
import { ModalShell, INPUT, LABEL } from "@/components/moliya/PaymentActionModals"

const rgb = (c: [number, number, number]) => `rgb(${c.join(",")})`
interface Row { key: number; place: string; direction: Direction }
let seq = 0
const row = (place: string, direction: Direction): Row => ({ key: ++seq, place, direction })

/** Navigation signs for the venue: style, then each sign's place and arrow → vector PDF, two per A4 */
export function SignExportModal({ event, onClose }: { event: Event; onClose: () => void }) {
  const [styleId, setStyleId] = useState(SIGN_STYLES[0].id)
  const [rows, setRows] = useState<Row[]>(() => [row("Tadbirlar zali", "right"), row("Namozxona", "left")])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signs = rows.filter((r) => r.place.trim()).map((r) => ({ place: r.place, direction: r.direction }))
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  async function submit() {
    setPending(true); setError(null)
    try {
      const { generateSigns } = await import("@/lib/signs/generateSigns")
      await generateSigns(signs, SIGN_STYLES.find((s) => s.id === styleId)!, event.name)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF tayyorlab bo'lmadi")
    } finally {
      setPending(false)
    }
  }

  return (
    <ModalShell title="Navigatsiya" error={error} submitLabel="PDF yuklab olish"
      canSubmit={signs.length > 0} pending={pending} onSubmit={submit} onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Dizayn</span>
        <div role="radiogroup" aria-label="Dizayn" className="grid grid-cols-2 gap-2">
          {SIGN_STYLES.map((st) => (
            <button key={st.id} type="button" role="radio" aria-checked={styleId === st.id} onClick={() => setStyleId(st.id)}
              className={`flex flex-col gap-1.5 p-1.5 rounded-control border transition-colors ${styleId === st.id ? "border-line-focus" : "border-line hover:bg-mute-ghost-hover"}`}>
              <span className="h-10 rounded-item overflow-hidden flex flex-col">
                <span className="flex-1 flex items-center gap-2 px-2" style={{ background: rgb(st.band[0]) }}>
                  <span className="h-2 flex-1 rounded-full" style={{ background: rgb(st.text) }} />
                  <span className="size-4 shrink-0 flex items-center justify-center text-[10px] font-semibold" style={{ background: rgb(st.block), color: rgb(st.arrow) }}>→</span>
                </span>
                <span className="h-2.5" style={{ background: rgb(st.strip[0]) }} />
              </span>
              <span className="text-sm text-ink">{st.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Belgilar</span>
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <input value={r.place} onChange={(e) => set(r.key, { place: e.target.value })} placeholder="Joy nomi" aria-label="Joy nomi" className={`${INPUT} flex-1 min-w-0`} />
              <select value={r.direction} onChange={(e) => set(r.key, { direction: e.target.value as Direction })} aria-label="Yo'nalish"
                className={`${INPUT} !w-32 shrink-0`}>
                {DIRECTIONS.map((d) => <option key={d.id} value={d.id}>{d.glyph} {d.label}</option>)}
              </select>
              <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Belgini olib tashlash"
                className="p-2 rounded-full text-ink-muted hover:bg-mute-ghost-hover shrink-0"><Trash size={16} /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows((rs) => [...rs, row("", "up")])}
          className="self-start flex items-center gap-1.5 h-8 px-3 rounded-full bg-mute-soft text-sm font-medium text-ink hover:bg-mute-soft-hover">
          <Plus size={12} weight="bold" /> Belgi qo'shish
        </button>
      </div>

      <p className="text-sm text-ink-muted -mt-1">
        {signs.length ? `${signs.length} ta belgi · ${Math.ceil(signs.length / 2)} ta A4 varaq (varaqda 2 ta)` : "Kamida bitta joy nomini yozing"}
      </p>
    </ModalShell>
  )
}
