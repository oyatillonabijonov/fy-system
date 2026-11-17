# Telegram widget — sellers write to leads from the bitim page

Status: design, stage 1. Date 2026-11-17.

## Why

A seller who is talking to a lead (on the phone, or right after) usually sends them prepared material about the
event — a text, a PDF, a picture — from the company's Telegram account. Today that means leaving the ERP, finding
the file, typing the number, and nothing of it is left on the bitim. The goal is to make that one click from the
bitim page, keep the conversation on the bitim, and make sure a lead's reply is never missed. The model the owner
named is AmoCRM's Telegram widget (Wazzup / Radist style: a real Telegram account connected to the CRM).

## Decisions taken with the owner

- **A real Telegram account, not a bot** (option 1 of the two shown). A bot cannot write first to someone who
  never wrote to it, and our leads come from forms and calls.
- **The account belongs to the company** (a separate work account, not a seller's personal one), so everything it
  receives may be stored in the ERP and stays with the company when a seller leaves.
- Stage 1 = what the owner was shown under "Birinchi bosqich": connect the account, chat on the bitim (send and
  receive), templates, notifications for replies, a lead who writes first opens a bitim. Stage 2 (not in this
  design): an automatic first message to new form leads, response-time stats, AI review of chats.

## Goals (stage 1)

1. An admin connects one or more company Telegram accounts in Sozlamalar → Integratsiyalar → Telegram by scanning
   a QR code (and typing the account's 2FA password if it has one).
2. On the bitim page the composer gets a **Telegram** tab: pick a template and/or type, attach files, send. The
   message goes from the company account to the client's number.
3. Every Telegram message, both ways, appears in the bitim's feed (lenta), like calls and SMS do, with ✓ / ✓✓
   (sent / read by the lead).
4. A reply from a lead: the bitim's owner gets a toast + the notify sound; unread counts show on the bitim's
   Kanban card, on the Telegram tab and in the sidebar next to "Bitimlar"; "Bugun" lists "Javob kutyapti" chats.
5. Templates: admins write them (title, text with `{ism}` / `{tadbir}` / `{sana}` blanks, up to 5 files); every
   Sotuv user can use them. Same text for everyone is part of the point.
6. Someone not in the base writes to the account → a client + bitim are opened through lead source `telegram`
   (Lid manbalari → "Telegram", OFF by default, like "Kiruvchi qo'ng'iroq"); its voronka is the source's.
7. On the live-call card (PhoneWidget), a "Ma'lumot yuborish" button opens the caller's bitim on its Telegram tab.

## Non-goals / anti-goals

- **No bulk sending through Telegram.** Telegram restricts accounts that message many strangers. SMS stays the
  bulk channel. A send is always one seller → one client.
- Groups and channels the account is in are ignored — only private chats with real users (no bots).
- The 2FA password is never stored or logged; it is passed to Telegram once during login.
- No editing / deleting sent messages from the ERP in stage 1; no voice-note recording; no stickers.
- No Telegram Business features, no bot API for this.

## Constraints

- Runs in the existing `fy-amo-sync` container (Bun), library **mtcute** (`@mtcute/bun`, 0.32.x): QR sign-in,
  `resolvePhoneNumber`, `sendText` / `sendMedia`, `onNewMessage`, history-read updates, downloads.
- Needs `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` from my.telegram.org — created by the owner with the company
  phone (we never log in there). Unset = the feature is off (UI says "ulanmagan").
- mtcute keeps its session + update state in an SQLite file per account. It lives on a Docker volume
  (`fy-telegram:/data`, file `/data/tg-<account id>.session`) so a redeploy neither logs out nor loses messages
  that arrived while the container was down (mtcute catches up on start). This changes the documented
  `docker run` line (add `-v fy-telegram:/data`).
- Browser ↔ worker over `/hooks/tg/*` (the gateway already proxies `/hooks/` to amo-sync), authorised with the
  browser's Supabase JWT exactly like `/hooks/pbx/*` (`verifyJwt`). Reads go straight to Postgres through
  PostgREST with RLS, like every other screen.
- Telegram limits: a phone not on Telegram, or a user whose "find me by phone" is closed, cannot be written to
  first — the send answers that in Uzbek ("Bu raqam Telegramda topilmadi"). A daily cap of **30 first messages
  per account** (chats that never existed before) protects the account; replies into existing chats are not
  capped. FLOOD_WAIT from Telegram → the send fails with "Telegram biroz kutishni so'radi, N soniyadan keyin".
- Migration `100`; never edit earlier ones. Strict TS, bun, Uzbek UI, Plexus tokens, pill buttons, no shadows.

## Approaches considered

1. **Company account connected through MTProto (chosen).** Full two-way chat, can write first by phone,
   messages arrive while nobody has the ERP open. Costs: a long-lived connection + session file to look after,
   Telegram's anti-spam limits.
2. Bot + Telegram Business connected bot. Can't write first (Business bots only answer chats active in the last
   24 h, and need Premium) — fails the main use (send material to a new lead).
3. ERP prepares the text and opens `t.me/+phone` in the seller's own Telegram. No risk, but nothing comes back to
   the ERP and files travel as links. Shown to the owner; they chose 1.

## Data (migration 100)

- `telegram_accounts` — id, `profile_id` (NULL = shared company account; set = that seller's work account),
  title, phone, `tg_user_id`, status (`pending` / `active` / `logged_out`), connected_at, created_at.
  Admin-only RLS. No secret in the table (the session is the file on the volume).
- `tg_chats` — one per (account, Telegram user): id, account_id, `tg_user_id`, `access_hash`, username, title,
  phone (when Telegram shows it), client_id, lead_id (the bitim it's shown on), unread (int),
  last_message_at, first_out_at. Unique (account_id, tg_user_id).
- `tg_messages` — id, chat_id, `tg_msg_id`, direction (`in`/`out`), text, files jsonb
  `[{path, name, mime, size}]`, sent_by (profile, out only), template_id, read_at (out: when the lead read it),
  created_at. Unique (chat_id, tg_msg_id).
- `tg_templates` — id, title, body, files jsonb, sort, created_by, created_at, updated_at.
- Private bucket `telegram-files` (template files, incoming media, files attached by hand), 20 MB, read by
  `sotuv-crmn`, written by the worker (service) and by staff for uploads.
- Lead source row `telegram` in `crm_lead_sources` (enabled = false).
- RLS: `tg_chats` / `tg_messages` read with `has_permission(…,'sotuv-crmn')`, no write policies (worker only);
  `tg_templates` read with sotuv, write admin.
- Realtime publication: `tg_messages`, `tg_chats` (+ `LiveSync.TOUCHES`).

## Flows

- **Connect:** admin → "Telegram ulash" → `POST /hooks/tg/login` creates a `pending` account and starts
  `tg.start({ qrCodeHandler, password })` in the worker; the browser polls `GET /hooks/tg/login/<id>` →
  `{ state: 'qr', url } | { state: 'password' } | { state: 'done', title } | { state: 'error', message }` and draws
  the QR (we already have `qrcode`). `POST /hooks/tg/login/<id>/password` hands the typed password to the waiting
  promise. Disconnect = `POST /hooks/tg/logout/<id>` (logs the session out, deletes the file, status
  `logged_out`; history stays).
- **Send:** `POST /hooks/tg/send { lead_id, text, template_id?, files? }` (JWT, `sotuv-crmn`). Account = the
  bitim owner's own account if they have an active one, else the shared one. Peer = the bitim's chat if any, else
  `resolvePhoneNumber(client.phone)` (creates the chat row, counts toward the daily cap). Text blanks are filled
  server-side (`{ism}` = client's first name, `{tadbir}` / `{sana}` = the voronka's event name / date). Files are
  read from the bucket and sent as one album or documents with the text as caption when it fits (1024 chars),
  else text first then files. Stored as an `out` row; answer `{ ok }` or `{ error: <Uzbek text> }`.
- **Receive:** `onNewMessage` for private chats with users (not bots, not service messages, not our own
  outgoing sent from the phone app — those are stored too as `out` with sent_by NULL so the history is complete).
  Chat → existing `tg_chats` row, else match client by phone (if Telegram gives it), else lead source `telegram`
  via `intake_lead('telegram', …, name = Telegram name, phone = phone or NULL)`; if the source is off and nothing
  matches, the chat is stored unlinked (no bitim) and shows nowhere — stage 2 can list those. lead_id = the
  client's latest open bitim (or the one intake opened). Media up to 20 MB is downloaded to the bucket; larger →
  a "📎 Fayl Telegramda (N MB)" line. `unread += 1`, `last_message_at`.
- **Read state:** opening the Telegram tab calls `POST /hooks/tg/read { lead_id }` → `readHistory` on Telegram
  (the lead sees ✓✓) and `unread = 0`. The history-read-outbox update sets `read_at` on our `out` rows up to that
  message id.
- **Notify:** `LiveSync` sees a new `in` row → `toast.notify("Telegram · <client>", text)` for the bitim's owner
  (or for every Sotuv user when the bitim has no owner).

## UI

- Integratsiyalar → **Telegram** section: accounts (title, phone, whose, status, Uzish), "Ulash" (QR sheet with
  password step), templates list + editor (title, text with blank chips, files ≤ 5, order).
- Bitim page composer: tab **Telegram** (only when the client has a phone or a chat exists): template chips,
  textarea, attach (uploads to the bucket), Yuborish; shows which account it will go from and an error inline.
- Bitim feed: Telegram rows (direction icon, text, files as chips that open a 5-minute signed URL, ✓/✓✓, time,
  who sent).
- Kanban card + Telegram tab: unread badge. Sidebar "Bitimlar": my unread total. `Bugun`: "Javob kutyapti"
  (chats with unread on my bitimlar / unowned).
- PhoneWidget: "Ma'lumot yuborish" → `/sotuv/bitim/<id>?tab=telegram`.

## Left to the builder

File/module layout inside `amo-sync/src/telegram-user/` (or similar; `telegram.ts` is the receipts bot), exact
SQL of RPCs/policies, component split, test layout (pure helpers unit-tested with `bun test`; DB behaviour with a
SQL test file for 100; the MTProto client mocked behind a small interface).

## Calls made after the builder check (mine, for the owner to check)

1. **A stranger without a visible phone** (Telegram rarely shows the phone of someone who writes first): one
   client is opened with no phone, and every later message from that Telegram user lands on the same chat → the
   same client / bitim (the chat is keyed by account + Telegram user id). When the seller types the phone on the
   bitim and it already belongs to another client, the existing Dublikatlar merge joins them.
2. **Which account sends:** an existing chat always keeps its account (the lead never sees a new sender). A new
   chat goes from the bitim owner's own active account, else from the oldest active shared account; none active →
   "Telegram akkaunt ulanmagan".
3. **Daily cap:** 30 new chats per account per Tashkent day, counted from `tg_chats.first_out_at`; a number not
   found on Telegram doesn't count; over the cap the seller sees "Bugungi yangi suhbatlar chegarasi (30) tugadi —
   ertaga yoki mavjud suhbatga yozing". Checked inside the same DB transaction that creates the chat (row lock on
   the account), so two sends can't both pass at 29.
4. **Lead source `telegram` is ON by default** (the owner was shown "lid o'zi yozsa bitim ochiladi"); an admin can
   switch it off. Messages from staff (`profiles.telegram` = the sender's username) never open a bitim. With the
   source off, a stranger's message that matches no client is **not stored at all** (no invisible private chats).
5. **Any Sotuv user may read and send on any bitim**, as with notes, calls and SMS today. "Javob kutyapti" and the
   sidebar count show the bitimlar I own plus unowned ones.
6. **Session lost** (ended from the phone, revoked by Telegram): status → `logged_out`, one message to
   `ALERT_CHAT_ID`, sends answer "Telegram akkaunt uzilgan — Integratsiyalar'da qayta ulang". Redeploy is
   `rm -f` then `run`, so two processes never hold one session file.
7. **First build task is a spike:** mtcute QR login + send + receive inside the real `amo-sync` Docker image on
   the aarch64 VM (native SQLite / crypto), before anything else is built on it.
8. **Files:** 20 MB per file, no cleanup (Storage deletes don't work on this stack, as with `task-files`).
