// Stage-to-stage conversion (103): sales_dashboard's stage_conv rows → rows the Dashboard funnel draws.

export interface ConvIn { pipeline_id: string; stage_id: string; name: string; color: string; won: boolean; reached: number; avg_days: number | null }
export interface ConvRow {
  pipeline: string; pipeline_id: string; stage_id: string; name: string; color: string; open: number; open_sum: number
  /** % of this stage's bitimlar that got to the next one (null on the last row or an empty stage) */
  pct: number | null
  /** the lowest pct of its voronka */
  weak: boolean
  days: number | null
}

// A % from two or three bitimlar is noise, so a stage that small is never called the weakest
const MIN_BASE = 5

/** Rows stay in the order they came (voronka, then stage, the won stage last); a voronka nobody entered in the period is dropped */
export function convRows(rows: ConvIn[], pipelines: { id: string; name: string }[]): ConvRow[] {
  const out: ConvRow[] = []
  for (const p of pipelines) {
    const stages = rows.filter((r) => r.pipeline_id === p.id)
    if (!stages.length || stages[0].reached === 0) continue
    const mine = stages.map((r, i): ConvRow => {
      const next = stages[i + 1]
      return { pipeline: p.name, pipeline_id: p.id, stage_id: r.stage_id, name: r.name, color: r.color, open: r.reached, open_sum: 0,
        pct: next && r.reached > 0 ? Math.round((next.reached / r.reached) * 100) : null, weak: false, days: r.avg_days }
    })
    const judged = mine.filter((r) => r.pct !== null && r.open >= MIN_BASE)
    if (judged.length > 1) judged.reduce((a, b) => (b.pct! < a.pct! ? b : a)).weak = true
    out.push(...mine)
  }
  return out
}
