# SMS — convenient sending from anywhere — design

Date: 2026-11-11. Status: waiting for the owner's approval. Nothing is built yet.

## Why

SMS through Eskiz works (migration 083, `/sms`), but the client finds it half-finished:
- two kinds of "template" (our saved texts and Eskiz's approved list) — a saved text Eskiz never approved is
  silently not delivered;
- a new template has to be submitted and watched on my.eskiz.uz;
- an approved template must be hand-edited to fit Eskiz's pattern (`%w`, `%d`), easy to get wrong;
- "Reklama / Eslatma" is picked by hand although the template decides it;
- no SMS to one client from Sotuv (the bitim page, the phone number);
- recipients only by Mijoz/Lid and event, not by voronka / bosqich;
- after 21:00 sending is refused; nothing can be sent later.

## Goals (the owner's and the client's words)

1. **Templates live in the platform.** Write a template here → it goes to Eskiz for approval by itself
   (Eskiz API `POST /api/user/template`, field `template`) → its state is shown: Tekshirilmoqda / Tasdiqlandi
   (Eslatma or Reklama) / Rad etildi. Only approved templates can be sent. The kind comes from the template.
2. **Sending from a template is a pick, not editing.** `{ism}` is filled per recipient; any other blank
   (sana, narx, …) is a small field to fill once. The text always fits the approved pattern.
3. **SMS from Sotuv** (the client's screenshots):
   - the bitim composer gets a third tab **SMS** beside Izoh / Vazifa: pick a template, see the text with the
     client's name, send;
   - tapping the client's **phone number** on the bitim page opens a small menu: Qo'ng'iroq qilish · SMS
     yuborish · Nusxalash (SMS yuborish opens the SMS tab);
   - sent SMS and their delivery show in the bitim feed.
   - The same send is offered on the Mijozlar card's SMS tab.
4. **Recipients by voronka and bosqich** on the bulk page, besides Mijoz/Lid, event and search.
5. **Send later:** "Hozir" or a date + time. A send outside 9:00–21:00 is not refused — it goes at the next
   9:00. A scheduled send can be cancelled from Tarix until it starts.

## Non-goals

- Free-text SMS that skips Eskiz approval (Eskiz wouldn't deliver it anyway).
- Deleting templates inside Eskiz (no API for it); a template can be hidden here.
- Recurring/automatic SMS (birthday, "1 day before the event") — a later step if wanted.

## How it works

### Templates (`sms_templates` reused, new migration `095`)

- Columns added: `eskiz_id`, `status` (`draft` / `moderation` / `approved` / `rejected`), `kind`
  (`promo`/`reminder`, from Eskiz: `reklama` → promo, `service` → reminder), `pattern` (what was sent to
  Eskiz), `hidden`, `checked_at`.
- Writing a template: plain text with blanks in braces — `{ism}` and any `{nom}` the author makes up
  (e.g. `{sana}`). **Our call:** sent to Eskiz with `{ism}` → `%w` and every other blank → `%w{1,10}`.
- amo-sync submits drafts to Eskiz and re-reads Eskiz's template list every 10 minutes (and when the page asks)
  to update states; templates already approved on my.eskiz.uz before this are imported as approved (title =
  the first words), so nothing that works today disappears.
- Old saved texts (today's `sms_templates` rows) become drafts; the author sends each to Eskiz with one tap.

### Sending

- `send_sms` gets a template id, the blanks' values, the clients and an optional send time (new signature;
  the old one kept as a wrapper until the old page is gone). It builds the text (blanks + `{ism}` = first
  name), refuses a template that isn't approved, and stores `send_at` on the campaign. The promo opt-out
  stays.
- Who may send: the `sms` module as now; **our call:** a user with Sotuv bo'limi may send to **one** client
  (the bitim / card case), not bulk.
- amo-sync sends queued messages whose `send_at` has come, only 9:00–21:00 Tashkent (unchanged), so a late
  send simply waits for the morning. Cancelling = the campaign's still-queued messages become `cancelled`.

### Screens

- **SMS page:** tabs **Yuborish · Shablonlar · Tarix**.
  - Yuborish: template picker (approved only, grouped Eslatma / Reklama) → blanks → preview with a real
    name → recipients (Mijoz/Lid · voronka · bosqich · tadbir · search) → Hozir / Vaqtini tanlash → send.
  - Shablonlar: list with state badges, "+ Yangi shablon", "Eskiz'ga yuborish" on drafts, hide.
  - Tarix: as now, plus the scheduled time and "Bekor qilish" on scheduled sends.
- **Bitim page:** composer tab SMS; the phone-number menu; SMS rows in the feed (text, time, author,
  Yetkazildi / Yo'lda / Xato).
- **Mijozlar card:** the SMS tab gets the same send block above its list.
- Phone layouts follow the app's mobile rules (sheets, sticky primary button).

## Constraints

CLAUDE.md rules; new migration + SQL test on a throwaway Postgres; backup before applying; bun, strict TS;
Uzbek copy; Eskiz credentials stay in amo-sync (the browser never talks to Eskiz).

## Calls settled after the builder check (all **our call**)

- **Eskiz's blank syntax:** checked 2026-11-11 against the account's 12 newest templates (read only): all
  `service`, mostly fixed texts, one with a plain `%w`; earlier work saw `%w{1,15}` accepted. So `{ism}` → `%w`,
  other blanks → `%w{1,10}`. A fixed text (no blanks) is the common case and needs nothing.
- **Matching our rows to Eskiz:** the list returns `id`, `template`, `original_text`, `status`; the submit
  response isn't relied on. After submitting, the next list read links our row by the pattern text
  (whitespace-insensitive). A rejected template is edited and re-submitted as a new draft.
- **Sotuv users:** may read approved templates and the SMS history of a client they can see, and send to one
  client at a time (send function checks: `sms` module, or Sotuv bo'limi with exactly one client). No access to
  the SMS page itself.
- **Bitim feed:** SMS are read from `sms_messages` by the bitim's client (bulk sends included, marked "Ommaviy");
  a client with two bitimlar sees the same SMS in both — it is the client's history. Live via the realtime
  publication.
- **Scheduled sends:** the recipient list and the opt-out are fixed when the send is made; a send time in the
  past = now; 21:00–9:00 waits for 9:00. Cancel = still-queued messages become `cancelled`.
- **Existing texts:** old saved texts that match an approved Eskiz template's text are merged into it; the rest
  become drafts. `fitsTemplate` stays as the final check before sending.

## Open for the builder

Exact column names, the sync interval, how blanks are rendered as inputs, the cancel window details.
