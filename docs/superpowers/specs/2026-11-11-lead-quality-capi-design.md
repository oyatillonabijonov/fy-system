# Lead quality score + Meta Conversions API — design

Date: 2026-11-11. Status: waiting for the owner's approval. Nothing is built yet.
Source of the requirements: the brief written by the Claude session that builds nonushta.fikryetakchilari.uz
(pasted by the owner on 2026-11-11). This document keeps that brief's decisions and adds only what the brief
left open (marked **our call**).

## Why

Meta optimises ads on the "Lead" event. Today every application counts the same, so Meta learns to bring
cheap, unqualified people. Goal: Meta hears "Lead" only for qualified applications, and later hears which
leads actually talked well (`QualifiedLead`) and paid (`Purchase`). The site already sends everything needed;
the scoring, the server-side events and the CRM view are ours.

## Goals

1. Every site application that carries the new fields gets a score the moment it arrives; `qualified = score
   >= threshold`. The webhook answers `{"ok": true, "qualified": true|false}` synchronously.
2. The bitim page shows Lavozim, Oylik aylanma, Kompaniya (already, as form answers), the score and a
   "Sifatli / Sifatsiz" badge, UTMs and ad_id (already, "Qayerdan keldi", PR #146).
3. A universal Conversions API sender: `Lead`, `QualifiedLead`, `Purchase`, each at most once per bitim,
   queued, retried, logged in `meta_events_log`.
4. Works for the next events' forms (Tog' Safari, Kaizen, next nonushta) with no code change, as long as they
   use the same field names.

## Non-goals / must not break

- Old forms without the new fields keep working exactly as now: no score, no `qualified` in the answer, no
  badge, no server event. (**our call**: "has the new fields" = the body has `Lavozim` or `Oylik aylanma`.)
- Meta lead-ad leads (`/hooks/lead/meta`) are not scored — their field names differ. Unchanged.
- No new UI for the event log; it is read with SQL / returned to the site session as sample rows.

## How it works

### Intake (amo-sync `src/intake.ts`)

- New body keys are pulled out of the form answers the way UTMs are (`splitAttribution`): `event_id`,
  `event_source_url`, `content_name`, `fbc`, `fbp`. They are stored on the bitim, not shown as answers.
- Client IP: `CF-Connecting-IP`, else the first `X-Forwarded-For` value (the gateway passes both through);
  User-Agent from the request. Stored, never shown.
- Score (pure function, `bun test`): text normalised first — apostrophes `' ‘ ’ ʻ ʼ \`` → one, dashes `- – —` →
  one, case and spaces folded.
  - Lavozim: Biznes egasi / asoschi 3 · Direktor / top-menejer 2 · Bo'lim rahbari 1 · Xodim / mutaxassis 0 ·
    Hozircha biznesim yo'q 0 · anything else 0.
  - Oylik aylanma: 1 mlrd so'mdan yuqori 3 · 500 mln – 1 mlrd 2 · 100–500 mln 1 · 100 mln gacha 0 ·
    Hali biznesim yo'q 0 · anything else 0.
  - Kompaniya +1, except: empty, shorter than 3 letters, only digits/symbols, or one of yo'q, yoq, нет, -,
    talaba, student, o'quvchi, ishsiz, test (whole value, case-insensitive, normalised).
