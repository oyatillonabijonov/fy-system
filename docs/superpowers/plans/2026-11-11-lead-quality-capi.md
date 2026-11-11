# Lead Quality + Meta CAPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score site applications on arrival, answer `qualified`, show the verdict on the bitim, and send `Lead` / `QualifiedLead` / `Purchase` to Meta's Conversions API once per bitim.

**Architecture:** amo-sync scores the form (pure TS) right after `intake_lead()` and writes `lead_score`/`qualified`/`capi` on the bitim; database triggers queue Meta events into `meta_events_log` (the queue + log); a 30 s timer in amo-sync sends them. Web reads the new columns.

**Tech Stack:** Bun + postgres (amo-sync), Postgres triggers, React (bitim page, Voronka sozlamalari).

**Spec:** `docs/superpowers/specs/2026-11-11-lead-quality-capi-design.md`

## Global Constraints

- New migration `093_lead_quality_capi.sql`; never edit old ones. SQL test on a throwaway Postgres only. Backup before applying.
- bun, strict TS, no `any`; Uzbek UI copy; token utilities.
- `META_CAPI_TOKEN` / `META_TEST_EVENT_CODE` only in Doppler + `~/amo-sync/.env`; never logged, never in the repo.
- Graph endpoint `https://graph.facebook.com/v26.0/1647118073645060/events`.
- Old forms (no `Lavozim` and no `Oylik aylanma`) behave as today: no score, no `qualified` key in the answer.

## Review Focus

1. Apostrophe/dash variants (`'` `‘` `’` `ʻ`, `-` `–` `—`) in option text and in the company stop-list → same score. (Task 1 tests)
2. A repeat application on an open bitim → re-scored, `capi` replaced, `Lead` queued at most once. (Task 2 SQL test)
3. Bitimlar with no `capi` (manual, calls, Meta lead ads) → no Meta event queued at all. (Task 2 SQL test)
4. Meta answers 4xx/5xx or times out → row retried after 1, 10, 60 min, then `failed`; nothing else stalls. (Task 3 tests)
5. Missing fbc / fbp / IP → keys omitted, not sent empty. (Task 3 tests)

## Rulings (deviations from the spec, recorded before building)

- **7-day rule counts from the event's own time, not the application's.** The spec's wording would skip almost every `Purchase` (people pay days later), and Meta's real limit is on `event_time`. Cost if wrong: a few late Purchases sent that the brief meant to drop.
- **Meta events are queued only for bitimlar that came through a scored site form** (`capi` present): `action_source: "website"` needs a page URL, and manual/phone bitimlar weren't brought by the ad. Cost if wrong: QualifiedLead/Purchase missing for ad leads that arrived another way.

---

### Task 1: Score and CAPI fields (pure TS)

**Files:** Create `amo-sync/src/leadScore.ts`, `amo-sync/src/leadScore.test.ts`.

**Produces:**
```ts
export const CAPI_KEYS = ["event_id", "event_source_url", "content_name", "fbc", "fbp"] as const
export type Capi = Partial<Record<(typeof CAPI_KEYS)[number] | "client_ip" | "user_agent", string>>
export function norm(s: string): string                       // lower, trim, spaces folded, apostrophes → "'", dashes → "-"
export function scoreLead(fields: Record<string, string>): number | null   // null when neither Lavozim nor Oylik aylanma present (keys matched by norm)
export function splitCapi(fields: Record<string, string>): { fields: Record<string, string>; capi: Capi }  // pulls CAPI_KEYS out, values trimmed ≤ 1000 chars, empty dropped
export function clientMeta(h: Headers): Pick<Capi, "client_ip" | "user_agent">  // CF-Connecting-IP, else first X-Forwarded-For
```
Points: Lavozim — biznes egasi / asoschi 3, direktor / top-menejer 2, bo'lim rahbari 1, else 0. Aylanma — 1 mlrd so'mdan yuqori 3, 500 mln - 1 mlrd so'm 2, 100-500 mln so'm 1, else 0. Kompaniya +1 unless empty, < 3 chars, no letter, or one of `yo'q yoq нет - talaba student o'quvchi ishsiz test`.

- [ ] Tests (`bun test src/leadScore.test.ts`): owner + "100–500 mln so‘m" + "Test MChJ" → 5; "Xodim / mutaxassis" + "Hali biznesim yo‘q" + "yo‘q" → 0; same option text with `'`/`’`/`ʻ` and `-`/`—` → same score; company "12", "--", "TEST", "Talaba" → +0, "IT" → +0 (<3), "Savdo" → +1; `{name, phone, Kompaniya}` only → null; `splitCapi` removes the five keys and keeps the rest; `clientMeta` prefers CF-Connecting-IP, else `"1.2.3.4, 10.0.0.1"` → `1.2.3.4`, none → no key.
- [ ] Run → FAIL; implement; run → PASS; commit `feat: lead score and CAPI fields from a site form`.

### Task 2: Migration 093 + intake wiring

**Files:** Create `supabase/migrations/093_lead_quality_capi.sql`, `supabase/tests/093_lead_quality_capi_test.sql`; modify `amo-sync/src/intake.ts`.

