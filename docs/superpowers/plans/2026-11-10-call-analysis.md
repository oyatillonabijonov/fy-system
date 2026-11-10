# AI Call Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every answered sales call is transcribed and coached by Gemini by itself, shown to the seller (own calls) and to managers (everyone, with per-seller averages, weekly trend and top-3 mistakes).

**Architecture:** A new minute timer in `amo-sync` claims one call at a time from a DB function, downloads the mp3 through the existing `audioLink`, makes two Gemini requests (audio → neutral A/B transcript; text → who the seller is + analysis) and writes one row per call into a new table. The web reads that table under RLS (own calls or manager), aggregates come from a DB function, and the sales script is a single editable row.

**Tech Stack:** Bun + `postgres` (amo-sync), Supabase Postgres + RLS, React 19 + TanStack Query, Gemini REST (`generateContent`, JSON schema output). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-10-call-analysis-design.md` — read it first, especially "What the spike showed".

## Global Constraints

- `CLAUDE.md` rules apply: bun (not npm); strict TypeScript, no `any`; `import type`; UI copy in Uzbek; Plexus token utilities only (no hex); buttons `rounded-full`; no shadows; tables via `tbl` + `Pager`; dialogs via `ui/Sheet`; never `window.confirm`.
- Never edit an existing migration. The new one is `supabase/migrations/090_call_analysis.sql`.
- SQL tests run only on a throwaway docker Postgres (recipe in `CLAUDE.md` → Tests). Never against production.
- **No `git commit` without the owner's confirmation.** Each task's "Commit" step means: stage, show the summary, ask; if confirmation was given once for the whole plan, commit. Format `feat:` / `fix:` / `docs:`.
- `GEMINI_API_KEY` stays server-side (amo-sync env). No secret in code, logs or docs.
- Names go to the transcription request; **prices, dates and other numbers go only to the analysis request** (spike: a hinted price overwrote a spoken one).
- All AI comments are in Uzbek whatever the call's language; the transcript stays in the spoken language.
- One call at a time; the task bot shares the key and must not be starved.
- Desktop stays as is; phone layouts via `Sheet` / `max-lg:`.

## Review Focus

1. **A recording that isn't published yet** (call just ended) — expected: retried for 30 min after the call's end, not skipped at once. Test: Task 2 `recordingVerdict`.
2. **Gemini answers with malformed JSON, an unknown mistake tag, a score out of range, or no `seller_voice`** — expected: the tick doesn't throw, the row is retried (or saved with safe values), nothing half-written. Test: Task 2 `normalize`.
3. **A call with no staff member, no client, no bitim or a voronka without an event** — expected: analysed with whatever facts exist; visible to managers only. Tests: Task 2 `factsText`, Task 1 RLS block.
4. **The AI names the wrong voice as the seller** (seen in the spike) — expected: a self-introduction ("ismim Zuhra", the club's name) overrides the AI's pick. Test: Task 2 `sellerVoice`.
5. **amo-sync restarts or two ticks overlap mid-analysis** — expected: the call isn't analysed twice in parallel and isn't lost. Test: Task 1 claim-lease block.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/090_call_analysis.sql` (new) | table, script row, RLS, claim/requeue/stats functions, realtime |
| `supabase/tests/090_call_analysis_test.sql` (new) | behaviour tests of the above |
| `amo-sync/src/callAnalysis.ts` (new) | prompts, schemas, pure helpers, Gemini call, the timer |
| `amo-sync/src/callAnalysis.test.ts` (new) | `bun test` for the pure helpers |
| `amo-sync/src/index.ts` (modify) | start the timer |
| `src/lib/supabase/queries/callAnalysis.ts` (new) | types + reads/writes for the web |
| `src/lib/supabase/queries/sotuv.ts` (modify) | calls carry `analysis: { status, score }` |
| `src/hooks/useCallAnalysis.ts` (new) | query/mutation hooks |
| `src/components/sotuv/CallAnalysis.tsx` (new) | `ScoreBadge`, `CallAnalysisSheet` |
| `src/components/sotuv/CallStats.tsx` (new) | manager/seller summary + script editor |
| `src/components/pages/SotuvCalls.tsx`, `SotuvLead.tsx` (modify) | badge on call rows, "Tahlil" tab |
| `src/components/layout/LiveSync.tsx`, `src/lib/supabase/queries/auth.ts` (modify) | live refresh; `isManager` |
| `CLAUDE.md` (modify) | env vars + a Sotuv note |

