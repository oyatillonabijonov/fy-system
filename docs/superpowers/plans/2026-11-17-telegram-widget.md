# Telegram widget (stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A company Telegram account connected to the ERP: sellers send templates/files to a lead from the bitim page, replies land on the bitim with notifications.

**Architecture:** amo-sync holds one mtcute (MTProto user) client per connected account, session in SQLite on a Docker volume. Business rules (which account, daily cap, linking a chat to a client/bitim, storing a message) live in SECURITY DEFINER SQL functions callable only by the worker; the worker does Telegram I/O; the browser reads through PostgREST/RLS and writes through `/hooks/tg/*` with its JWT.

**Tech Stack:** Bun, `@mtcute/bun` 0.32.x, postgres.js, Supabase Postgres (migration 100), React 19 + TanStack Query, Tailwind/Plexus.

**Spec:** `docs/superpowers/specs/2026-11-17-telegram-widget-design.md`

## Global Constraints

- Migration number `100`; never edit migrations ≤ 099. SECURITY DEFINER functions `SET search_path = public` (019 pattern); worker-only functions `REVOKE … FROM PUBLIC, anon, authenticated`.
- Daily cap: 30 new chats per account per Asia/Tashkent day (from `tg_chats.first_out_at`).
- Lead source id `telegram`, enabled = true, voronka = the `Umumiy` pipeline.
- Bucket `telegram-files`, private, 20 MB (`20971520`).
- Session file `/data/tg-<account id>.session`; volume `fy-telegram:/data`.
- Env: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`; unset ⇒ `/hooks/tg/*` answers `503 {error:"tg_off"}`, UI shows "ulanmagan".
- Uzbek error copy (exact): `tg_no_account` → "Telegram akkaunt ulanmagan"; `tg_cap` → "Bugungi yangi suhbatlar chegarasi (30) tugadi — ertaga yoki mavjud suhbatga yozing"; `tg_not_found` → "Bu raqam Telegramda topilmadi"; `tg_flood` → "Telegram biroz kutishni so'radi, {n} soniyadan keyin"; `tg_logged_out` → "Telegram akkaunt uzilgan — Integratsiyalar'da qayta ulang".
- Strict TS, no `any`, `import type`; bun; Plexus utilities only, pill buttons, no shadows, icons Phosphor (16px regular); toasts via `@/lib/toast`; confirmations via `confirmAction`.

## Review Focus

1. A lead with Telegram but "find by phone" closed → send fails with `tg_not_found`, nothing stored, cap not consumed (Task 2 test + Task 4 test).
2. The same Telegram user writing again after their bitim was won/lost → the message goes to the client's latest OPEN bitim, or stays on the old bitim if none open — never opens a duplicate client (Task 2 test).
3. An outgoing message the operator typed in the phone app (not the ERP) → stored as `out`, `sent_by` NULL, doesn't bump `unread` (Task 2 test).
4. Two sends racing on the 30th new chat → exactly one succeeds (Task 2 test with two `tg_create_chat` calls at 29).
5. Session revoked while running → account `logged_out`, one alert, sends answer `tg_logged_out` (Task 3 test with fake port).

---

### Task 1: Spike — mtcute inside the amo-sync image on the VM

**Files:** Modify `amo-sync/package.json`, `amo-sync/bun.lock`; Create `amo-sync/scripts/tg-spike.ts` (deleted at the end of the task).

- [ ] Add `@mtcute/bun@0.32.8` to amo-sync (`bun add` in `amo-sync/`).
- [ ] `tg-spike.ts`: `new TelegramClient({ apiId: 1, apiHash: "x", storage: "/tmp/spike.session" })`, open storage, print `ok`, exit — proves bun:sqlite + crypto load (no network login).
- [ ] Build the image on the VM (`docker build` from a tarball, like the redeploy) and run `docker run --rm fy-amo-sync:spike bun run scripts/tg-spike.ts`.
  Expected: `ok`. If it fails on Alpine, switch the Dockerfile base to `oven/bun:1-debian` and retry; record the result in the ledger.
- [ ] Real login/send/receive is verified in Task 8 once the owner has stored `TELEGRAM_API_ID/HASH`.
- [ ] Delete the spike script; commit the dependency (`chore: add mtcute`).

### Task 2: Migration 100 — tables, RLS, bucket, lead source, worker functions

**Files:** Create `supabase/migrations/100_telegram_widget.sql`, `supabase/tests/100_telegram_widget_test.sql`.

**Interfaces — Produces (worker-only SQL functions):**
- `tg_link_chat(p_account uuid, p_tg_user bigint, p_access_hash text, p_username text, p_title text, p_phone text) returns uuid` — chat id, or NULL when the message must be ignored. Existing (account, user) chat → its id (fills empty username/phone). Else: sender's username equals a staff `profiles.telegram` (case/`@`-insensitive) → NULL. Else client by `clean_client_phone(p_phone)`; else if source `telegram` enabled → `intake_lead('telegram', <its token>, p_title, p_phone, NULL, '{}', '{}', NULL, NULL)` client/lead; else NULL. lead_id = client's latest open bitim (`is_won = false and is_lost = false`, newest), else latest bitim.
- `tg_log_message(p_chat uuid, p_msg bigint, p_dir text, p_text text, p_files jsonb, p_sent_by uuid, p_template uuid, p_at timestamptz) returns uuid` — idempotent on (chat, msg); `in` ⇒ `unread += 1`; always `last_message_at = greatest(…, p_at)`; an `in` on a chat whose lead is closed re-points `lead_id` to the client's latest open bitim if one exists.
- `tg_send_target(p_lead uuid) returns table(account_id uuid, chat_id uuid, tg_user_id bigint, access_hash text, phone text)` — chat_id NULL ⇒ new chat. Account rule: client's existing chat (any active account; newest) → that; else bitim owner's active account; else oldest active shared (`profile_id is null`); none → raise `tg_no_account`. New chat and today's count ≥ 30 → raise `tg_cap`. No client phone and no chat → raise `tg_not_found`.
- `tg_create_chat(p_account uuid, p_lead uuid, p_tg_user bigint, p_access_hash text, p_username text, p_title text) returns uuid` — locks the account row, re-checks the cap (raise `tg_cap`), inserts/returns the chat with `first_out_at = now()`, client/lead from the bitim. Existing (account, user) row → returns it without consuming the cap.
- `tg_read(p_lead uuid) returns void` (unread = 0 on the lead's chats) and `tg_read_outbox(p_chat uuid, p_max_msg bigint, p_at timestamptz) returns void`.

- [ ] **Write the failing SQL test** `100_telegram_widget_test.sql`, blocks that `RAISE` on failure:
  1. stranger with phone of an existing client → chat linked to that client and their open bitim, no new client;
  2. stranger without phone, source on → one new client (phone NULL) + bitim in Umumiy; second `tg_link_chat` same user → same chat id, still one client;
  3. source off, no match → NULL and no rows; staff username → NULL;
  4. `tg_log_message` twice same msg → one row; `in` bumps unread to 1, `out` with `sent_by` NULL doesn't;
  5. lead won, client has another open bitim → `in` moves chat.lead_id there; no open one → stays;
  6. cap: 29 chats with `first_out_at` today → `tg_send_target` ok; `tg_create_chat` → 30th ok, 31st raises `tg_cap`; existing chat → no raise;
  7. account rule: owner's own account beats shared; existing chat's account beats owner's; no active account → `tg_no_account`;
  8. grants: `has_function_privilege('authenticated', 'tg_link_chat(...)', 'execute')` is false for every worker function; `tg_templates` insert as a non-admin sotuv user fails, select works.
- [ ] Run on the throwaway stand (CLAUDE.md §5 Tests). Expected: FAIL at block 1 (functions missing).
- [ ] **Write the migration**: tables per spec Data section (`telegram_accounts`, `tg_chats`, `tg_messages`, `tg_templates`), indexes `tg_chats(lead_id)`, `tg_chats(client_id)`, `tg_messages(chat_id, created_at)`; RLS on all four (accounts: admin read; chats/messages: `has_permission(auth.uid(),'sotuv-crmn')` read, no write; templates: sotuv read, `is_admin` write); bucket `telegram-files` row + storage policies (`TO authenticated`: read with sotuv, insert with sotuv); lead source `telegram` (enabled, Umumiy, random token); the functions above; `ALTER PUBLICATION supabase_realtime ADD TABLE tg_messages, tg_chats`.
- [ ] Run the test. Expected: all blocks pass. Revert a function body (e.g. remove the cap re-check) → block 6 goes red; restore.
- [ ] Commit `feat: telegram widget schema (100)`.

### Task 3: Worker — account manager, login, receive

**Files:** Create `amo-sync/src/tguser/port.ts`, `amo-sync/src/tguser/accounts.ts`, `amo-sync/src/tguser/incoming.ts`, `amo-sync/src/tguser/incoming.test.ts`, `amo-sync/src/tguser/accounts.test.ts`; Modify `amo-sync/src/index.ts`.

**Interfaces — Produces:**
- `port.ts`: `interface TgPort { start(h: { qr(url: string, expires: Date): void; password(): Promise<string> }): Promise<{ id: number; name: string; phone: string | null }>; resume(): Promise<boolean>; onMessage(cb: (m: TgIncoming) => void): void; onReadOutbox(cb: (userId: number, maxId: number) => void): void; onLoggedOut(cb: () => void): void; resolvePhone(phone: string): Promise<TgPeer | null>; sendText(peer: TgPeer, text: string): Promise<number>; sendFiles(peer: TgPeer, files: { name: string; mime: string; data: Uint8Array }[], caption: string): Promise<number[]>; download(m: TgIncoming): Promise<Uint8Array | null>; readHistory(peer: TgPeer): Promise<void>; logout(): Promise<void>; close(): Promise<void> }`, `type TgPeer = { userId: number; accessHash: string; username: string | null; title: string; phone: string | null }`, `type TgIncoming = { peer: TgPeer; msgId: number; out: boolean; isBot: boolean; isPrivate: boolean; isService: boolean; text: string; media: { name: string; mime: string; size: number } | null; date: Date }`, and `mtcutePort(accountId: string): TgPort` (the only file importing mtcute; FLOOD_WAIT → `throw new TgError("tg_flood", seconds)`, AUTH_KEY_UNREGISTERED/SESSION_REVOKED → fires onLoggedOut).
- `incoming.ts`: `shouldStore(m: TgIncoming): boolean` (private, not bot, not service) and `handleIncoming(sql: Sql, accountId: string, port: TgPort, m: TgIncoming): Promise<void>` (tg_link_chat → download media ≤ 20 MB to `telegram-files/in/<chat>/<msg>-<name>` via the storage REST API with the service key, else text line `📎 Fayl Telegramda (N MB)` → tg_log_message).
- `accounts.ts`: `startTgAccounts(sql: Sql, make?: (id: string) => TgPort): Promise<void>` (resumes every `active` account), `beginLogin(sql, profileId: string | null, title: string): Promise<string>` (account id), `loginState(id): LoginState`, `submitPassword(id, pw: string): void`, `logoutAccount(sql, id): Promise<void>`, `portFor(id): TgPort | undefined`; `type LoginState = { state: "qr"; url: string } | { state: "password" } | { state: "done"; title: string } | { state: "error"; message: string }`. Logged-out handler: status `logged_out`, delete the session file, one `ALERT_CHAT_ID` message ("Telegram akkaunt uzildi: <title>") through the existing `telegram.ts` send helper.

- [ ] Tests first: `incoming.test.ts` — `shouldStore` false for bot / group / service, true for a private user (incl. `out`); `handleIncoming` with a fake port + fake sql records calls (`tg_link_chat` then `tg_log_message` with `in`, `out` ⇒ dir `out` and `sent_by` NULL; link returns NULL ⇒ no log, no download). `accounts.test.ts` — fake port firing `onLoggedOut` ⇒ status update SQL + one alert even if fired twice; login flow: qr callback ⇒ state `qr`, password() pending ⇒ state `password`, `submitPassword` resolves it, start resolves ⇒ `done` and account `active` with phone/tg_user_id.
- [ ] Run `bun test src/tguser` in amo-sync. Expected: FAIL (modules missing).
- [ ] Implement; wire `startTgAccounts(sql)` into `index.ts` (skipped with a log line when env unset).
- [ ] Run tests. Expected: PASS. `bunx tsc --noEmit` clean.
- [ ] Commit `feat: telegram account manager and incoming messages`.

### Task 4: Worker — send, read, HTTP routes

**Files:** Create `amo-sync/src/tguser/send.ts`, `amo-sync/src/tguser/send.test.ts`, `amo-sync/src/tguser/http.ts`; Modify `amo-sync/src/intake.ts` (route `/hooks/tg/` → `handleTg`).

**Interfaces — Consumes:** Task 2 functions; Task 3 `portFor`, `beginLogin`, `loginState`, `submitPassword`, `logoutAccount`, `TgError`.
**Produces (HTTP, JWT via `verifyJwt`, CORS like pbx with POST):**
- `POST /hooks/tg/send {lead_id, text, template_id?, files?: {path,name,mime}[]}` (sotuv) → `{ok:true}` | `{error: <Uzbek copy>}` status 400/409/503.
- `POST /hooks/tg/read {lead_id}` (sotuv) → readHistory on each chat's port + `tg_read`.
- `POST /hooks/tg/login {title, profile_id?}` (admin) → `{id}`; `GET /hooks/tg/login/<id>` → `LoginState`; `POST /hooks/tg/login/<id>/password {password}`; `POST /hooks/tg/logout/<id>` (admin).
- `send.ts`: `fillBlanks(text: string, v: { ism: string; tadbir: string; sana: string }): string` (unknown blanks left as is) and `sendToLead(sql, uid: string, body): Promise<void>` (throws `TgError(code)`).

- [ ] Tests first (`send.test.ts`): `fillBlanks("Salom {ism}, {tadbir} {sana} da", {ism:"Anvar",tadbir:"Nonushta",sana:"20-noyabr"})` → `"Salom Anvar, Nonushta 20-noyabr da"`; `{x}` kept; `sendToLead` with fake port/sql: resolvePhone null ⇒ throws `tg_not_found` and never calls `tg_create_chat`; existing chat ⇒ no resolve, sendText, `tg_log_message('out', sent_by = uid, template)`; caption ≤ 1024 ⇒ one `sendFiles` with caption, longer ⇒ `sendText` then `sendFiles` with empty caption; account `logged_out`/no port ⇒ `tg_logged_out`.
- [ ] Run. Expected FAIL. Implement (`{ism}` = first word of client name, `{tadbir}` / `{sana}` = the voronka's event name / `date` formatted `d-MMMM` in Uzbek; files read from the bucket with the service key). Run. Expected PASS; tsc clean.
- [ ] Commit `feat: send to a lead over telegram, read state, /hooks/tg routes`.

### Task 5: Web data layer + live updates

**Files:** Create `src/lib/supabase/queries/telegram.ts`, `src/hooks/useTelegram.ts`, `src/lib/telegram.test.ts` (pure helpers), `src/lib/telegram.ts`; Modify `src/components/layout/LiveSync.tsx`, `src/lib/supabase/types.ts` only via the stale-types workaround (local Row types).

**Produces:** `TG_KEY = ["telegram"]`; `useLeadTelegram(leadId)` (chat rows + messages, newest last), `useTgUnread()` (my + unowned bitimlar' unread total and per-lead map), `useTgTemplates()`, `useSaveTgTemplate()`, `useDeleteTgTemplate()`, `useTgAccounts()`, `useSendTelegram()` (meta silent — the tab shows the error), `useReadTelegram()`, `tgHook(path, body?)` fetch helper (pattern of `syncSmsTemplates`), `TG_ERRORS` map in `src/lib/telegram.ts` with the exact Global-Constraints copy; LiveSync `TOUCHES.tg_messages = ["telegram","sotuv"]`, `tg_chats = ["telegram","sotuv"]`; on an `in` INSERT not from me: `toast.notify("Telegram · <chat title>", text)` when the bitim is mine or unowned.
- [ ] Test first: `tgErrorText("tg_flood", 30)` → "Telegram biroz kutishni so'radi, 30 soniyadan keyin"; unknown code → "Yuborilmadi". Run `bun test src/lib/telegram.test.ts` → FAIL; implement; PASS.
- [ ] `bun run build` clean. Commit `feat: telegram web data layer`.

### Task 6: Integratsiyalar → Telegram (accounts, QR connect, templates)

**Files:** Create `src/components/telegram/TgAccounts.tsx`, `src/components/telegram/TgTemplates.tsx`; Modify `src/components/pages/Integratsiyalar.tsx` (new section after Telefoniya, admin only).

- [ ] Accounts table (title, phone, kimniki — "Umumiy" or seller name, holat chip, "Uzish" with `confirmAction`), "Telegram ulash" → sheet: title + owner select (Umumiy / Sotuv seller) → QR (`qrcode` `toDataURL`) polling `GET /hooks/tg/login/<id>` every 1.5 s → password field when asked → "Ulandi" ✓; error shown inline. "ulanmagan" banner when `/hooks/tg` answers `tg_off`.
- [ ] Templates: list (title, first line, files count, ↑↓ order), editor sheet: title, text (blank chips `{ism}` `{tadbir}` `{sana}` insert at caret), up to 5 files uploaded to `telegram-files/templates/<uuid>-<name>`, 20 MB check client-side.
- [ ] Verify in the preview (signed in as admin on the live API — read-only checks only, no real connect until Task 8). `bun run build` + `bun run lint` clean. Commit `feat: telegram accounts and templates in Integratsiyalar`.

### Task 7: Bitim page, Kanban badge, sidebar count, Bugun, PhoneWidget

**Files:** Create `src/components/telegram/TgComposer.tsx`, `src/components/telegram/TgFeedItem.tsx`; Modify `src/components/pages/SotuvLead.tsx` (composer tab `telegram`, feed merge, `?tab=telegram`), `src/components/sotuv/Board.tsx` + `src/components/sotuv/LeadCards.tsx` (unread badge), `src/components/layout/Sidebar.tsx` + `src/components/layout/MobileNav.tsx` (Bitimlar count), `src/components/pages/Bugun.tsx` ("Javob kutyapti"), `src/components/sotuv/PhoneWidget.tsx` ("Ma'lumot yuborish").

- [ ] Composer tab "Telegram" (shown when client phone or a chat exists): template chips (select fills text + files), textarea, attach (≤ 20 MB, upload to `telegram-files/out/<lead>/<uuid>-<name>`), "Yuborish" pill, "Kimdan: <account title>" line, inline error from `TG_ERRORS`. Opening the tab calls `useReadTelegram` when unread > 0.
- [ ] Feed rows (`TgFeedItem`): PaperPlaneTilt (out) / TelegramLogo (in) icon, text (pre-wrap), file chips opening a 5-min signed URL, ✓ (sent) / ✓✓ (`read_at`), time, sender name.
- [ ] Unread badges: Kanban card + mobile LeadCards (`bg-danger text-white` count pill), sidebar "Bitimlar" and MobileNav Sotuv tab total; Bugun section "Javob kutyapti" (lead name, last message line, time) hidden when empty; PhoneWidget button when the call has a bitim → `/sotuv/bitim/<id>?tab=telegram`.
- [ ] Verify desktop + 375 px in the preview against live data (read only). `bun run build` + `bun run lint` clean. Commit `feat: telegram on the bitim page, unread badges, Javob kutyapti`.

### Task 8: Deploy and live verification

- [ ] Back up prod (CLAUDE.md §5), apply `100`, record it, `NOTIFY pgrst` + restart rest.
- [ ] Owner has stored `TELEGRAM_API_ID/HASH` in Doppler `fy-system/prd` → add them to `~/amo-sync/.env`; redeploy amo-sync with `-v fy-telegram:/data` (`docker volume create fy-telegram` first; `/data` owned by the `bun` user — `chown` via a one-off root container).
- [ ] Owner scans the QR in Integratsiyalar (we never type their password); send a test template to a staff member's own phone, reply from it, check feed, ✓✓, toast, unread clear; then remove the test rows.
- [ ] Update CLAUDE.md (§4 env, §5 docker run line + volume, §7 Telegram widget note, migrations 001–100). PR, merge, pull main checkout.
