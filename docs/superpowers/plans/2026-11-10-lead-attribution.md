# Lead Attribution Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new lead remembers which ad / campaign / UTM brought it, so a later "ad stats" tool can join CRM outcomes to Meta Ads spend.

**Architecture:** A new `crm_leads.attribution` jsonb column, filled once by `intake_lead()` through a new optional 9th parameter. The amo-sync intake asks Meta's Graph API for the lead's ad fields and lifts UTM keys out of site-form bodies and URL queries. Nothing reads the column yet.

**Tech Stack:** Postgres (plpgsql migration + SQL behaviour test), Bun + TypeScript (`amo-sync`), postgres.js, React (one prompt string).

**Spec:** `docs/superpowers/specs/2026-11-10-crm-mcp-design.md` — §9.1 (this plan), build step 1 of §10. §9.2 backfill and §9.3 ad stats are a later plan.

## Global Constraints

- Never edit an existing migration file; this plan adds `supabase/migrations/091_lead_attribution.sql` only.
- Package manager is **bun**. Strict TypeScript, no `any`, `import type` for types.
- **No commit, push, or production action without the owner's explicit go-ahead** (standing rule). Each "Commit" step means: stage, show the diff summary, ask.
- Commit messages: `feat:` / `fix:` / `chore:` / `docs:`.
- SQL tests run only on a throwaway DB built by the recipe in `CLAUDE.md` §5 ("Tests"). A test counts only after it has been seen to fail on the old code.
- A lead must never be lost because of attribution: any failure in the new code path falls back to today's behaviour.
- Attribution keys, exactly: `utm_source utm_medium utm_campaign utm_content utm_term fbclid ad_id ad_name adset_id adset_name campaign_id campaign_name platform is_organic form_id leadgen_id`. All values are strings, trimmed, at most 300 characters; empty values are omitted.
- "Forma javoblari" (`crm_leads.fields`) must not contain UTM keys.

## Review Focus

1. **Meta token without ad-account rights** — Graph answers 400 to the extended field list → the lead still arrives with its answers, attribution holds only `form_id`/`leadgen_id` (Task 3).
2. **Incoming-call leads** — `log_pbx_call()` calls `intake_lead()` with the old argument count → still opens a bitim after the signature change (Task 1).
3. **Repeat request with different attribution** — the first attribution stays on the bitim; the new one is on the "Qayta murojaat" feed row (Task 1).
4. **UTM in both URL and body, mixed case** — body wins, one value per key, nothing leaks into `fields` (Task 2).
5. **Hostile UTM value** (10 KB, newlines) — cut to 300 characters, lead still opens (Task 2).

---

### Task 1: Migration 091 — `attribution` column and `intake_lead` parameter

**Files:**
- Create: `supabase/migrations/091_lead_attribution.sql`
- Test: `supabase/tests/091_lead_attribution_test.sql`
- Read first: `supabase/migrations/086_lead_address_per_voronka.sql` (current `intake_lead` body), `supabase/tests/086_lead_address_per_voronka_test.sql` (fixture style), `supabase/tests/074_pbx_calls_test.sql` (how `log_pbx_call` is called)

**Interfaces:**
- Produces: `crm_leads.attribution jsonb NOT NULL DEFAULT '{}'`;
  `public.intake_lead(p_source text, p_token text, p_name text, p_phone text, p_details text, p_raw jsonb DEFAULT '{}', p_fields jsonb DEFAULT '[]', p_pipeline text DEFAULT NULL, p_attribution jsonb DEFAULT '{}') RETURNS jsonb` — same return shape as 086.

- [ ] **Step 1: Write the failing test** `supabase/tests/091_lead_attribution_test.sql`, in the style of the 086 test (own fixture pipeline + stage, `sayt` source enabled, one `DO $$` block, `RAISE EXCEPTION 'TEST n FAILED: …'`). Assertions:

```sql
-- 1: a new lead keeps its attribution
r := public.intake_lead('sayt', t, 'Ali', '901230001', NULL, '{}', '[]', NULL,
       '{"campaign_id":"c1","ad_id":"a1","utm_source":"instagram"}');
-- crm_leads.attribution->>'campaign_id' = 'c1' AND ->>'utm_source' = 'instagram'

-- 2: a repeat request does not overwrite it; the feed row carries the new one
r := public.intake_lead('sayt', t, 'Ali', '901230001', NULL, '{}', '[]', NULL, '{"campaign_id":"c2"}');
-- (r->>'duplicate')::boolean is true
-- crm_leads.attribution->>'campaign_id' still 'c1'
-- newest crm_notes row of that lead with kind = 'lead': meta->'attribution'->>'campaign_id' = 'c2'

-- 3: the old 8-argument call still works and stores nothing
r := public.intake_lead('sayt', t, 'Vali', '901230002', NULL, '{}', '[]', NULL);
-- crm_leads.attribution = '{}'::jsonb ; its 'lead' note's meta has no 'attribution' key

-- 4: NULL attribution is treated as empty
r := public.intake_lead('sayt', t, 'Gani', '901230003', NULL, '{}', '[]', NULL, NULL);
-- crm_leads.attribution = '{}'::jsonb

-- 5: still service-only
-- NOT has_function_privilege('authenticated',
--   'public.intake_lead(text,text,text,text,text,jsonb,jsonb,text,jsonb)', 'execute')

-- 6: an incoming call from an unknown number still opens a bitim through log_pbx_call
--    (enable source 'call' on the fixture pipeline; call log_pbx_call exactly as 074's test does)
```

- [ ] **Step 2: Run it on the throwaway DB before the migration exists**

Run: build the stand per `CLAUDE.md` §5, then
`docker cp supabase/tests/091_lead_attribution_test.sql fy-test:/tmp/t.sql && docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql`
Expected: FAIL — `function public.intake_lead(…, jsonb) does not exist` (or `column "attribution" does not exist`).

- [ ] **Step 3: Write `091_lead_attribution.sql`**

One `BEGIN … COMMIT`. `ALTER TABLE public.crm_leads ADD COLUMN attribution jsonb NOT NULL DEFAULT '{}'::jsonb;` Then `DROP FUNCTION public.intake_lead(text, text, text, text, text, jsonb, jsonb, text);` and `CREATE FUNCTION` with the 9-parameter signature above, body copied from 086 with exactly three changes:
  1. `v_attr jsonb := COALESCE(jsonb_strip_nulls(p_attribution), '{}'::jsonb);`
  2. the `INSERT INTO public.crm_leads` adds `attribution` = `v_attr` (the duplicate branch does not touch it);
  3. the `crm_notes.meta` object gains `'attribution', v_attr` only when `v_attr <> '{}'::jsonb`.

Keep `SECURITY DEFINER SET search_path = public, pg_temp`, and re-issue the `REVOKE ALL … FROM PUBLIC, anon, authenticated` for the new signature. Header comment in the file's existing style (what and why, three lines).

- [ ] **Step 4: Apply 091 on the stand and re-run the test**

Run: `docker cp supabase/migrations/091_lead_attribution.sql fy-test:/tmp/m.sql && docker exec fy-test psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/m.sql`, then the Step 2 command.
Expected: `NOTICE: TESTS ok: …`, exit code 0. Also re-run `086_lead_address_per_voronka_test.sql` on a fresh stand — still green.

- [ ] **Step 5: Commit** (ask first) — `feat: leads remember the ad / UTM that brought them (091)`

---

### Task 2: `attribution.ts` — pure extraction

**Files:**
- Create: `amo-sync/src/attribution.ts`
- Test: `amo-sync/src/attribution.test.ts`

**Interfaces:**
- Produces:

```ts
export type Attribution = Record<string, string>   // only the keys listed in Global Constraints

/** Graph API field list for a leadgen node */
export const META_LEAD_FIELDS =
  "field_data,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform,is_organic"

export interface MetaLead {
  field_data?: { name: string; values: string[] }[]
  form_id?: string; ad_id?: string; ad_name?: string; adset_id?: string; adset_name?: string
  campaign_id?: string; campaign_name?: string; platform?: string; is_organic?: boolean
}

/** UTM / fbclid out of a form body and the URL query (body wins); `fields` is the body without them */
export function splitAttribution(body: Record<string, string>, query: URLSearchParams):
  { fields: Record<string, string>; attribution: Attribution }

/** A leadgen node's ad fields (+ its id) as attribution */
export function metaAttribution(lead: MetaLead, leadgenId: string): Attribution
```

- [ ] **Step 1: Write the failing tests** in `amo-sync/src/attribution.test.ts` (`bun:test`, style of `intake.test.ts`):

```ts
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
```

- [ ] **Step 2: Run** `cd amo-sync && bun test src/attribution.test.ts` — Expected: FAIL, `Cannot find module './attribution'`.

- [ ] **Step 3: Implement `amo-sync/src/attribution.ts`** with the signatures above. One shared cleaner: `String(v).split("\n")[0].trim().slice(0, 300)`, omit when empty.

- [ ] **Step 4: Run** `bun test src/attribution.test.ts` — Expected: 5 pass. Then `bunx tsc --noEmit -p .` if the package has a tsconfig, else `bun build src/index.ts --target bun --outdir /tmp/amo-build` — no type errors.

- [ ] **Step 5: Commit** (ask first) — `feat: intake reads UTM and Meta ad fields (pure helpers)`

---

### Task 3: Wire attribution into the intake

**Files:**
- Modify: `amo-sync/src/intake.ts` — `intake()` (line 59), `metaLeads()` (67–83), the site-form branch (132–135)
- Test: `amo-sync/src/intake.test.ts`

**Interfaces:**
- Consumes: Task 1's 9-parameter `intake_lead`; Task 2's `splitAttribution`, `metaAttribution`, `META_LEAD_FIELDS`, `MetaLead`, `Attribution`.
- Produces: `export async function fetchMetaLead(leadgenId: string, pageToken: string, fetchFn: typeof fetch = fetch): Promise<MetaLead>` — asks Graph for `META_LEAD_FIELDS`; on a non-OK answer retries **once** with `field_data,form_id`; throws only if that also fails.

- [ ] **Step 1: Write the failing tests** (append to `intake.test.ts`):

```ts
test("Meta: when Graph refuses the ad fields, the lead is fetched again without them", async () => {
  const urls: string[] = []
  const fake = (async (u: string | URL | Request) => {
    urls.push(String(u))
    return urls.length === 1
      ? new Response('{"error":{"code":200}}', { status: 400 })
      : Response.json({ form_id: "9", field_data: [{ name: "phone_number", values: ["+998901112233"] }] })
  }) as typeof fetch
  const lead = await fetchMetaLead("777", "tok", fake)
  expect(urls).toHaveLength(2)
  expect(urls[0]).toContain("campaign_id")
  expect(urls[1]).not.toContain("campaign_id")
  expect(lead.field_data?.[0].name).toBe("phone_number")
})

test("Meta: a Graph answer with ad fields is returned as is, in one request", async () => {
  let n = 0
  const fake = (async () => { n++; return Response.json({ form_id: "9", campaign_id: "3", field_data: [] }) }) as typeof fetch
  expect((await fetchMetaLead("777", "tok", fake)).campaign_id).toBe("3")
  expect(n).toBe(1)
})

test("Meta: both requests failing is an error (the caller logs it, as today)", async () => {
  const fake = (async () => new Response("nope", { status: 500 })) as typeof fetch
  expect(fetchMetaLead("777", "tok", fake)).rejects.toThrow("Graph 500")
})
```

- [ ] **Step 2: Run** `bun test src/intake.test.ts` — Expected: FAIL, `fetchMetaLead` is not exported.

