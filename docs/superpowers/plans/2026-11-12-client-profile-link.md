# Client anketa link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client fills in their own card (photo, name, company, position, field) through a personal or universal link; staff approve; an approved person becomes a Mijoz.

**Architecture:** One migration (`097`) holds everything server-side: two tables, `clients.profile_confirmed_at`, `is_customer` redefined, two anon SECURITY DEFINER functions for the public page and four staff functions. The public page `/anketa/:token` is a React route outside `ProtectedRoute` calling the anon functions with the anon key; the photo goes to the public `client-images` bucket under `anketa/<token>/`. Staff UI: a link button (copy / SMS) on the bitim page and the Mijozlar card, an "Anketalar" review view in Mijozlar, a universal-link row with QR in Integratsiyalar.

**Tech Stack:** Postgres (Supabase, PostgREST), React 19 + TanStack Query, Tailwind/Plexus tokens, `qrcode` (new, the only new dependency).

**Spec:** `docs/superpowers/specs/2026-11-12-client-profile-link-design.md`

**Deviation from the spec (simpler, same behaviour):** the spec routes the submit through amo-sync only to read the visitor IP. PostgREST already hands every request header to SQL (`current_setting('request.headers', true)::json->>'cf-connecting-ip'`), so `anketa_submit` stays a plain anon RPC and amo-sync is untouched. Task 7 checks on prod that the header arrives; if it doesn't, the per-IP limit degrades to the 1000/hour total and that is reported.

## Global Constraints

- Fields: rasm, ism-familiya (`full_name`), kompaniya (`company`), lavozim (`role`), soha/faoliyat (`activity`); telefon only on the universal link. Nothing else.
- Personal link lives 30 days; universal link has no expiry; approval closes a personal link.
- Validation: name required, 2–100 chars after trim; company / role / activity ≤ 150 chars; universal phone must normalise via `clean_client_phone()` to `+998` + 9 digits; `photo_path` must start with `anketa/<token>/`.
- Limits: personal link 20 submissions / hour; universal link 10 / hour per IP and 1000 / hour in total; over the limit → error code `anketa_rate_limited`.
- Invalid / expired / closed / unknown token → one error code `anketa_invalid` (no hint which).
- One `pending` per personal link, one `pending` per phone on the universal link — a new submit replaces it.
- Approval re-matches a universal submission by phone at approval time; no match → new client with `source = 'anketa'`; approving one pending submission of a client rejects the client's other pending one.
- Rights: link get/copy = `mijozlar` OR `sotuv-crmn`; review / approve / reject = `mijozlar`; regenerate universal = admin; SMS item follows existing SMS rights (`sms`, or `sotuv-crmn` for one client), not widened.
- UI copy Uzbek; public page styled like `Login.tsx`; Plexus utilities only, pills for buttons, no shadows, weight ≤ 600, phosphor icons per CLAUDE.md §6.
- Strict TS, no `any`, bun. Never edit an existing migration. SQL tests only on the throwaway DB (CLAUDE.md §5). Back up prod before applying.

## Review Focus

1. A phone typed as `90 123 45 67`, `+998 (90) 123-45-67` or `998901234567` on the universal link must find the same existing client — Task 1 `TEST 4`.
2. A client presses "Yuborish" twice (or fixes a typo and resends) — one pending row, latest values — Task 1 `TEST 3`.
3. Between submit and approval someone created a client with that phone — approval attaches to them, no duplicate, no unique-phone error — Task 1 `TEST 6`.
4. Someone with only the anon key tries to read the tables, approve, or open another client's data — denied / nothing returned — Task 1 `TEST 8`.
5. Long or odd input (300-char name, emoji, a `photo_path` of another token) — refused with a clear code, never stored — Task 1 `TEST 2`.

---

### Task 1: Migration 097 — tables, functions, rights

**Files:**
- Create: `supabase/migrations/097_client_anketa.sql`
- Test: `supabase/tests/097_client_anketa_test.sql`