- Threshold: **our call — per voronka**, `crm_pipelines.lead_threshold`, default 4, set by an admin in
  Voronka sozlamalari (Tog' Safari may need a different bar than a nonushta). Not hard-coded.
- The answer becomes `{"ok": true, "duplicate": …, "qualified": …}` (`duplicate` kept for old callers).
- A repeat application from the same phone (an open bitim already exists — "Qayta murojaat") re-scores the
  existing bitim with the newest answers. Its server `Lead` is not sent again (once per bitim); the browser's
  own pixel still fires.

### Data (new migration `093`, nothing existing edited)

- `crm_leads`: `lead_score int NULL`, `qualified boolean NULL` (NULL = not scored), `capi jsonb` (event_id,
  event_source_url, content_name, fbc, fbp, client_ip, user_agent).
- `crm_pipelines.lead_threshold int NOT NULL DEFAULT 4 CHECK (0..7)`.
- `meta_events_log`: lead_id (FK, cascade), event_name (`Lead`/`QualifiedLead`/`Purchase`), event_id,
  event_time, value (Purchase), status (`pending`/`sent`/`failed`/`skipped`), attempts, next_try_at, response
  (Meta's answer, no token), created_at, sent_at; **UNIQUE (lead_id, event_name)**. RLS on, admin read only,
  no API writes. This table is also the queue.
- Rows are queued by the database itself, so no code path can forget them:
  - `Lead`: when a bitim becomes `qualified = true` (insert or update), event_id = the form's `event_id`
    (must equal the browser's), else `<lead_id>_Lead`.
  - `QualifiedLead`: when a call analysis becomes `done` for a call tied to a bitim and its outcome contains
    "yozildi", "qayta qo'ng'iroq" or "o'ylab ko'radi" and not "maqsadsiz". Regardless of the form score.
  - `Purchase`: when a bitim becomes won (value = its Summa), or when a payment is recorded for a client whose
    bitim sits in the voronka tied to that payment's event (value = the payment, **our call** for how a payment
    finds its bitim: client + the voronka's event). Whichever comes first; once.
  - event_id for the last two: `<lead_id>_<event_name>`.

### Sender (amo-sync, new `src/capi.ts`)

- Every 30 s, pending rows due now: skipped if the bitim's application is older than 7 days; otherwise POST
  `https://graph.facebook.com/v26.0/1647118073645060/events` (v26.0 = newest Marketing API version, checked
  2026-11-11) with `access_token` from `META_CAPI_TOKEN`, `test_event_code` from `META_TEST_EVENT_CODE` when set.
- `user_data`: ph = SHA-256 of the phone as `998XXXXXXXXX`, fn = SHA-256 of the name lowercased and trimmed,
  external_id = SHA-256 of the lead id, fbc/fbp/client_ip_address/client_user_agent as stored (omitted when
  missing). `custom_data.content_name` = the form's, else the voronka's event name, else the voronka name;
  Purchase adds value + currency "UZS". `action_source` "website", `event_source_url` as stored.
- Retries after 1 min, 10 min, 1 h, then `failed`. No token = the sender is off and logs that once; rows wait
  (and fall to `skipped` after 7 days). The token never reaches the browser, the repo or a log line.

### UI

- Bitim page (desktop + phone): above "Forma javoblari", "Ball 5 · Sifatli" (green) or "Ball 2 · Sifatsiz"
  (grey) when scored.
- Voronka sozlamalari (admin): "Sifatli lid chegarasi" number field, default 4, with one line explaining it.

## Constraints

CLAUDE.md rules: new migration + SQL test on a throwaway Postgres, backup before applying, bun, strict TS,
`bun test` for the pure parts, Uzbek UI copy, secrets only in Doppler / the container env (`.env.example`
gets the names only).

## What can't be finished without the owner

- `META_CAPI_TOKEN` (Nuriddin, Events Manager) and a `META_TEST_EVENT_CODE` for the four Events Manager tests.
  Until then everything is built and switched on except the sending itself; the site can already drop its
  temporary rule once our answer carries `qualified`.
- The four tests go through the real form, so they create real test bitimlar; they are deleted afterwards.

## Calls settled after the builder check (all **our call**)

- **Field names:** `Lavozim`, `Oylik aylanma`, `Kompaniya` exactly as the live site sends them (checked in the
  webhook log 2026-11-11), matched case-insensitively with spaces folded.
- **Purchase value:** the agreed amount, not a partial instalment — the bitim's Summa when it is won; the
  participant's price when the trigger is a payment. The payment's bitim = the client's most recent bitim in the
  voronka tied to that payment's event; none found = no Purchase. One Purchase per bitim (repeat buys are out of
  scope).
- **QualifiedLead matching:** the outcome text normalised (case, apostrophes); qualifies if it contains
  "yozildi", "qayta qo'ng'iroq" or "o'ylab ko'radi" and contains neither "maqsadsiz" nor "rad etdi". The first
  analysis that qualifies wins (UNIQUE).
- **Repeat application that flips a bitim to qualified:** the stored `capi` is replaced by the newest
  submission, so the server `Lead` carries the event_id the browser just used — deduplication holds. A bitim
  that later scores lower keeps its already-sent `Lead`.
- **Threshold change:** applies to applications that arrive after the change; old bitimlar keep their verdict.
- **IP:** `CF-Connecting-IP` first (the API is behind Cloudflare), else the first `X-Forwarded-For` value.

## Left to the builder

Names of functions/files, the exact trigger SQL, the polling interval, how the badge looks within the tokens.