- [ ] **Step 3: Implement**
  - `fetchMetaLead` as specified; on the fallback, `console.error("[intake] meta: reklama maydonlari berilmadi (token huquqi?) — lid ularsiz olindi")`.
  - `intake(sql, source, token, p, raw, voronka = null, attribution: Attribution = {})` passes `${sql.json(attribution)}` as the 9th argument.
  - `metaLeads`: use `fetchMetaLead`; `attribution = metaAttribution(lead, leadgen_id)`; the raw log object becomes `{ ...fields, ...attribution }`.
  - Site branch: `const { fields, attribution } = splitAttribution(raw, url.searchParams)`; `parseLead(fields)`; the raw log stays the **whole** body (`raw`); pass `attribution`. The Tilda ping check stays on `raw`, before the split.

- [ ] **Step 4: Run** `bun test` in `amo-sync` — Expected: every test file passes (the existing `parseLead` tests unchanged).

- [ ] **Step 5: End-to-end on the stand.** With the Task 1 stand running and port 5432 published (`docker run … -p 55432:5432`), start the worker's intake against it: `DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres INTAKE_PORT=8799 bun run src/index.ts` (other features stay off without their env). Enable `sayt` on a fixture pipeline, then:

```bash
curl -s -X POST "http://localhost:8799/hooks/lead/sayt?token=<token>&utm_medium=cpc" -H 'content-type: application/json' -d '{"name":"Test","phone":"901239999","Soha":"IT","utm_source":"instagram","utm_campaign":"kaizen"}'
```

Expected: `{"ok":true,"duplicate":false}`; in the DB the new lead has `attribution = {"utm_source":"instagram","utm_campaign":"kaizen","utm_medium":"cpc"}` and `fields = [{"k":"Soha","v":"IT"}]`.

- [ ] **Step 6: Commit** (ask first) — `feat: lead intake stores ad attribution (Meta ad fields, UTM)`

---

### Task 4: Site-builder prompt passes UTM

**Files:**
- Modify: `src/components/sotuv/PipelineSettings.tsx` — `sitePrompt` (lines 153–166)

- [ ] **Step 1:** Add one bullet to the prompt, after the "Maydonlar" list:

```
- Sahifa manzilida utm_source, utm_medium, utm_campaign, utm_content, utm_term yoki fbclid bo'lsa, ularni ham xuddi shu nom bilan JSON'ga qo'shib yubor — reklama qaysi lidni olib kelganini bilish uchun.
```

- [ ] **Step 2: Run** `bun run build` (repo root) — Expected: builds, no type errors.
- [ ] **Step 3: Commit** (ask first) — `feat: site prompt asks forms to pass UTM`

---

### Task 5: Ship and check Meta's answer

Production steps — **each needs the owner's explicit go-ahead**. Order matters: the database first (the old worker's 8-argument call keeps working against the new function).

- [ ] **Step 1:** Back up, apply `091`, record the version, refresh PostgREST — the exact commands are in `CLAUDE.md` §5 "Database deploy is MANUAL".
- [ ] **Step 2:** Redeploy amo-sync with the command in `CLAUDE.md` §5; `docker logs --tail 20 fy-amo-sync` shows `[intake] listening on :8787` and no error.
- [ ] **Step 3:** Merge the web change to `main` (Coolify redeploys).
- [ ] **Step 4: Verify on production** — after the next real Meta lead arrives (or a test lead from Meta's Lead Ads Testing Tool):

```sql
select created_at, source, attribution from crm_leads where source = 'meta' order by created_at desc limit 3;
```

Expected: `attribution` has `campaign_id` / `ad_id`. If it holds only `form_id` and `leadgen_id` and the worker log shows "reklama maydonlari berilmadi", report to the owner: the page token needs ad-account access in Meta Business (spec §13, question 2). The code needs no change either way.
- [ ] **Step 5:** `CLAUDE.md`: in the "Lead intake (`073`)" note add one sentence on `091` (what `attribution` holds, set once, UTM lifted out of the answers); bump the migration range `001–090` → `001–091`. Commit (ask first) — `docs: lead attribution (091)`.