**Interfaces:**
- Produces (functions all `SECURITY DEFINER SET search_path = public, pg_temp`):
  - table `client_profile_links(id uuid pk, token text unique not null, client_id uuid null references clients on delete cascade, created_by uuid null references profiles on delete set null, created_at, expires_at timestamptz null, closed_at timestamptz null)`; unique partial index: one open (`closed_at is null`) row per `client_id`, and one open row where `client_id is null`.
  - table `client_profile_submissions(id uuid pk, link_id uuid references client_profile_links on delete cascade, client_id uuid null references clients on delete cascade, phone text null, full_name text not null, company text, role text, activity text, photo_path text, ip text, status text check in ('pending','approved','rejected') default 'pending', reviewed_by uuid null references profiles on delete set null, reviewed_at, created_at)`.
  - table `client_profile_submit_log(link_id uuid, ip text, at timestamptz default now())` — every accepted submit, for the rate limit (RLS on, no policies).
  - `clients.profile_confirmed_at timestamptz`; `is_customer(clients)` = 077's body `OR c.profile_confirmed_at IS NOT NULL`.
  - `client_profile_link(p_client uuid) returns text` — token of the open, unexpired personal link, else a new one (expires now()+30 days). Needs `mijozlar` or `sotuv-crmn`, else `insufficient_privilege`.
  - `universal_profile_link(p_regenerate boolean default false) returns text` — the open universal token (created if none); `p_regenerate` closes it and makes a new one, admin only.
  - `anketa_open(p_token text) returns jsonb` — `{kind:'personal'|'universal', full_name, company, role, activity, image, photo_path, phone_masked}`; personal: the pending submission's values if one exists, else the card's; `photo_path` = the pending photo's path (the page resolves it with `getPublicUrl`), `image` = `clients.image`; `phone_masked` like `+998 90 *** 45 67`; universal: all empty. Raises `anketa_invalid`.
  - `anketa_submit(p_token text, p_data jsonb) returns void` — keys `full_name, company, role, activity, phone, photo_path`; validates per Global Constraints (error codes `anketa_invalid`, `anketa_name`, `anketa_too_long`, `anketa_phone`, `anketa_photo`, `anketa_rate_limited`); IP from `current_setting('request.headers', true)::json->>'cf-connecting-ip'`; universal: `client_id` = current phone match (hint), replaces that phone's pending row; personal: replaces the link's pending row.
  - `approve_profile_submission(p_id uuid, p_overrides jsonb default '{}') returns uuid` (the client id) — `mijozlar` only; overrides may set `full_name, company, role, activity` (same validation); writes non-empty values over the card; `image` comes from `p_overrides.image` (the web passes `supabase.storage.from('client-images').getPublicUrl(photo_path)` — SQL doesn't know the public origin) and is accepted only when the submission has a `photo_path` and the URL ends with `/storage/v1/object/public/client-images/` || `photo_path`, else `anketa_photo`; sets `profile_confirmed_at = now()`, closes a personal link, rejects the client's other pending submission. Universal: match by `clean_client_phone(phone)` now; none → insert client (`full_name`, `phone`, `source='anketa'`). Already reviewed → `anketa_reviewed`.
  - `reject_profile_submission(p_id uuid) returns void` — `mijozlar` only.
  - RLS on both tables; SELECT policy `has_permission(auth.uid(),'mijozlar')` on submissions and links; links also readable with `sotuv-crmn`; no write policies. `GRANT EXECUTE` on `anketa_open`, `anketa_submit` TO `anon, authenticated`; staff functions TO `authenticated` only. `ALTER PUBLICATION supabase_realtime ADD TABLE public.client_profile_submissions`.

- [ ] **Step 1: Write the failing test** `supabase/tests/097_client_anketa_test.sql` in the style of `095_sms_templates_schedule_test.sql` (fixtures as owner, `SET ROLE`, `request.jwt.claim.sub`, each block RAISEs `TEST n FAILED`):
  - `TEST 1` personal link: a `sotuv-crmn` user gets a token for client A (`+998901970001`, name `Ali`); calling again returns the same token; `anketa_open` as anon returns `kind='personal'`, `full_name='Ali'`, `phone_masked='+998 90 *** 00 01'`.
  - `TEST 2` validation as anon: name `' a '` → `anketa_name`; 300-char name → `anketa_name`; company 151 chars → `anketa_too_long`; `photo_path='anketa/OTHER/x.jpg'` → `anketa_photo`; nothing stored.
  - `TEST 3` submit twice on A's link (`Ali Valiyev`, then `Ali Valiyevich`) → exactly 1 pending row with `Ali Valiyevich`; `anketa_open` now returns `Ali Valiyevich`.
  - `TEST 4` universal: submit with phone `90 197 00 01` → pending row `client_id = A`; again with `998901970001` → still 1 pending row for that phone; bad phone `12345` → `anketa_phone`.
  - `TEST 5` approve A's personal submission (submitted with `photo_path='anketa/<A token>/p.jpg'`) with overrides `{"role":"Direktor","image":"https://x/storage/v1/object/public/client-images/anketa/<A token>/p.jpg"}`; a second attempt beforehand with `image` pointing at another path → `anketa_photo` as a `mijozlar` user → card `full_name='Ali Valiyevich'`, `role='Direktor'`, `image` = that URL, `profile_confirmed_at` set, `is_customer(A)` true (A's `source='sayt'` lead source fixture → was false before), link closed, the universal pending for A auto-`rejected`, `anketa_open(A's token)` → `anketa_invalid`; approving again → `anketa_reviewed`.
  - `TEST 6` universal submit for `+998901970002` (no client) → `client_id` NULL; then insert client B with that phone; approve → attaches to B (no new client, `count(*)` of that phone = 1).
  - `TEST 7` universal submit for `+998901970003`, approve → new client, `source='anketa'`, `is_customer` true.
  - `TEST 8` anon: `SELECT` from both tables returns 0 rows / errors; `approve_profile_submission` → `insufficient_privilege` (or permission denied); a `sotuv-crmn`-only user → `insufficient_privilege` on approve; non-admin `universal_profile_link(true)` → `insufficient_privilege`.
  - `TEST 9` expired link (`expires_at` set to the past as owner) → `anketa_open` `anketa_invalid`; rate limit: 20 submits on one personal link pass, the 21st → `anketa_rate_limited`.

