import { expect, test } from "bun:test"
import { metaAttribution, splitAttribution } from "./attribution"

test("site form: UTM leaves the answers; body wins over the URL; keys are case-insensitive", () => {
  const { fields, attribution } = splitAttribution(
    { name: "Ali", phone: "901234567", utm_source: "instagram", UTM_Campaign: "kaizen", Soha: "IT" },
    new URLSearchParams("token=x&voronka=y&utm_source=google&utm_medium=cpc&fbclid=abc"))
  expect(fields).toEqual({ name: "Ali", phone: "901234567", Soha: "IT" })
  expect(attribution).toEqual({ utm_source: "instagram", utm_campaign: "kaizen", utm_medium: "cpc", fbclid: "abc" })
})

test("empty values are dropped; no UTM at all gives an empty object", () => {
  expect(splitAttribution({ name: "A", utm_source: " " }, new URLSearchParams("utm_term=")).attribution).toEqual({})
})

test("a hostile value is trimmed to 300 characters and one line", () => {
  const { attribution } = splitAttribution({ utm_campaign: "x".repeat(10_000) + "\nboom" }, new URLSearchParams())
  expect(attribution.utm_campaign).toBe("x".repeat(300))
})

test("Meta: ad, ad set, campaign, platform and the organic flag become strings", () => {
  expect(metaAttribution({ form_id: "9", ad_id: "1", ad_name: "Video 3", adset_id: "2", adset_name: "UZ 25-45",
    campaign_id: "3", campaign_name: "Kaizen noyabr", platform: "ig", is_organic: false }, "777")).toEqual({
    leadgen_id: "777", form_id: "9", ad_id: "1", ad_name: "Video 3", adset_id: "2", adset_name: "UZ 25-45",
    campaign_id: "3", campaign_name: "Kaizen noyabr", platform: "ig", is_organic: "false" })
})

test("Meta: an organic lead with no ad fields keeps only what exists", () => {
  expect(metaAttribution({ form_id: "9", is_organic: true }, "778")).toEqual({ leadgen_id: "778", form_id: "9", is_organic: "true" })
})

test("nested JSON (Framer): UTM under a dotted key is still attribution, not an answer", () => {
  const { fields, attribution } = splitAttribution(
    { "data.name": "Ali", "data.utm_source": "instagram", "meta.UTM_Campaign": "kaizen", "data.fbclid": "abc" },
    new URLSearchParams("utm_source=google"))
  expect(fields).toEqual({ "data.name": "Ali" })
  expect(attribution).toEqual({ utm_source: "instagram", utm_campaign: "kaizen", fbclid: "abc" })
})

test("the first non-empty line is kept; later lines are cut", () => {
  expect(splitAttribution({ utm_campaign: "\n kaizen \nboom" }, new URLSearchParams()).attribution).toEqual({ utm_campaign: "kaizen" })
  expect(splitAttribution({ utm_campaign: "a\nboom" }, new URLSearchParams()).attribution).toEqual({ utm_campaign: "a" })
})
