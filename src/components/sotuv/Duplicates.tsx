import { useId, useState } from "react"
import { motion } from "framer-motion"
import { X, Check } from "@phosphor-icons/react"
import { useDialog } from "@/hooks/useDialog"
import { useDuplicateLeads, useMergeLeads } from "@/hooks/useSotuv"
import type { DupLead } from "@/lib/supabase/queries/sotuv"
import { formatNumber, formatPhone } from "@/lib/format"

/** One client with several open bitimlar: pick the one to keep, the rest are merged into it */
export function Duplicates({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const panelRef = useDialog<HTMLDivElement>(onClose, true)
  const { data: groups = [], isLoading } = useDuplicateLeads()

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[8vh]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-surface-overlay backdrop-blur-sm" />
      <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        initial={{ scale: 0.97, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-2xl bg-surface-raised rounded-overlay flex flex-col max-h-[84vh]">
        <div className="flex items-center justify-between px-5 h-14 border-b border-line shrink-0">
          <h3 id={titleId} className="text-md font-semibold text-ink">Dublikat bitimlar {groups.length > 0 && <span className="text-ink-faint tabular-nums">· {groups.length}</span>}</h3>
          <button onClick={onClose} aria-label="Yopish" className="p-1.5 rounded-full text-ink-muted hover:bg-mute-ghost-hover transition-colors"><X size={20} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          <p className="text-sm text-ink-muted">Bir mijozning bir nechta ochiq bitimi. Qoladiganini tanlang — qolganlarining izohlari, vazifalari va qo'ng'iroqlari unga o'tadi, o'zlari o'chiriladi.</p>
          {isLoading ? <p className="py-8 text-center text-base text-ink-muted">Yuklanmoqda…</p>
            : groups.length === 0 ? <p className="py-8 text-center text-base text-ink-muted">Dublikat yo'q</p>
            : groups.map((g) => <Group key={g.client.id} name={g.client.full_name} phone={g.client.phone} leads={g.leads} />)}
        </div>
      </motion.div>
    </div>
  )
}

function Group({ name, phone, leads }: { name: string; phone: string | null; leads: DupLead[] }) {
  const merge = useMergeLeads()
  const [keep, setKeep] = useState(leads[0].id)
  const [error, setError] = useState<string | null>(null)
  const group = useId()

  async function run() {
    const drop = leads.filter((l) => l.id !== keep)
    if (!window.confirm(`${drop.length} ta bitim tanlanganiga birlashtirilsinmi? Bu qaytarilmaydi.`)) return
    setError(null)
    try { for (const l of drop) await merge.mutateAsync({ keep, drop: l.id }) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <section className="rounded-surface bg-surface-sunken p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="min-w-0">
          <span className="block text-base font-semibold text-ink truncate">{name}</span>
          {phone && <span className="block text-sm text-ink-muted tabular-nums">{formatPhone(phone)}</span>}
        </span>
        <button onClick={run} disabled={merge.isPending}
          className="h-control-md px-4 shrink-0 rounded-full bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors">
          {merge.isPending ? "Birlashtirilmoqda…" : "Birlashtirish"}
        </button>
      </div>
      <div role="radiogroup" aria-label={`${name}: qoladigan bitim`} className="flex flex-col gap-1">
        {leads.map((l) => (
          <label key={l.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-control cursor-pointer transition-colors ${keep === l.id ? "bg-surface" : "hover:bg-surface/60"}`}>
            <input type="radio" name={group} checked={keep === l.id} onChange={() => setKeep(l.id)} className="sr-only" />
            <span className={`size-5 shrink-0 rounded-full flex items-center justify-center border ${keep === l.id ? "bg-accent border-transparent text-ink-on-accent" : "border-line"}`}>
              {keep === l.id && <Check size={12} weight="bold" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-base text-ink truncate">{l.name}</span>
              <span className="block text-sm text-ink-muted truncate">{l.pipeline} › {l.stage}{l.responsible ? ` · ${l.responsible}` : ""} · {new Date(l.created_at).toLocaleDateString("ru-RU")}</span>
            </span>
            {l.price > 0 && <span className="text-sm text-ink-muted tabular-nums">{formatNumber(l.price)}</span>}
            {keep === l.id && <span className="text-sm font-medium text-ink">Qoladi</span>}
          </label>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-danger-text px-1">{error}</p>}
    </section>
  )
}
