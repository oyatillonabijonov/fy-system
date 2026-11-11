import { expect, test } from "bun:test"
import { attributionRows } from "./attribution"

test("site UTM and ad_id read in a fixed order with Uzbek labels", () => {
  expect(attributionRows({ utm_content: "333", ad_id: "444", utm_source: "ig", utm_campaign: "111", utm_term: "222" })).toEqual([
    { k: "Manba", v: "ig" }, { k: "Kampaniya (utm_campaign)", v: "111" }, { k: "utm_term", v: "222" },
    { k: "Reklama ID", v: "444" }, { k: "utm_content", v: "333" },
  ])
})

test("Meta lead ads: names, the organic flag in words; technical ids are left out", () => {
  expect(attributionRows({ leadgen_id: "777", form_id: "9", campaign_name: "Kaizen", ad_name: "Video 3", platform: "ig", is_organic: "false", fbclid: "x" })).toEqual([
    { k: "Platforma", v: "ig" }, { k: "Kampaniya", v: "Kaizen" }, { k: "Reklama", v: "Video 3" }, { k: "Organik", v: "yo'q" },
  ])
})

test("unknown keys still show, after the known ones; nothing at all gives no rows", () => {
  expect(attributionRows({ gclid: "g1", utm_source: "google" })).toEqual([{ k: "Manba", v: "google" }, { k: "gclid", v: "g1" }])
  expect(attributionRows({})).toEqual([])
  expect(attributionRows(null)).toEqual([])
})