**Produces (DB):** `crm_leads.lead_score int`, `crm_leads.qualified boolean`, `crm_leads.capi jsonb`; `crm_pipelines.lead_threshold int NOT NULL DEFAULT 4 CHECK (lead_threshold BETWEEN 0 AND 7)`; `meta_events_log (id bigserial, lead_id uuid FK cascade, event_name text CHECK in (Lead, QualifiedLead, Purchase), event_id text NOT NULL, event_time timestamptz NOT NULL DEFAULT now(), value numeric, status text DEFAULT 'pending' CHECK in (pending, sent, failed, skipped), attempts int DEFAULT 0, next_try_at timestamptz DEFAULT now(), response jsonb, created_at, sent_at, UNIQUE (lead_id, event_name))`, RLS on, SELECT for `is_admin(auth.uid())` only, no API writes. Triggers (SECURITY DEFINER, `ON CONFLICT DO NOTHING`, only when the bitim has `capi`):
- `crm_leads` after insert/update of `qualified, is_won`: qualified became true → `Lead` with `event_id = COALESCE(capi->>'event_id', id || '_Lead')`; is_won became true → `Purchase`, value = price.
- `crm_call_analyses` after update of status → `done`: normalised outcome contains yozildi / qayta qo'ng'iroq / o'ylab ko'radi and neither maqsadsiz nor rad etdi → `QualifiedLead` for `crm_calls.lead_id`.
- `payments` after insert, kind `payment`: participant → client's most recent bitim in a voronka whose `event_id` = participant's event → `Purchase`, value = participant price.

**Intake:** after `intake()` returns a `lead_id`, when `scoreLead` ≠ null: `UPDATE crm_leads l SET lead_score, qualified = score >= p.lead_threshold, capi = $capi FROM crm_pipelines p WHERE … RETURNING qualified`; answer `{ ok, duplicate, qualified }`. The five CAPI keys never become form answers.

- [ ] SQL test blocks: (1) scored qualified insert queues one `Lead` with the form event_id; (2) a second qualifying update queues nothing more; (3) unqualified → nothing; (4) a bitim without capi going won → nothing; with capi → `Purchase` value = price; (5) analysis "o'ylab ko'radi" → `QualifiedLead`, "rad etdi, qayta qo'ng'iroq" → nothing, "maqsadsiz lid" → nothing; (6) payment on the voronka's event → `Purchase` once (won later adds nothing); (7) seller can't read `meta_events_log`, admin can; (8) threshold default 4.
- [ ] Run on the stand without 093 → FAIL; write 093; run → PASS; break one trigger → red; commit `feat: lead quality columns, Meta event queue and triggers (093)`.
- [ ] Intake wiring + `bun test` + tsc; commit `feat: intake scores site forms and answers qualified`.

### Task 3: CAPI sender

**Files:** Create `amo-sync/src/capi.ts`, `amo-sync/src/capi.test.ts`; modify `amo-sync/src/index.ts`.

**Produces:**
```ts
export interface QueuedEvent { id: number; lead_id: string; event_name: "Lead" | "QualifiedLead" | "Purchase"; event_id: string; event_time: Date; value: number | null; attempts: number
  phone: string | null; name: string | null; capi: Capi; content_fallback: string | null }
export function buildPayload(e: QueuedEvent): Record<string, unknown>   // one data[] entry
export function retryAfterMin(attempts: number): number | null            // [1, 10, 60][attempts-1], else null
export function isStale(e: QueuedEvent, now: Date): boolean              // event_time older than 7 days
export function startCapi(sql: Sql): void                               // off (one log line) without META_CAPI_TOKEN
```
- [ ] Tests: ph = sha256("998901234567") from "+998 90 123 45 67"; fn = sha256 of trimmed lowercase name; external_id = sha256(lead_id); fbc/fbp/ip/ua omitted when missing; content_name from capi else fallback; Purchase has value + "UZS", others don't; retry 1/10/60 then null; stale after 7 days.
- [ ] Run → FAIL; implement (tick 30 s, busy flag, POST with 30 s timeout, `test_event_code` when set, response stored without the token); run → PASS; commit `feat: Meta Conversions API sender`.

### Task 4: Web

**Files:** modify `src/lib/supabase/queries/sotuv.ts` (Lead `lead_score`, `qualified`; Pipeline `lead_threshold`; `setPipelineThreshold`), `src/hooks/useSotuv.ts`, `src/components/pages/SotuvLead.tsx` (badge on both layouts), `src/components/sotuv/PipelineSettings.tsx` (admin number field "Sifatli lid chegarasi", 0–7).
- [ ] build + eslint clean; commit `feat: lead score badge and voronka threshold`.

### Task 5: Docs, review, ship

- [ ] CLAUDE.md (env vars, a §7 paragraph, migration range), `amo-sync/.env.example` names if the file exists; final review subagent; PR; backup → apply 093 → restart PostgREST → merge → redeploy amo-sync; confirm a live answer carries `qualified` with one real-shaped request? No — no test bitim without the owner's yes; confirm from the next real application in `webhook_logs` + `crm_leads`.