---

### Task 1: Database (migration 090 + SQL test)

**Files:**
- Create: `supabase/migrations/090_call_analysis.sql`
- Test: `supabase/tests/090_call_analysis_test.sql`

**Interfaces — Produces:**

```
table public.crm_call_analyses
  call_uuid   text PRIMARY KEY REFERENCES public.crm_calls(uuid) ON DELETE CASCADE
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed','skipped'))
  attempts    int  NOT NULL DEFAULT 0
  next_try_at timestamptz NOT NULL DEFAULT now()
  last_try_at timestamptz
  model text, language text, error text
  transcript  jsonb   -- [{t, who: 'seller'|'client', text}]
  summary text, outcome text
  score       int CHECK (score BETWEEN 0 AND 100)      -- NULL = not scored
  criteria    jsonb   -- [{name, score|null, comment}]
  good        jsonb   -- [text]
  mistakes    jsonb   -- [{t, quote, why, better, tag}]
  words       jsonb   -- [{word, count, why}]
  advice      jsonb   -- [text]
  script_missed jsonb -- [text]
  created_at timestamptz NOT NULL DEFAULT now(), analysed_at timestamptz

table public.sales_script  (id boolean PRIMARY KEY DEFAULT true CHECK (id), body text NOT NULL DEFAULT '',
                            updated_at timestamptz, updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL)
  -- one row inserted by the migration

amo_sync_state: key 'call_analysis_from' = now() at migration time (epoch seconds as text, like 'pbx_synced_to')

public.is_manager(p_user uuid) returns boolean        -- role IN ('admin','manager') AND COALESCE(is_active,true); SECURITY DEFINER
public.call_analysis_claim() returns TABLE (call_uuid text, direction text, started_at timestamptz, duration int,
        talk_time int, attempts int, seller_name text, client_name text, event_name text, event_date timestamptz,
        tariffs text, script text)                     -- service-only (REVOKE from PUBLIC, anon, authenticated)
public.requeue_call_analysis(p_call text) returns void -- admin only; SECURITY DEFINER
public.call_analysis_stats(p_from date, p_to date) returns jsonb   -- SECURITY DEFINER, guarded
```

Rules the SQL must implement:

- `call_analysis_claim()`: picks the oldest call with `talk_time > 0`, `started_at >=` the `call_analysis_from` moment, `started_at > now() - interval '1 day'`, and either no analysis row or a `pending` row with `next_try_at <= now()`. It upserts the row as `pending` with `next_try_at = now() + interval '10 minutes'` (the lease — a crash or a second tick can't take the same call), `last_try_at = now()`, and returns at most one row. `seller_name` = `profiles.full_name` by `staff_id`; `client_name` = `clients.full_name`, NULL when it's only digits (a bitim named by the phone); event = `crm_calls.lead_id → crm_leads.pipeline_id → crm_pipelines.event_id → events(name, date)`; `tariffs` = `string_agg(name || ': ' || price::bigint, '; ' ORDER BY sort_order)` from `event_tariffs`; `script` = `sales_script.body` (NULL when blank).
- RLS on `crm_call_analyses`: SELECT when `has_permission(auth.uid(),'sotuv-crmn') AND (is_manager(auth.uid()) OR EXISTS (call with this uuid AND staff_id = auth.uid()))`. No INSERT/UPDATE/DELETE policy.
- RLS on `sales_script`: SELECT with `sotuv-crmn`; UPDATE with `is_admin(auth.uid())`. No insert/delete.
- `requeue_call_analysis`: raises unless `is_admin(auth.uid())`; sets `status='pending', attempts=0, next_try_at=now(), error=NULL`.
- `call_analysis_stats`: raises without `sotuv-crmn`. Period = Tashkent days of `crm_calls.started_at`. Returns `{"sellers":[{"staff_id","name","calls","avg_score","weeks":[{"week":"YYYY-MM-DD" (Monday),"avg","calls"}],"tags":[{"tag","count"}]}]}` — `calls` = `done` rows, `avg_score` over rows with a score (rounded int, NULL if none), `tags` = top 3 by count from `mistakes[].tag`, sellers ordered by `avg_score` desc nulls last. A non-manager gets only their own seller object. Calls with `staff_id` NULL are left out.
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_call_analyses;`
- Every function `SET search_path = public, pg_temp`. Wrap in `BEGIN; … COMMIT;` with a header comment like `089`.

- [ ] **Step 1: Write the failing test** `supabase/tests/090_call_analysis_test.sql` in the style of `089_missed_call_dm_test.sql` (fixtures, `SET LOCAL role authenticated` + `request.jwt.claims` to act as a user, `DO $$ … RAISE EXCEPTION` on failure). Fixtures: admin `A`, manager `M` (role `manager`), sellers `S1`, `S2` (xodim, `sotuv-crmn` view permission), user `X` without the permission; calls: `c1` (S1, answered, now), `c2` (S2, answered, now), `c3` (no staff, answered, now), `c4` (S1, `talk_time = 0`), `c5` (S1, answered, 2 days ago), `c6` (S1, answered, before `call_analysis_from` — set the state key to `now() - interval '1 hour'` and start `c6` 3 hours ago). Blocks, each named in its `RAISE`:
  1. `claim picks answered calls only`: three claims return `c1`, `c2`, `c3` in `started_at` order (never `c4`, `c5`, `c6`); the fourth returns no row.
  2. `claim lease`: right after a claim the same call isn't returned again; after `UPDATE … SET next_try_at = now() - interval '1 minute'` it is.
  3. `claim facts`: with a lead in a voronka whose event has tariffs `Standart 1800000`, `VIP 3000000` and a script `'Salom'`, the claimed row has `event_name`, `tariffs = 'Standart: 1800000; VIP: 3000000'`, `script = 'Salom'`; a client named `+998901234567` gives `client_name IS NULL`.
  4. `rls seller sees own only`: mark all three `done`; as `S1` `count(*) = 1` (c1); as `S2` 1 (c2); as `M` 3; as `A` 3; as `X` 0.
  5. `rls no api writes`: as `S1`, `UPDATE crm_call_analyses SET score = 100` changes 0 rows; `INSERT` raises.
  6. `requeue admin only`: as `S1` raises; as `A` sets `pending`, `attempts = 0`.
  7. `script`: as `S1` SELECT works and UPDATE changes 0 rows; as `A` UPDATE changes 1.
  8. `stats`: c1 score 60 with mistakes tags `['keyingi_qadam','keyingi_qadam','boshqa']`, c2 score 80, c3 score 10: as `M` two sellers, S2 first (80), S1 `avg_score = 60`, `tags[0] = {keyingi_qadam, 2}`; as `S1` exactly one seller (self); as `X` raises. A `done` row with `score NULL` counts in `calls` but not in `avg_score`.

- [ ] **Step 2: Build the throwaway stand and run the test to see it fail** (recipe in `CLAUDE.md`; replay migrations `001`–`089`, then the test). Expected: FAIL — `relation "crm_call_analyses" does not exist`.

- [ ] **Step 3: Write `090_call_analysis.sql`** per the Interfaces block and rules above.

- [ ] **Step 4: Apply 090 on the stand and run the test.** Expected: exit code 0, no `RAISE`.

- [ ] **Step 5: Prove the test bites:** on the stand, replace the SELECT policy with `USING (true)` and re-run — block 4 must fail; restore by re-applying 090 on a fresh stand. Then `docker rm -f fy-test`.

- [ ] **Step 6: Commit** — `feat: call analysis tables, access rules and stats (090)`.

---

### Task 2: Worker — pure helpers (`amo-sync/src/callAnalysis.ts`)

**Files:**
- Create: `amo-sync/src/callAnalysis.ts`, `amo-sync/src/callAnalysis.test.ts`

**Interfaces — Consumes:** the claim row of Task 1.
**Produces (all exported):**

```ts
export interface Claim { call_uuid: string; direction: "in" | "out"; started_at: Date; duration: number; talk_time: number; attempts: number
  seller_name: string | null; client_name: string | null; event_name: string | null; event_date: Date | null; tariffs: string | null; script: string | null }
export interface Line { t: string; voice: "A" | "B"; text: string }
export interface RoleLine { t: string; who: "seller" | "client"; text: string }
export const TAGS = ["tanishtirmadi", "ehtiyoj_soramadi", "foyda_aytmadi", "etirozga_javob_yoq", "keyingi_qadam", "sovutadigan_gap", "ortiqcha_soz", "tinglamadi", "boshqa"] as const
export type Tag = (typeof TAGS)[number]
export interface Analysis { seller_voice: "A" | "B"; language: string; summary: string; outcome: string; score: number | null
  criteria: { name: string; score: number | null; comment: string }[]; good: string[]
  mistakes: { t: string | null; quote: string; why: string; better: string; tag: Tag }[]
  words: { word: string; count: number | null; why: string }[]; advice: string[]; script_missed: string[] }

export const CLUB = "Fikr Yetakchilari"
export const TRANSCRIPT_SCHEMA: object          // { lines: [{t, voice: enum A|B, text}] }
export const ANALYSIS_SCHEMA: object            // Analysis as a Gemini responseSchema; mistakes[].tag enum = TAGS; score nullable
export function namesHint(c: Claim): string     // names only: club, seller, client, event name — never numbers
export function factsText(c: Claim): string     // direction, seller, client, event + date (Tashkent dd.mm.yyyy) + tariffs; skips what is null
export function transcriptPrompt(c: Claim): string
export function analysisPrompt(c: Claim, lines: Line[]): string
export function sellerVoice(lines: Line[], ai: "A" | "B" | undefined, sellerName: string | null): "A" | "B"
export function toRoles(lines: Line[], seller: "A" | "B"): RoleLine[]
export function normalize(raw: unknown): Analysis | null
export function retryDelayMin(attempts: number): number | null     // attempts already made → minutes to wait; null = give up
export function recordingVerdict(status: number, bytes: number, c: Claim, now: Date): "ok" | "wait" | "skip"
```

Decisions the bodies must follow:

- `transcriptPrompt` / `analysisPrompt`: start from the spike's wording quoted in the spec (step 1: neutral voices A/B, first speaker = A, spoken language, `[tushunarsiz]`, nothing invented, plus `namesHint`; step 2: coach role, decide the seller from content, judge only the seller, six criteria named exactly as in the spec, all comments in Uzbek, garbled text is not the seller's fault, a meaningless/too-short call gets `score: null` and says so in `summary`, each mistake gets one tag from `TAGS`, plus `factsText`). When `c.script` is set, append it under "Sotuv skripti" and ask for `script_missed`; otherwise `script_missed` is `[]`.
- `sellerVoice`: if exactly one voice has a line containing (case-insensitive, apostrophes ignored) the club name or `ismim <seller's first name>`, that voice wins; otherwise the AI's pick; with no AI pick, `"A"`.
- `normalize`: returns `null` when `raw` isn't an object or `summary`/`criteria` are missing; clamps scores (overall 0–100, criteria 0–10, non-numbers → null); unknown tag → `"boshqa"`; drops mistakes without `quote`; arrays default to `[]`.
- `retryDelayMin`: `[2, 5, 10, 20, 30][attempts]`, `null` from 5.
- `recordingVerdict`: `ok` when `status === 200 && bytes >= 2000 && bytes <= 18_000_000`; `skip` when bytes > 18 MB; otherwise (`404`, tiny body) `wait` while `now < started_at + duration s + 30 min`, then `skip`.

- [ ] **Step 1: Write the failing tests** in `callAnalysis.test.ts` (`bun:test`), one `test` per line:

```ts
const base: Claim = { call_uuid: "u", direction: "in", started_at: new Date("2026-11-10T10:00:00Z"), duration: 60, talk_time: 50, attempts: 0,
  seller_name: "Zuhra Aliyeva", client_name: "Maxmud Rasulov", event_name: "Biznes nonushta", event_date: new Date("2026-11-28T03:30:00Z"), tariffs: "Standart: 1800000", script: null }

// namesHint: has "Fikr Yetakchilari", "Zuhra", "Maxmud Rasulov", "Biznes nonushta"; does NOT contain "1800000" or "28"
// transcriptPrompt(base) does not contain "1800000"
// factsText(base) contains "1800000", "28.11.2026", "mijoz o'zi qo'ng'iroq qilgan"; direction "out" → "sotuvchi mijozga qo'ng'iroq qilgan"
// factsText({...base, seller_name: null, client_name: null, event_name: null, event_date: null, tariffs: null}) contains no "null" and no "undefined"
// analysisPrompt(base, lines) contains "A: Alo" lines and no "Sotuv skripti"; with script "Salomlashing" it contains both
// sellerVoice([{voice:"A",text:"Alo"},{voice:"B",text:"Maxmud aka, ismim Zuhra, Fikr yetakchilaridan"}], "A", "Zuhra Aliyeva") === "B"
// sellerVoice(linesWithoutIntro, "B", "Zuhra") === "B";  sellerVoice(linesWithoutIntro, undefined, null) === "A"
// sellerVoice where BOTH voices say the club name → falls back to the AI's pick
// toRoles(lines, "B") maps B→"seller", A→"client"
// normalize("x") === null; normalize({summary:"s"}) === null
// normalize({summary:"s", criteria:[{name:"n", score: 14, comment:"c"}], score: 140, mistakes:[{quote:"q", why:"w", better:"b", tag:"zzz"}, {why:"w"}]})
//   → score 100, criteria[0].score 10, mistakes.length 1, mistakes[0].tag "boshqa", good [], words [], advice [], script_missed []
// normalize with score: null keeps null
// retryDelayMin(0) === 2; retryDelayMin(4) === 30; retryDelayMin(5) === null
// recordingVerdict(200, 300_000, base, now) === "ok"
// recordingVerdict(404, 0, base, new Date("2026-11-10T10:05:00Z")) === "wait";  at 10:40:00Z === "skip"
// recordingVerdict(200, 19_000_000, base, now) === "skip"
```

- [ ] **Step 2: Run** `cd amo-sync && bun test src/callAnalysis.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement the exports above** in `callAnalysis.ts` (pure part only; no network, no SQL yet).
- [ ] **Step 4: Run the tests** — Expected: all PASS. Also `cd amo-sync && bunx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `feat: call analysis prompts and helpers`.

---

### Task 3: Worker — Gemini call and the timer

**Files:**
- Modify: `amo-sync/src/callAnalysis.ts`, `amo-sync/src/index.ts` (add `startCallAnalysis(sql)` after `startPbxSync(sql)`)
- Test: `amo-sync/src/callAnalysis.test.ts`

**Interfaces — Consumes:** Task 1 `call_analysis_claim()`; Task 2 helpers; `audioLink(uuid, base)` from `./pbx`.
**Produces:**

```ts
export type Ask = (parts: object[], schema: object) => Promise<{ data: unknown; model: string }>   // throws when every model fails
export async function analyseCall(c: Claim, audio: Buffer, ask: Ask): Promise<{ transcript: RoleLine[]; analysis: Analysis; model: string }>   // throws on bad AI output
export function startCallAnalysis(sql: Sql): void
```

Decisions:

- Env: `GEMINI_API_KEY` (unset → log `[calls-ai] GEMINI_API_KEY yo'q — tahlil o'chiq` and return), `CALL_ANALYSIS_MODELS` (comma list, default `gemini-3.5-flash-lite`), `CALL_ANALYSIS_DAILY_MAX` (default `150`).
- The real `Ask`: same request shape as `askGemini` in `taskbot.ts`, `temperature: 0.2`, `maxOutputTokens: 32000`, `AbortSignal.timeout(120_000)`, tries each model once in order, throws the last error text (status + first 120 chars, never the key).
- `analyseCall`: request 1 = `[{text: transcriptPrompt(c)}, {inline_data: {mime_type: "audio/mpeg", data: base64}}]` with `TRANSCRIPT_SCHEMA`; no lines → throw `"transcript bo'sh"`. Request 2 = `[{text: analysisPrompt(c, lines)}]` with `ANALYSIS_SCHEMA`; `normalize` null → throw `"tahlil o'qilmadi"`. Seller = `sellerVoice(lines, analysis.seller_voice, c.seller_name)`.
- Tick (every 60 s, `busy` flag like `missedCalls.ts`, one call per tick):
  1. Daily cap: `select coalesce(sum(attempts),0) from crm_call_analyses where last_try_at > now() - interval '1 day'` ≥ max → return.
  2. `select * from public.call_analysis_claim()`; no row → return.
  3. Fetch `audioLink(call_uuid, "https://api.fikryetakchilari.uz")`; `recordingVerdict`: `wait` → `next_try_at = now() + 3 min` (attempts unchanged); `skip` → `status='skipped', error='yozuv yo''q'` (or `'yozuv juda katta'`).
  4. `ok` → `analyseCall`. Success → one UPDATE: `status='done'`, all fields, `attempts = attempts + 1`, `analysed_at = now()`, `error = NULL`. Throw → `attempts + 1`; `retryDelayMin(attempts)` minutes → `next_try_at`, or `status='failed'` with `error` when null.
  5. Any other exception is caught and logged as `[calls-ai] <message>`; the lease (10 min) then releases the call by itself.
- Log one line per finished call: `[calls-ai] <uuid8> done 62 (gemini-3.5-flash-lite, 14s)`.

- [ ] **Step 1: Write the failing tests** (fake `Ask`, no network):

```ts
// analyseCall happy path: ask returns {lines:[A "Alo", B "Maxmud aka, ismim Zuhra…"]} then {seller_voice:"A", summary:"s", criteria:[], score:60, …}
//   → transcript[1].who === "seller" (the intro overrides the AI's "A"), analysis.score === 60, model === "m"; ask called exactly twice;
//   first call's parts include an inline_data part, second call's parts don't
// analyseCall throws "transcript bo'sh" when the first answer is {lines: []}
// analyseCall throws "tahlil o'qilmadi" when the second answer is "garbage"
// analyseCall rethrows when ask throws (e.g. "503")
```

- [ ] **Step 2: Run** `bun test src/callAnalysis.test.ts` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement `analyseCall`, the real `Ask`, the tick and `startCallAnalysis`; wire it in `index.ts`.**
- [ ] **Step 4: Run** `bun test` (whole amo-sync suite) and `bunx tsc --noEmit` — Expected: all PASS, clean.
- [ ] **Step 5: Commit** — `feat: amo-sync analyses answered calls with Gemini`.

---

### Task 4: Web — data layer

**Files:**
- Create: `src/lib/supabase/queries/callAnalysis.ts`, `src/hooks/useCallAnalysis.ts`
- Modify: `src/lib/supabase/queries/sotuv.ts` (the `Call` interface and the two selects at `getLeadCalls` / `getCalls`), `src/lib/supabase/queries/auth.ts`, `src/components/layout/LiveSync.tsx`

**Interfaces — Produces:**

```ts
// queries/auth.ts
export const isManager = (u: Pick<UserProfile, "role"> | null | undefined) => u?.role === "admin" || u?.role === "manager"

// queries/sotuv.ts — Call gains:
analysis: { status: "pending" | "done" | "failed" | "skipped"; score: number | null } | null
// both selects add: analysis:crm_call_analyses(status, score)   (to-one by the PK/FK; RLS hides other sellers' rows → null)

// queries/callAnalysis.ts
export type AnalysisStatus = "pending" | "done" | "failed" | "skipped"
export interface CallAnalysis { call_uuid: string; status: AnalysisStatus; error: string | null; language: string | null
  transcript: { t: string; who: "seller" | "client"; text: string }[] | null; summary: string | null; outcome: string | null; score: number | null
  criteria: { name: string; score: number | null; comment: string }[] | null; good: string[] | null
  mistakes: { t: string | null; quote: string; why: string; better: string; tag: string }[] | null
  words: { word: string; count: number | null; why: string }[] | null; advice: string[] | null; script_missed: string[] | null; analysed_at: string | null }
export interface SellerStats { staff_id: string; name: string; calls: number; avg_score: number | null; weeks: { week: string; avg: number | null; calls: number }[]; tags: { tag: string; count: number }[] }
export const TAG_LABEL: Record<string, string>      // tanishtirmadi → "O'zini tanishtirmadi", ehtiyoj_soramadi → "Ehtiyojni so'ramadi", foyda_aytmadi → "Foydani aytmadi",
                                                     // etirozga_javob_yoq → "E'tirozga javob bermadi", keyingi_qadam → "Keyingi qadam yo'q", sovutadigan_gap → "Mijozni sovutadigan gap",
                                                     // ortiqcha_soz → "Ortiqcha so'zlar", tinglamadi → "Mijozni tinglamadi", boshqa → "Boshqa"
export async function getCallAnalysis(uuid: string): Promise<CallAnalysis | null>
export async function getCallStats(from: string, to: string): Promise<SellerStats[]>       // rpc call_analysis_stats, dates YYYY-MM-DD
export async function getSalesScript(): Promise<string>
export async function saveSalesScript(body: string): Promise<void>
export async function requeueCallAnalysis(uuid: string): Promise<void>

// hooks/useCallAnalysis.ts — every key starts with SOTUV_KEY
export const useCallAnalysis = (uuid: string | null) => …          // enabled: !!uuid, refetchOnMount: true
export const useCallStats = (from: string, to: string) => …        // refetchOnMount: true
export const useSalesScript = () => …
export const useSaveSalesScript = () => …                           // meta: { success: "Skript saqlandi" }, invalidates the script key
export const useRequeueAnalysis = () => …                           // meta: { success: "Qayta tahlilga yuborildi" }, invalidates SOTUV_KEY
```

- `types.ts` isn't regenerated: use the "Stale types workaround" from `CLAUDE.md` (the file already casts through `db`).
- `LiveSync.tsx` `TOUCHES`: add `crm_call_analyses: ["sotuv"]`.

- [ ] **Step 1: Implement the above.**
- [ ] **Step 2: Verify** `bun run build` and `bun run lint` — Expected: both clean (no test runner on the web side; the UI tasks exercise this code).
- [ ] **Step 3: Commit** — `feat: call analysis queries and hooks`.

---

### Task 5: Web — the analysis on a call

**Files:**
- Create: `src/components/sotuv/CallAnalysis.tsx`
- Modify: `src/components/pages/SotuvCalls.tsx` (both row renderers near lines 116 and 150), `src/components/pages/SotuvLead.tsx` (the call row near line 315)

**Interfaces — Consumes:** Task 4 hooks/types; `Sheet` from `@/components/ui/Sheet`; `Recording` from `@/components/sotuv/ui`.
**Produces:**

```tsx
export function ScoreBadge({ analysis, onOpen }: { analysis: Call["analysis"]; onOpen: () => void })
export function CallAnalysisSheet({ uuid, onClose }: { uuid: string | null; onClose: () => void })
```

Behaviour:

- `ScoreBadge`: `null` → renders nothing. `done` with a score → a pill button with the number (success tone ≥ 75, warning 50–74, danger < 50 — soft token backgrounds), label for screen readers "Tahlil: 62 ball". `done` without a score → pill "Tahlil". `pending` → muted text "Tahlil qilinmoqda…" (not a button). `failed` → muted pill "Tahlil bo'lmadi" (opens the sheet). `skipped` → nothing.
- `CallAnalysisSheet` (title "Suhbat tahlili"), top to bottom: score big + outcome + summary; note line `AI tahlili — xato bo'lishi mumkin` (`text-ink-faint`); **Mezonlar** (name, score/10 or "—", comment); **Yaxshi qilgani**; **Xatolar** — each: time, «quote», "Nega:" why, "O'rniga:" better, tag label chip; **Tashlab yuboriladigan so'zlar** (word × count — why); **Tavsiyalar**; **Skriptdan tushib qolgani** (only when non-empty); `Recording`; **Suhbat matni** collapsed by default (`<details>`), lines labelled "Sotuvchi" / "Mijoz". Empty sections are not rendered. `failed`: shows "Tahlil qilib bo'lmadi" + the error, and for admins a "Qayta tahlil" button (`useRequeueAnalysis`). No score → "Baho qo'yilmadi" in place of the number.
- Rows: the badge sits beside the talk time / recording; the sheet's `uuid` state lives in the page. Missed calls get no badge.

- [ ] **Step 1: Implement the component and place it in the three row renderers.**
- [ ] **Step 2: Verify** `bun run build && bun run lint` clean.
- [ ] **Step 3: Commit** (the browser check on real data is Task 7 step 6) — `feat: call analysis badge and sheet on calls`.

---

### Task 6: Web — "Tahlil" tab (sellers' numbers + sales script)

**Files:**
- Create: `src/components/sotuv/CallStats.tsx`
- Modify: `src/components/pages/SotuvCalls.tsx` (a "Qo'ng'iroqlar | Tahlil" segmented control at the top, kept in the URL as `?tab=tahlil`)

**Interfaces — Consumes:** `useCallStats`, `useSalesScript`, `useSaveSalesScript`, `TAG_LABEL`, `isManager`, `Segmented` from `@/components/sotuv/ui`, `tbl`, `Sheet`, `lib/period.ts` for Tashkent day ranges.
**Produces:** `export function CallStats()`

Behaviour:

- Period segmented control: "7 kun" · "30 kun" (default) · "90 kun" → `from`/`to` as Tashkent dates.
- Managers (`isManager(user)`): a `tbl` table, one row per seller — Sotuvchi · Tahlil qilingan (calls) · O'rtacha baho (same colour tones as the badge) · Haftalik (the weekly averages as a row of small numbers oldest → newest with ▲/▼ against the previous week; no chart library work) · Ko'p takrorlangan xatolar (up to 3 tag chips with counts). On a phone: inset cards instead of the table. Empty: "Hali tahlil qilingan suhbat yo'q".
- A seller sees the same content for themself as one card (the function already returns only their row).
- Admins: a "Sotuv skripti" button → `Sheet` with a textarea (10+ rows), helper text "To'ldirilsa, AI har bir suhbatni shu skript bilan solishtiradi. Bo'sh bo'lsa — umumiy sotuv qoidalari bo'yicha baholaydi.", sticky "Saqlash".

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** `bun run build && bun run lint` clean.
- [ ] **Step 3: Commit** — `feat: Tahlil tab — sellers' scores, trend, repeated mistakes, sales script`.

---

### Task 7: Docs, ship, and check on real calls

**Files:**
- Modify: `CLAUDE.md` (§4: `CALL_ANALYSIS_MODELS`, `CALL_ANALYSIS_DAILY_MAX`; §2/§3 migration range → `090`; §7 Sotuv note: one paragraph — what it does, two-request design and why, names-vs-numbers rule, who sees what, retry/lease, `Tahlil` tab)

- [ ] **Step 1: Update `CLAUDE.md`.**
- [ ] **Step 2: Open a PR** (branch `claude/call-analysis`), body ends with the Claude Code line; bind it (`ccd_pr`), don't poll CI.
- [ ] **Step 3: Back up production** (command in `CLAUDE.md` → "Database deploy"). Expected: `backed up <ts>`.
- [ ] **Step 4: Apply `090`** to production, record version `090`, `docker restart supabase-rest-1`. Expected: `COMMIT`, then `select value from amo_sync_state where key='call_analysis_from'` returns a value.
- [ ] **Step 5: Merge the PR** (`--repo oyatillonabijonov/fy-system`), `git -C ~/Desktop/fy-system pull --ff-only`, redeploy amo-sync (command in `CLAUDE.md`), confirm Coolify deployed the frontend. Expected in `docker logs --tail 20 fy-amo-sync`: no `[calls-ai] … o'chiq` line.
- [ ] **Step 6: Watch the first real calls.** After the next answered call: `select status, score, attempts, error from crm_call_analyses order by created_at desc limit 5` → `done` within ~5 min; open it in Qo'ng'iroqlar as admin (badge + sheet), and check a seller login sees a badge only on their own calls. Report to the owner in plain Uzbek what the first 3 analyses look like, including any wrong speaker labels.
- [ ] **Step 7: Commit** docs with the PR (`docs:`), not separately after merge.

---

## Self-review notes

- Spec coverage: auto analysis (T1 claim, T3), per-call output (T2 schema, T5), visibility (T1 RLS, T4 embed), manager numbers (T1 stats, T6), script (T1, T2 prompt, T6), old calls excluded (T1 `call_analysis_from` + 1-day window), failure handling/lease/cap/recording wait (T1, T2, T3), admin re-queue (T1, T5), realtime (T1, T4), no-score short calls (T2 prompt, T1 stats), "AI may be wrong" note (T5), env-only model switch (T3), CLAUDE.md (T7).
- Not planned on purpose (spec non-goals): old calls, Telegram, UI on/off switch, visual polish.
