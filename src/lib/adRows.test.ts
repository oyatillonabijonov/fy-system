import { expect, test } from "bun:test"
import { groupAds } from "./adRows"
import type { AdRow } from "@/lib/supabase/queries/salesDashboard"

const row = (source: string | null, campaign: string | null, adset: string | null, creative: string | null, leads: number, agreed: number | null = 0): AdRow =>
  ({ source, campaign, adset, creative, leads, qualified: 1, won: 1, seats: 1, agreed, paid: agreed })

const rows = [row("fb", "K1", "A1", "CR5", 6, 100), row("fb", "K1", "A1", "CR7", 2, 50), row("ig", "K1", "A2", "CR5", 3, 0), row(null, null, null, null, 9, 0)]

test("adds rows up at the chosen depth, biggest first", () => {
  expect(groupAds(rows, "source").map((g) => [g.name, g.leads])).toEqual([[null, 9], ["fb", 8], ["ig", 3]])
  const fb = groupAds(rows, "campaign").find((g) => g.name === "K1" && g.path[0] === "fb")!
  expect([fb.leads, fb.won, fb.agreed]).toEqual([8, 2, 150])
})

test("the same creative under two sources stays two rows, with its path", () => {
  const cr5 = groupAds(rows, "creative").filter((g) => g.name === "CR5")
  expect(cr5.map((g) => g.path)).toEqual([["fb", "K1", "A1"], ["ig", "K1", "A2"]])
})

test("hidden money stays hidden, not zero", () => {
  expect(groupAds([row("fb", null, null, null, 1, null)], "source")[0].agreed).toBeNull()
})
