# Connector Stage 2 — Events and Design Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude can create, edit and (after confirmation) delete events, copy an event's task list, enrol participants, link a voronka, and export name stickers and venue signs as PDF — all with the signed-in staff member's rights.

**Architecture:** The existing connector (`amo-sync/src/mcp/`) gains a write mode: a tool that declares itself a writer runs in one read-write transaction as the user; every other tool stays read-only. Event tools are fixed SQL over the same tables and RPCs the web uses. Stickers and signs are drawn by copies of the web's jsPDF drawing modules, kept identical by a test, and handed out as short-lived download links.

**Tech Stack:** Bun + TypeScript, postgres.js, `@modelcontextprotocol/server` 2.x, zod, jsPDF 4.

**Spec:** `docs/superpowers/specs/2026-11-11-mcp-events-exports-design.md` (stage 2) on top of `docs/superpowers/specs/2026-11-10-crm-mcp-design.md` (the connector). Project guide: `CLAUDE.md` → "Claude connector (MCP, migration `092`…)".

## Global Constraints

- No migration in this plan; never edit an existing one.
- **bun**, strict TypeScript, no `any`, `import type` for types; the worker's terse style (no semicolons, one-line doc comments). Surgical edits to existing files.
- **Tools run only fixed SQL with bound parameters through the transaction handle `tx`** — never SQL built from arguments, never `tx.unsafe`, never an argument as an identifier.
- **A writer's whole work is one transaction**; it either all happens or nothing does. Every tool that is not a declared writer keeps running `READ ONLY`.
- Gates: every tool in this plan needs the `tadbirlar` module (admins always); `link_pipeline` is admins only. Texts, exact: `«Tadbirlar» bo'limiga ruxsatingiz yo'q` and `Bu amalni faqat admin bajara oladi`. A refusal is always an explicit error, never an empty result.
- Tool names, exact: `events`, `event`, `find_clients`, `create_event`, `update_event`, `delete_event`, `copy_event_tasks`, `enroll_participant`, `link_pipeline`, `export_stickers`, `export_signs`.
- Create/update rules (the web form's, which the DB does not enforce): `name` non-empty; `date` required; `manager_id` an active staff member (`is_active IS DISTINCT FROM false`); at least one tariff, each with a non-empty `name` and `price >= 0`; `cashback_percent` 0–100 (default 5); `total_value >= 0` (default 0); `end_date >= date` when given. Dates are `YYYY-MM-DD`.
- Duplicate guard on create: same `lower(btrim(name))` and same start date → refused unless `allow_duplicate: true`.
- Delete: two calls. The confirmation token is an HMAC-SHA256 with `JWT_SECRET` over kind, user id, event id and expiry; valid **600 s**; bound to this user and this event. `JWT_SECRET` unset → the tool refuses to delete.
- Exports: PDF made when the tool runs, kept **in memory** for **900 s**, at most **50** files (oldest evicted), served at `GET /mcp/files/<id>` (id = 32 random bytes base64url) as `application/pdf`, `Content-Disposition: attachment`, `Cache-Control: no-store`. Limits: 600 sticker names, 100 signs. File names as the web's: `<fileSafe(event or caption)>_stikerlar.pdf`, `<fileSafe(...)>_navigatsiya.pdf`.
- Style ids, exact: stickers `onyx`, `sandstone`, `graphite`, `linen`, `ivory`; signs `signal`, `ember`; directions `left`, `up`, `right`, `up-left`, `up-right`, `down`, `down-left`, `down-right`, `both`.
- Every response under `/mcp*` carries `Cache-Control: no-store`.
- Implementers do not commit; the controller commits each task locally (owner's standing permission for this work). Push, PR and production need the owner's go-ahead.
- DB-backed tests (`*.db.test.ts`) run against the throwaway stand of `CLAUDE.md` §5 through `TEST_DATABASE_URL`, skip when it is unset, use fresh random ids, clean up in `afterAll`, and never `end()` the shared `testSql`. Every `expect(promise).rejects…` is awaited.

## Review Focus

1. **A retried `create_event`** (Claude or the network repeats the call) → the second is refused by the duplicate guard, one event exists (Task 3).
2. **A writer failing half-way** (a bad tariff, an FK error) → nothing of it persists; the read tools still cannot write (Tasks 1, 3).
3. **A delete token used by another user, for another event, after 600 s, or altered** → refused, the event stays (Task 4).
4. **Someone without `tadbirlar` calling a writer by name** → the module error, nothing written, the refusal audited (Tasks 1, 2).
5. **A download link guessed, expired, or asked after a restart** → 404; never another person's file (Task 6).

---

### Task 1: Write mode

**Files:**
- Modify: `amo-sync/src/mcp/db.ts`, `amo-sync/src/mcp/tools.ts`, `amo-sync/src/mcp/server.ts`
- Test: `amo-sync/src/mcp/db.db.test.ts`, `amo-sync/src/mcp/tools.db.test.ts`

**Interfaces:**
- Produces:

```ts
// db.ts
export type AsUser = (<T>(uid: string, fn: (tx: UserSql) => Promise<T>, opts?: { write?: boolean }) => Promise<T>) & { end: () => Promise<void> }
// tools.ts — ToolDef gains three optional flags; Module gains "tadbirlar"
export interface ToolDef { /* …existing… */ write?: true; destructive?: true; adminOnly?: true }
```

  `callTool` finds the tool by name first, then opens `asUser(uid, fn, { write: !!t.write })`; inside it gates in this order: module (existing text pattern, label `Tadbirlar`), then `adminOnly` → `Bu amalni faqat admin bajara oladi`. `toolsFor(me)` hides `adminOnly` tools from non-admins. `server.ts` registers each tool with `annotations: { readOnlyHint: !t.write, destructiveHint: !!t.destructive }`; its existing interception (a tool that exists but is not in the caller's list) is unchanged and now also covers admin-only tools.

- [ ] **Step 1: Failing tests.** `db.db.test.ts`: (a) `asUser(admin, tx => insert into events (name) values (…) returning id, { write: true })` returns an id and the row is visible afterwards through `testSql`; (b) the same without `{ write: true }` rejects with `/read-only/`; (c) a writer callback that inserts and then throws leaves no row. `tools.db.test.ts`: (d) `tools/list` through `handleMcp` gives every existing tool `readOnlyHint: true` and no `destructiveHint: true`; (e) with a temporary writer entry pushed onto `TOOLS` inside the test (removed in `finally`) — module `tadbirlar`, `write: true` — a seller without `tadbirlar` gets `«Tadbirlar» bo'limiga ruxsatingiz yo'q` from `callTool` and the entry's `run` was not reached; an admin reaches it; (f) a temporary `adminOnly` entry: a non-admin with every module gets `Bu amalni faqat admin bajara oladi` and does not see it in `toolsFor`.
- [ ] **Step 2: Run** `cd amo-sync && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres MCP_PUBLIC_URL=https://x.test bun test src/mcp` — Expected: the new tests fail (type errors / wrong behaviour), the old ones pass.
- [ ] **Step 3: Implement** the three changes. `sql.begin` without the `"read only"` option for writers; everything else in `asUser` identical.
- [ ] **Step 4: Run** the same command — all pass; `bun test` without the DB — pass; strict tsc on `src/mcp/*.ts src/intake.ts` — 0 errors.
- [ ] **Step 5: Commit** (controller) — `feat: connector tools can write, one transaction as the user`

---

### Task 2: Reading events — `events`, `event`, `find_clients`

**Files:**
- Create: `amo-sync/src/mcp/events.ts` (all event tools of this plan live here; `tools.ts` imports its array and appends it to `TOOLS`)
- Test: `amo-sync/src/mcp/events.db.test.ts`
- Read first: migrations for `events` (009, 017, 027, 042), `event_tariffs` (052), `event_participants`, `tasks` (066), `crm_pipelines.event_id` (081); `src/lib/supabase/queries/events.ts` for the column names the web selects.

**Interfaces:**
- Consumes: `tool()` helper, `Me`, `UserSql` from `tools.ts` / `db.ts` (export `tool`, `date`, `uuid`, `limit`, `offset` from `tools.ts` if they are not exported yet).
- Produces: `export const EVENT_TOOLS: ToolDef[]`; `export async function eventDetail(tx: UserSql, id: string): Promise<EventDetail | null>` — used by later tasks to return the event after a write.

| name | input | returns |
|---|---|---|
| `events` | `limit` (max 200, default 50), `offset` | rows newest start date first: `id, name, date, end_date, location, manager_id, manager, participants` |
| `event` | `event_id` | `id, name, date, end_date, location, manager_id, manager, cashback_percent, total_value, tariffs:[{id,name,price,sort_order}], participants:[{id, client_id, full_name, phone, company, role, tariff, seller}] (max 500, in the list's order), task_count, pipeline:{id,name}|null`; unknown id → error `Tadbir topilmadi` |
| `find_clients` | `query` (2–100 chars), `limit` (max 50, default 20) | `id, full_name, phone, company` where the query is contained in the name (case-insensitive) or its digits in the phone; no wildcard meaning for `%`/`_` |

  All three: module `tadbirlar`, read-only. No money columns (`price`/`paid`/`debt` of participants) anywhere in these answers.

- [ ] **Step 1: Failing tests** (fixtures: admin; a staff member with `["tadbirlar"]`; a seller with `["dashboard","sotuv-crmn"]`; one event with two tariffs, a manager, two participants built through `enroll_participant` or owner inserts, one task; one voronka linked): the seller gets the Tadbirlar error from each tool; the `tadbirlar` user gets the event in `events` with `participants: 2`; `event` returns both tariffs with ids, two participants with `tariff` and `seller` names, `task_count: 1`, the pipeline; no key named `paid`, `debt` or `price` inside `participants`; unknown id → `Tadbir topilmadi`; `find_clients` finds by a name fragment in another case and by phone digits, treats `%` literally (query `%` finds nothing), refuses a 1-character query.
- [ ] **Step 2: Run** — fails (module not found).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — all pass; whole suite without the DB; tsc.
- [ ] **Step 5: Commit** — `feat: connector reads events, their people and tariffs`

---

### Task 3: `create_event` and `update_event`

**Files:**
- Modify: `amo-sync/src/mcp/events.ts`
- Test: `amo-sync/src/mcp/events.db.test.ts`
- Read first: `src/components/events/CreateEventDrawer.tsx` (validation, lines ~233–249), `src/lib/supabase/queries/events.ts` (`createEvent`, `updateEvent`), `src/lib/supabase/queries/tariffs.ts` (`saveEventTariffs`), migration 024 (`activity_log`, `log_events_activity`), `copy_event_tasks` (071).

**Interfaces:**
- Consumes: write mode (Task 1), `eventDetail` (Task 2).
- Produces two writer tools:

| name | input | behaviour |
|---|---|---|
| `create_event` | `name`, `date`, `manager_id`, `tariffs: [{name, price}]` (1–20), `end_date?`, `location?`, `cashback_percent?` (default 5), `total_value?` (default 0), `copy_tasks_from?` (event id), `allow_duplicate?` | validates per Global Constraints; duplicate guard; inserts the event and its tariffs (`sort_order` = position); when `copy_tasks_from` is given calls `public.copy_event_tasks(from, new)`; returns `eventDetail` plus `tasks_copied` |
| `update_event` | `event_id` + any of `name, date, end_date, location, manager_id, cashback_percent, total_value`, and optional `tariffs: [{id?, name, price}]` (1–20) | updates only the given fields (+ `updated_at = now()`); `end_date: null` and `location: null` clear them; date order is checked against the stored value when only one side is given; `tariffs`, when given, is the full list — with `id` = keep and update, without = insert, missing = delete; an `id` not of this event → error; returns `eventDetail` |

  Error texts (Uzbek, exact): `Mas'ul topilmadi yoki nofaol`; `Tugash sanasi boshlanish sanasidan oldin bo'lmasin`; `Shu nom va sana bilan tadbir allaqachon bor (<id>). Baribir yaratish uchun allow_duplicate: true bilan chaqiring`; `O'chirilayotgan tarifda ishtirokchilar bor — avval ularni boshqa tarifga o'tkazing`; `Tarif bu tadbirga tegishli emas`; `Tadbir topilmadi`; `Nusxa olinadigan tadbir topilmadi`.

  Descriptions (English) must say: *"Changes real data. Before calling, make sure the user has given the name, the start date, the responsible person and at least one tariff with its price — ask for anything missing; never invent a date, a person or a price. Read the result back to the user."*

- [ ] **Step 1: Failing tests:** happy create (event + two tariffs in order; the returned detail matches the DB); the `activity_log` row for the insert carries the calling user as actor (find the columns in migration 024); a missing `tariffs` / empty `name` / bad date → validation error naming the field, and the events count is unchanged; `end_date` before `date`; `cashback_percent: 101`; an inactive manager and a random uuid as manager; **one transaction:** a second tariff with `price: -1` leaves no event row; duplicate refused (text contains the existing id), then created with `allow_duplicate: true`; `copy_tasks_from` copies the fixture's tasks (`tasks_copied` equals the count) and an unknown source rolls the whole create back; update: change name and manager; clear `location` with `null`; `end_date` earlier than the stored `date` refused; tariffs list — rename one, add one, drop one unused → as specified; dropping a tariff a participant uses → the exact error and **nothing** changed (name change in the same call not applied); a tariff id of another event → error; a seller without `tadbirlar` → module error and nothing written; calling `create_event` through `handleMcp` writes an `mcp_calls` row with the arguments.
- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement.** The FK violation on a tariff delete is Postgres error code `23503`: catch it inside the tool and throw the tool's own error (the transaction is aborted — the thrown error must roll everything back; do not continue using `tx` after it).
- [ ] **Step 4: Run** — all pass; whole suite; tsc.
- [ ] **Step 5: Commit** — `feat: connector creates and edits events`

---

### Task 4: `delete_event` — two steps

**Files:**
- Create: `amo-sync/src/mcp/confirm.ts`
- Modify: `amo-sync/src/mcp/events.ts`
- Test: `amo-sync/src/mcp/confirm.test.ts`, `amo-sync/src/mcp/events.db.test.ts`
- Read first: `amo-sync/src/pbx.ts` (`sign`, `audioLink`, `audioAllowed` — the house pattern for an HMAC with `JWT_SECRET`), migration 053 (`guard_participant_has_payments`), the FK list in the spec §5.

**Interfaces:**
- Produces:

```ts
// confirm.ts — a short-lived proof that the same user asked twice about the same thing
export async function confirmToken(kind: string, uid: string, subject: string, now?: number): Promise<string>   // "<exp>.<sig>", exp = now + 600 s; throws when JWT_SECRET is unset
export async function confirmOk(token: string, kind: string, uid: string, subject: string, now?: number): Promise<boolean>
```

  Tool `delete_event` — `write: true, destructive: true`, input `{ event_id, confirm_token? }`:
  - **Without a token:** deletes nothing. Returns `{ event: {id, name, date}, will_delete: {participants, tariffs, tasks}, will_detach: {expenses, pipelines}, blocked_by_payments: <participants with a live payment> }`. When `blocked_by_payments` is 0 it adds `confirm_token`, `expires_in: 600` and `next: "Show this summary to the user and ask for an explicit yes. Only then call delete_event again with confirm_token."`; otherwise `next` says the event cannot be deleted while payments exist and that they are handled in Moliya.
  - **With a token:** `confirmOk(token, "delete_event", me.id, event_id)` else error `Tasdiqlash kodi yaroqsiz yoki muddati o'tgan — avval tasdiq so'rang`; then deletes; a `participant_has_payments` error from the DB becomes `Tadbirda to'lovi bor ishtirokchilar bor — avval Moliyada to'lovlarni qaytaring yoki bekor qiling`. Returns `{ deleted: true, name }`.
  - `JWT_SECRET` unset → `O'chirish hozircha sozlanmagan` on both paths.

  Description must say: *"Deleting is permanent and removes the event's participants, tariffs and tasks. First call without confirm_token, show the returned summary to the user, and call again with the token only after they explicitly agree to delete this event."*

- [ ] **Step 1: Failing tests.** `confirm.test.ts` (set `process.env.JWT_SECRET` in the test, restore after): a token verifies for the same kind/user/subject; fails for another user, another subject, another kind, at `now + 601 s`, with one character changed, for `""` and `"x.y"`; with `JWT_SECRET` unset `confirmToken` rejects and `confirmOk` is false. `events.db.test.ts`: preview returns the right counts and a token, and the event still exists; a second preview-only call still deletes nothing; token from user A used by admin B → the invalid-token error, event still exists; token for event 1 used on event 2 → refused; valid token → event, its tariffs, participants and tasks are gone, an expense that pointed at it now has `event_id` NULL; an event with a participant who has a live payment (owner-inserted payment as in `db.db.test.ts`) → preview has `blocked_by_payments: 1` and no token; forcing the delete path with a hand-made valid token → the payments error and the event still exists; unknown event → `Tadbir topilmadi`.
- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — all pass; whole suite; tsc.
- [ ] **Step 5: Commit** — `feat: connector deletes an event only after a confirmed second call`

---

### Task 5: `copy_event_tasks`, `enroll_participant`, `link_pipeline`

**Files:**
- Modify: `amo-sync/src/mcp/events.ts`
- Test: `amo-sync/src/mcp/events.db.test.ts`
- Read first: `copy_event_tasks` (migration 071), `enroll_participant` (latest definition, 065) and `ENROLL_ERRORS` in `src/lib/supabase/queries/events.ts` (~line 362) for the Uzbek texts, the `crm_pipelines` policies (072).

**Interfaces — three writer tools:**

| name | input | behaviour |
|---|---|---|
| `copy_event_tasks` | `from_event_id`, `to_event_id`, `add_anyway?` | same id twice → `Bir xil tadbir tanlandi`; either unknown → `Tadbir topilmadi`; target already has tasks and no `add_anyway` → `Bu tadbirda allaqachon <n> ta vazifa bor. Baribir qo'shish uchun add_anyway: true bilan chaqiring`; else `select public.copy_event_tasks(from, to)` → `{ copied }` |
| `enroll_participant` | `event_id`, `tariff_id?`, `seller_id?`, `client_id?`, `full_name?`, `phone?`, `price?` | exactly one of `client_id` or (`full_name` + `phone`); calls the RPC; returns `{ participant_id, full_name, tariff, seller }`. RPC errors come back as the web's Uzbek texts (same wording as `ENROLL_ERRORS`); `client_exists:<id>:<name>` becomes `Bu telefon raqami bilan mijoz bor: <name>. Shu mijozni yozish uchun client_id: <id> bilan qayta chaqiring` |
| `link_pipeline` | `pipeline_id`, `event_id` (uuid or `null`) | `adminOnly: true`; sets or clears `crm_pipelines.event_id`; unknown pipeline → `Voronka topilmadi`; unknown event → `Tadbir topilmadi`; returns `{ pipeline: {id, name}, event: {id, name} | null }` |

  `enroll_participant`'s description must say it creates a debt for the tariff's price and takes no payment, and that the seller comes from `reference.sellers` (omit for "Belgilanmagan").

- [ ] **Step 1: Failing tests:** copy — happy (count), same id, unknown, target with tasks refused then `add_anyway`; enrol — an existing client by id (participant row has the tariff's price copied, checked through `testSql`), a new client by name + phone (a client row appears), the same phone again → the `client_exists` text containing the client's id and name and **no** second client, already enrolled → the web's text, a tariff of another event → the web's text, a seller who is not in Sotuv → the web's text, both `client_id` and `full_name` given → validation error, a user without `tadbirlar` → module error; link — admin sets and clears, a non-admin with `tadbirlar` → `Bu amalni faqat admin bajara oladi` and nothing changed, unknown ids.
- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — all pass; whole suite; tsc.
- [ ] **Step 5: Commit** — `feat: connector copies event tasks, enrols participants, links a voronka`

---

### Task 6: Stickers and signs as download links

**Files:**
- Modify: `amo-sync/package.json` + `bun.lock` (`bun add jspdf@^4.2.0`), `amo-sync/src/mcp/index.ts` (route), `amo-sync/src/mcp/events.ts` (two tools)
- Create: `amo-sync/src/pdf/` — worker copies of the web's drawing modules (`src/lib/stickers/*`, `src/lib/signs/*`: the draw functions and the style tables), `amo-sync/src/pdf/render.ts`, `amo-sync/src/mcp/files.ts`
- Test: `amo-sync/src/pdf/render.test.ts`, `amo-sync/src/pdf/sync.test.ts`, `amo-sync/src/mcp/files.test.ts`, `amo-sync/src/mcp/events.db.test.ts`
- Read first: `src/lib/stickers/` and `src/lib/signs/` in full, `src/lib/pdfFonts.ts`, `src/components/events/StickerExportModal.tsx` and `SignExportModal.tsx` (how names, caption and file name are built), `amo-sync/src/receipt.ts` (loading fonts from `amo-sync/fonts`).

**Interfaces:**
- Produces:

```ts
// pdf/render.ts
export function fileSafe(s: string): string                                    // the web's: s.replace(/[^\p{L}\p{N}]+/gu, "_")
export async function stickersPdf(names: string[], caption: string, style: string): Promise<{ bytes: Uint8Array; pages: number }>
export async function signsPdf(signs: { place: string; direction: string }[], style: string): Promise<{ bytes: Uint8Array; pages: number }>
// mcp/files.ts — PDFs waiting to be downloaded, in memory
export function putFile(name: string, bytes: Uint8Array, now?: number): string   // the id for /mcp/files/<id>
export function getFile(id: string, now?: number): { name: string; bytes: Uint8Array } | null
```

  The copies under `amo-sync/src/pdf/` must be the web files with only their import lines changed (no `@/` alias, no `?url` font import). Fonts: DM Sans 500 as `normal` and 600 as `bold` of family `DMSans`, read from `amo-sync/fonts/` and added to the jsPDF VFS exactly as `src/lib/pdfFonts.ts` does. Output through `doc.output("arraybuffer")`.

  Route (in `handleConnector`, connector on): `GET /mcp/files/<id>` → 200 `application/pdf`, `Content-Disposition: attachment; filename="<name>"` (plus an RFC 5987 `filename*` when the name is not ASCII), `Cache-Control: no-store`; unknown or expired id → the existing 404.

  Tools (module `tadbirlar`, read-only — they write nothing to the database):

| name | input | behaviour |
|---|---|---|
| `export_stickers` | `style`, `event_id?`, `names?: string[]`, `caption?` | names = the event's participants (`full_name`, list order) when `event_id` is given, followed by `names`; none → `Stiker uchun ism yo'q`; more than 600 → refused; caption defaults to the event's name, required when there is no event; returns `{ url, file, pages, count, expires_in: 900 }` |
| `export_signs` | `style`, `signs: [{place, direction}]` (1–100), `event_id?` | file name from the event's name when given, else `navigatsiya`; returns the same shape |

  `url` = `<MCP_PUBLIC_URL>/mcp/files/<id>`. Descriptions list the style and direction ids, say the link expires in 15 minutes, and that the booklet is exported in the platform (Tadbirlar → Dizayn materiallar).

- [ ] **Step 1: Failing tests.** `render.test.ts`: 15 names → bytes start with `%PDF-`, `pages: 2` (14 per sheet); 1 name → 1 page; each of the five sticker styles renders; 3 signs → 2 pages (2 per sheet); both sign styles and all nine directions render; an unknown style or direction rejects; `fileSafe("Kaizen 8.0 — Toshkent")` → `Kaizen_8_0_Toshkent`. `sync.test.ts`: for each copied file, the worker copy and the web original are identical after removing `import` lines (skip the test when the web file is absent). `files.test.ts`: put → get returns the same bytes and name; at `now + 901 s` → null; the 51st put evicts the oldest; ids are 43 url-safe characters and differ; an unknown id → null. `events.db.test.ts`: `export_stickers` for the fixture event returns `count` = participants + extra names and a `url` under `/mcp/files/`; fetching that path through `handleConnector` gives `application/pdf`, an `attachment` disposition with `_stikerlar.pdf`, `no-store`, and a body starting with `%PDF-`; a made-up id → 404; a user without `tadbirlar` → module error; no names → the error; `export_signs` returns `pages: 2` for 3 signs.
- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement.** If jsPDF does not run under Bun as it does in the browser (a missing global, the font VFS, `advancedAPI`), report it with the exact error instead of rewriting the drawing code.
- [ ] **Step 4: Run** — all pass; whole suite without the DB; tsc; `bun build src/index.ts --target bun --outdir /tmp/amo-build`; the new dependency sits in `dependencies`.
- [ ] **Step 5:** Write two sample files for the controller's by-eye check: `/tmp/fy-stickers-onyx.pdf` (15 names, caption "Kaizen 8.0") and `/tmp/fy-signs-signal.pdf` (three signs with different arrows).
- [ ] **Step 6: Commit** — `feat: connector exports name stickers and venue signs as download links`

---

### Task 7: What Claude is told, the guide, rollout

**Files:**
- Modify: `amo-sync/src/mcp/server.ts` (`INSTRUCTIONS`), `amo-sync/src/mcp/tools.db.test.ts` (the instructions/tool-list assertions), `CLAUDE.md` (the connector note: the new tools, write mode, the delete token, the file links, the `pdf/` copies and their sync test)

- [ ] **Step 1:** Append to `INSTRUCTIONS`, exactly:

```
The event tools (create_event, update_event, delete_event, copy_event_tasks, enroll_participant, link_pipeline) change real data. Before creating an event, ask the user for anything required that they have not given — name, start date, responsible person, tariffs with prices — and never invent it. Delete an event only after the user has explicitly agreed to delete that event: call delete_event once to get the summary, show it, and call again with the confirmation token. export_stickers and export_signs return download links that expire in 15 minutes; the booklet is exported in the platform (Tadbirlar → Dizayn materiallar).
```

- [ ] **Step 2:** Update the tests that pin the tool lists (an admin now sees 20 tools; a `tadbirlar`-only user sees the two open tools plus the ten event tools without `link_pipeline`; a seller's six are unchanged) and run everything: with the DB, without it, tsc, build.
- [ ] **Step 3:** `CLAUDE.md` — extend the connector note.
- [ ] **Step 4: Commit** — `docs: connector stage 2 — events and design materials`
- [ ] **Step 5 (controller, with the owner's go-ahead):** by-eye comparison of the two sample PDFs with the platform's own exports; whole-branch review; PR, merge, redeploy the worker (no migration, no gateway change); from Claude: create a test event, edit it, copy tasks, export stickers, delete it.
