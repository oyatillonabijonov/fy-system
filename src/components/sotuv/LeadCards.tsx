import { useState } from "react"
import { Funnel } from "@phosphor-icons/react"
import { sourceLabel, type Lead, type Stage } from "@/lib/supabase/queries/sotuv"
import { formatNumber } from "@/lib/format"
import { Pager, usePaged } from "@/components/ui/Pager"
import { PersonDot } from "@/components/vazifalar/pickers"
import { ChipCount, EmptyNote, NoTaskChip, RowCall, SECTION, StageDot, TaskChip, chip } from "./ui"

/** Phone: the deals of one voronka as a stage-grouped list — a chip per bosqich (tap = only that one), a card per deal */
export function LeadCards({ stages, leads, today, onOpen }: {
  stages: Stage[]; leads: Lead[]; today: string; onOpen: (l: Lead) => void
}) {
  const [picked, setPicked] = useState<string | null>(null)   // null = every open bosqich
  const stageId = stages.some((s) => s.id === picked) ? picked : null
  const open = stages.filter((s) => !s.is_won && !s.is_lost)
  const count = (id: string) => leads.filter((l) => l.stage_id === id).length
  const shownStages = stageId ? stages.filter((s) => s.id === stageId) : open
  const rows = shownStages.flatMap((s) => leads.filter((l) => l.stage_id === s.id))
  const { page, setPage, pageCount, pageItems } = usePaged(rows)
  const openCount = open.reduce((a, s) => a + count(s.id), 0)

  // The page's cards, grouped by consecutive bosqich (a bosqich can continue from the previous page)
  const groups: { stage: Stage; items: Lead[] }[] = []
  for (const l of pageItems) {
    const stage = stages.find((s) => s.id === l.stage_id)
    if (!stage) continue
    const last = groups.at(-1)
    if (last?.stage.id === stage.id) last.items.push(l); else groups.push({ stage, items: [l] })
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Bosqichlar" className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6">
        <button role="tab" aria-selected={stageId === null} onClick={() => setPicked(null)} className={chip(stageId === null)}>
          Ochiq<ChipCount n={openCount} />
        </button>
        {stages.map((s) => (
          <button key={s.id} role="tab" aria-selected={stageId === s.id} onClick={() => setPicked(s.id)} className={chip(stageId === s.id)}>
            <StageDot color={s.color} />{s.name}<ChipCount n={count(s.id)} />
          </button>
        ))}
      </div>

      {rows.length === 0 ? <EmptyNote icon={Funnel} text="Bitim topilmadi" /> : (
        <div className="flex flex-col gap-6">
          {groups.map((g, i) => {
            const all = leads.filter((l) => l.stage_id === g.stage.id)
            return (
              <section key={`${g.stage.id}-${i}`}>
                <div className={`${SECTION} flex items-center gap-2`}>
                  <StageDot color={g.stage.color} />
                  <h2>{g.stage.name}</h2>
                  <span className="text-sm font-normal text-ink-muted tabular-nums">{all.length}</span>
                  <span className="ml-auto text-sm font-normal text-ink-muted tabular-nums">{formatNumber(all.reduce((a, l) => a + l.price, 0))}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {g.items.map((l) => <DealCard key={l.id} lead={l} stage={g.stage} today={today} onOpen={() => onOpen(l)} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
      <Pager page={page} pageCount={pageCount} total={rows.length} onPage={setPage} />
    </div>
  )
}

function DealCard({ lead: l, stage, today, onOpen }: { lead: Lead; stage: Stage; today: string; onOpen: () => void }) {
  const title = l.client?.full_name ?? l.name
  const sub = l.client && l.name !== l.client.full_name ? l.name : l.fields.at(-1)?.v
  const meta = [l.source && l.source !== "manual" ? sourceLabel(l.source) : null, sub].filter(Boolean).join(" · ")
  const closed = stage.is_won || stage.is_lost
  const phone = l.client?.phone
  return (
    // A div, not a button: the call button lives inside (same pattern as the Kanban card)
    <article role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen() }} aria-label={`${title} — bitimni ochish`}
      className={`rounded-surface bg-surface-sunken p-4 flex flex-col gap-3 cursor-pointer transition-colors active:bg-surface-sunken-hover ${stage.is_lost ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3">
        <PersonDot name={title} url={l.client?.image} size={40} />
        <div className="flex-1 min-w-0">
          <span className="block text-base font-semibold text-ink line-clamp-1">{title}</span>
          {meta && <span className="block text-sm text-ink-muted line-clamp-1">{meta}</span>}
        </div>
        {phone && <span onClick={(e) => e.stopPropagation()} className="shrink-0"><RowCall phone={phone} /></span>}
      </div>
      <div className="flex items-center gap-3 min-h-8">
        <div className="flex-1 min-w-0">
          {closed
            ? <span className="text-sm text-ink-muted">{stage.name}{l.closed_at ? ` · ${new Date(l.closed_at).toLocaleDateString("ru-RU")}` : ""}</span>
            : l.next_task ? <TaskChip lg kind={l.next_task.kind} due={l.next_task.due_date} today={today} /> : <NoTaskChip lg />}
        </div>
        {l.price > 0 && <span className="shrink-0 text-base font-semibold text-ink tabular-nums">{formatNumber(l.price)}</span>}
      </div>
    </article>
  )
}
