// A bitim's attribution (091: crm_leads.attribution — UTM from a site form, ad fields from Meta lead ads)
// as labelled rows for the bitim page's "Qayerdan keldi" block.

const LABELS: [key: string, label: string][] = [
  ["utm_source", "Manba"],
  ["utm_medium", "Kanal"],
  ["platform", "Platforma"],
  ["campaign_name", "Kampaniya"],
  ["campaign_id", "Kampaniya ID"],
  ["utm_campaign", "Kampaniya (utm_campaign)"],
  ["adset_name", "Reklama to'plami"],
  ["adset_id", "Reklama to'plami ID"],
  ["utm_term", "utm_term"],
  ["ad_name", "Reklama"],
  ["ad_id", "Reklama ID"],
  ["utm_content", "utm_content"],
  ["is_organic", "Organik"],
]
/** Technical ids nobody reads on the page */
const HIDDEN = new Set(["leadgen_id", "form_id", "fbclid"])

export function attributionRows(attr: Record<string, string> | null | undefined): { k: string; v: string }[] {
  if (!attr) return []
  const known = new Set(LABELS.map(([k]) => k))
  const value = (k: string) => (k === "is_organic" ? (attr[k] === "true" ? "ha" : "yo'q") : attr[k])
  return [
    ...LABELS.filter(([k]) => attr[k]).map(([k, label]) => ({ k: label, v: value(k) })),
    ...Object.entries(attr).filter(([k, v]) => v && !known.has(k) && !HIDDEN.has(k)).map(([k, v]) => ({ k, v })),
  ]
}
