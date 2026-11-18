import { expect, test } from "bun:test"
import { convRows, type ConvIn } from "./stageConv"

const row = (pipeline_id: string, name: string, reached: number, won = false): ConvIn =>
  ({ pipeline_id, stage_id: `${pipeline_id}-${name}`, name, color: "#000", won, reached, avg_days: 1 })

test("pct to the next stage, the weakest marked, empty voronka dropped", () => {
  const rows = [row("a", "Yangi", 200), row("a", "Bog'lanildi", 100), row("a", "To'lovga", 20), row("a", "To'lov", 15, true), row("b", "Yangi", 0), row("b", "Yutildi", 0, true)]
  const out = convRows(rows, [{ id: "a", name: "BN11" }, { id: "b", name: "Bo'sh" }])
  expect(out.map((r) => r.pct)).toEqual([50, 20, 75, null])
  expect(out.filter((r) => r.weak).map((r) => r.name)).toEqual(["Bog'lanildi"])
  expect(out.every((r) => r.pipeline === "BN11")).toBe(true)
})

test("a stage with under 5 bitimlar is never the weakest", () => {
  const out = convRows([row("a", "S1", 10), row("a", "S2", 4), row("a", "S3", 0), row("a", "W", 0, true)], [{ id: "a", name: "A" }])
  expect(out.map((r) => r.pct)).toEqual([40, 0, null, null])
  expect(out.some((r) => r.weak)).toBe(false)   // only S1 has a big enough base, and one stage alone has nothing to be weaker than
})
