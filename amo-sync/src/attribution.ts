export type Attribution = Record<string, string>

/** Graph API field list for a leadgen node */
export const META_LEAD_FIELDS =
  "field_data,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform,is_organic"

export interface MetaLead {
  field_data?: { name: string; values: string[] }[]
  form_id?: string; ad_id?: string; ad_name?: string; adset_id?: string; adset_name?: string
  campaign_id?: string; campaign_name?: string; platform?: string; is_organic?: boolean
}

const WEB_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"]

/** First non-empty line, trimmed, at most 300 characters */
const clean = (v: unknown): string => String(v).trim().split("\n")[0].trim().slice(0, 300)

/** UTM / fbclid out of a form body and the URL query (body wins); `fields` is the body without them.
 *  A nested JSON key counts by its last dot-segment (`data.utm_source`). */
export function splitAttribution(body: Record<string, string>, query: URLSearchParams):
  { fields: Record<string, string>; attribution: Attribution } {
  const fields: Record<string, string> = {}
  const attribution: Attribution = {}
  for (const [k, v] of Object.entries(body)) {
    const key = (k.split(".").pop() ?? k).toLowerCase()
    if (!WEB_KEYS.includes(key)) { fields[k] = v; continue }
    const value = clean(v)
    if (value) attribution[key] = value
  }
  for (const key of WEB_KEYS) {
    if (attribution[key]) continue
    const value = clean(query.get(key) ?? "")
    if (value) attribution[key] = value
  }
  return { fields, attribution }
}

/** A leadgen node's ad fields (+ its id) as attribution */
export function metaAttribution(lead: MetaLead, leadgenId: string): Attribution {
  const raw: Record<string, unknown> = {
    leadgen_id: leadgenId, form_id: lead.form_id, ad_id: lead.ad_id, ad_name: lead.ad_name,
    adset_id: lead.adset_id, adset_name: lead.adset_name, campaign_id: lead.campaign_id,
    campaign_name: lead.campaign_name, platform: lead.platform, is_organic: lead.is_organic,
  }
  const attribution: Attribution = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue
    const value = clean(v)
    if (value) attribution[k] = value
  }
  return attribution
}