- [ ] **Step 2: Run on the throwaway DB, expect FAIL** (CLAUDE.md §5 stand; migrations replayed up to 096). Expected: `function client_profile_link(uuid) does not exist`.
- [ ] **Step 3: Write `097_client_anketa.sql`** per the Interfaces block. Token: `translate(encode(gen_random_bytes(18),'base64'),'+/','-_')` (24 chars). Rate limit = `count(*)` over `client_profile_submit_log` of the last hour (a replaced pending row is deleted, so the submissions table can't count).
- [ ] **Step 4: Run the test, expect PASS** (`ON_ERROR_STOP=1`, exit 0, all `TEST n ok` notices). Then prove it bites: drop the `OR profile_confirmed_at` from `is_customer` → `TEST 5` fails; restore.
- [ ] **Step 5: Commit** `feat: client anketa links and approval (097)`.

### Task 2: Web data layer

**Files:**
- Create: `src/lib/anketa.ts`, `src/lib/anketa.test.ts`, `src/lib/supabase/queries/anketa.ts`, `src/hooks/useAnketa.ts`

**Interfaces:**
- Consumes: Task 1 functions and tables.
- Produces:
  - `anketaUrl(token: string): string` → `${location.origin}/anketa/${token}`.
  - `type AnketaFields = { full_name: string; company: string; role: string; activity: string }`.
  - `fieldChanges(card: AnketaFields, sent: AnketaFields): (keyof AnketaFields)[]` — keys whose trimmed values differ and the sent one is non-empty.
  - `anketaError(code: string): string` — Uzbek text per error code (`anketa_invalid` "Havola eskirgan yoki noto'g'ri", `anketa_rate_limited` "Keyinroq urinib ko'ring", `anketa_name`, `anketa_too_long`, `anketa_phone`, `anketa_photo`, `anketa_reviewed`).
  - queries: `getClientAnketaLink(clientId)`, `getUniversalAnketaLink(regenerate?)`, `openAnketa(token)`, `submitAnketa(token, data)`, `uploadAnketaPhoto(token, blob): Promise<string /* path */>` (path `anketa/<token>/<crypto.randomUUID()>.jpg`, `upsert:false`), `getAnketaSubmissions(status: 'pending'|'reviewed')`, `approveAnketa(id, overrides: Partial<AnketaFields> & { image?: string })`, `rejectAnketa(id)`.
  - hooks with `ANKETA_KEY = ["anketa"]`: `useAnketaSubmissions(status)`, `usePendingAnketaFor(clientId)`, `useAnketaLink()` (mutation returning the URL), `useApproveAnketa()`, `useRejectAnketa()` (invalidate `ANKETA_KEY` + clients keys; `meta.success` "Tasdiqlandi — mijoz kartochkasi yangilandi" / "Rad etildi").

- [ ] **Step 1: Failing test** `src/lib/anketa.test.ts`: `fieldChanges({full_name:'Ali',company:'',role:'x',activity:''},{full_name:'Ali Valiyev',company:'Savdo',role:' x ',activity:''})` → `['full_name','company']`; `anketaError('anketa_invalid')` contains "eskirgan"; unknown code → generic "Yuborilmadi".
- [ ] **Step 2: Run** `bun test src/lib/anketa.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** the three files per Interfaces (follow `queries/sms.ts` + `hooks/useSms.ts` patterns; stale-types workaround of CLAUDE.md §6 for the new tables/functions).
- [ ] **Step 4: Run** the test → PASS; `bun run build` clean.
- [ ] **Step 5: Commit** `feat: anketa data layer`.

### Task 3: Public page `/anketa/:token`

**Files:**
- Create: `src/components/pages/Anketa.tsx`
- Modify: `src/App.tsx` (route next to `/login`, outside `ProtectedRoute`)

**Interfaces:**
- Consumes: `openAnketa`, `submitAnketa`, `uploadAnketaPhoto`, `anketaError`, `ImageCropModal` (`aspect=1`, `outputWidth/Height=1000`).

- [ ] **Step 1: Build the page** like `Login.tsx` (photo ground, white card, DM Sans), title "Fikr Yetakchilari — ma'lumotlaringiz": round photo (tap → file input `accept="image/*"` → `ImageCropModal` → upload), fields Ism-familiya / Kompaniya / Lavozim / Soha, Telefon only when `kind==='universal'` (`inputmode="tel"`), personal shows `phone_masked` read-only, hidden honeypot input `name="website"` (filled → show success, send nothing), pill "Yuborish" full width. States: loading, invalid (`anketaError` text, no form), success "Rahmat! Ma'lumotlaringiz yuborildi." with "O'zgartirish" back to the form.
- [ ] **Step 2: Verify:** `bun run build` clean; with the dev server, `/anketa/xyz` renders the invalid state without crashing or console errors (the dev server talks to prod, where `anketa_open` doesn't exist until Task 7 — an error state is expected). The full flow is checked live in Task 7.
- [ ] **Step 3: Commit** `feat: public anketa page`.

### Task 4: Getting and sending a link

**Files:**
- Create: `src/components/anketa/AnketaLinkButton.tsx`
- Modify: `src/components/pages/SotuvLead.tsx` (next to the client name), `src/components/pages/Mijozlar.tsx` (client card header), `src/components/sms/SmsSend.tsx`

**Interfaces:**
- Consumes: `useAnketaLink`, `anketaUrl`, `SmsSend`, `useAuth().hasAccess`.
- Produces: `<AnketaLinkButton clientId clientName optOut? />` — pill "Anketa havolasi" → menu Nusxalash (clipboard, toast "Havola nusxalandi") · SMS yuborish (opens `SmsSend` in a `Sheet`; item shown only with `hasAccess('sms') || hasAccess('sotuv-crmn')`). Rendered only with `hasAccess('mijozlar') || hasAccess('sotuv-crmn')`.

- [ ] **Step 1: Test first** in `src/lib/sms.test.ts`: `blanks('Salom {ism}! {havola}')` → `['havola']` (pins the blank name the auto-fill keys on).
- [ ] **Step 2: Implement** `AnketaLinkButton`; in `SmsSend`, when the chosen template's `blanks` include `havola`, fetch the client's link once (`useAnketaLink`) and set `values.havola`, rendering that blank read-only.
- [ ] **Step 3:** `bun test src/lib/sms.test.ts` PASS, `bun run build` + `bun run lint` clean.
- [ ] **Step 4: Commit** `feat: anketa link button and {havola} SMS blank`.

### Task 5: Review in Mijozlar + pending notices

**Files:**
- Create: `src/components/anketa/AnketaReview.tsx` (list + review sheet)
- Modify: `src/components/pages/Mijozlar.tsx` (toolbar segment "Anketalar (N)" → `?view=anketalar`), `src/components/pages/SotuvLead.tsx` and the Mijozlar card ("Anketa yuborildi — tekshirish" when `usePendingAnketaFor` has one, opens the sheet), `src/components/layout/LiveSync.tsx`

**Interfaces:**
- Consumes: Task 2 hooks, `fieldChanges`, `ui/Sheet`, `tbl` + `Pager`.

- [ ] **Step 1: Build** the list (photo, name, phone, "Shaxsiy havola" / "Umumiy havola", when; segment Kutilmoqda / Ko'rib chiqilgan; paged 20) and the sheet: per field old → new with changed fields highlighted, the four text fields editable (sent as overrides), photo preview, target line "Bor mijoz: <name>" / "Yangi mijoz ochiladi" (universal), pills Tasdiqlash / Rad etish (`confirmAction` for reject). Segment shown only with `hasAccess('mijozlar')`.
- [ ] **Step 2: LiveSync:** `TOUCHES.client_profile_submissions = ["anketa"]`; on INSERT and `hasAccess('mijozlar')` → `toast.notify("Yangi anketa", name)`.
- [ ] **Step 3:** `bun run build` + `bun run lint` clean.
- [ ] **Step 4: Commit** `feat: anketa review in Mijozlar`.

### Task 6: Universal link in Integratsiyalar

**Files:**
- Modify: `src/components/pages/Integratsiyalar.tsx`, `package.json` (`bun add qrcode @types/qrcode`)

- [ ] **Step 1:** Row "Umumiy anketa havolasi": the URL, Nusxalash, "QR kod" (sheet with `QRCode.toDataURL(url, {width: 512})` image + "Yuklab olish" PNG), "Yangilash" (admin, `confirmAction` "Eski havola va QR ishlamay qoladi") → `getUniversalAnketaLink(true)`.
- [ ] **Step 2:** `bun run build` + `bun run lint` clean.
- [ ] **Step 3: Commit** `feat: universal anketa link with QR`.

### Task 7: Docs, review, deploy, live check

- [ ] **Step 1:** CLAUDE.md §7: one paragraph "Client anketa (097)" (tables, functions, rights, `{havola}` blank, the 025 storage note); migrations range in §2/§3 to `097`.
- [ ] **Step 2:** Whole-branch review by a fresh subagent; fix Important findings.
- [ ] **Step 3:** Prod: backup → apply `097` (`test -s` first) → record `097` → `docker restart supabase-rest-1`.
- [ ] **Step 4:** PR → merge (`--repo oyatillonabijonov/fy-system`) → `git -C ~/Desktop/fy-system pull --ff-only` → Coolify deploys.
- [ ] **Step 5: Live check** on `app.fikryetakchilari.uz` with a test client "TEST Anketa (o'chirilsin)": get link → open on a phone-width tab → change name, add photo → submit → it appears in Anketalar with old → new → approve → card updated, client in Mijozlar. Universal link: submit with a new test phone → approve → new client. Check `ip` was stored (CF header reached SQL). Then delete the test clients, their submissions and photos.
- [ ] **Step 6:** Report to the owner; remind that the `{havola}` SMS template needs Eskiz approval before SMS sending works, and offer the 025 storage-policy fix.
