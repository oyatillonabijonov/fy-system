# Client fills in their own card (anketa link) — design

Date: 2026-11-12. Status: waiting for the owner's approval. Nothing is built yet.

## Why

Every client should have a complete card: photo, correctly spelled name, company, position, field of work
(Mijozlar already flags missing ones in red — `missingInfo` in `src/components/pages/Mijozlar.tsx`). Today
staff ask each person for these by phone/Telegram and type them in — slow. The owner wants the client to fill
them in themselves through a link, and staff to **check and approve** what comes back. An approved person
becomes a **Mijoz** (shows in Mijozlar) — so the customer base grows with complete cards.

## Goals (the owner's words, made concrete)

1. **A personal link per client** (lead or customer). Opens a page pre-filled with what we already know
   (site forms already fill the card through `fill_client_from_fields`, 081). The client corrects what is wrong
   (e.g. a misspelled name) and adds what is missing (photo…). Nothing already known has to be typed again.
2. **One universal link** for people not in the system yet (e.g. a QR code at an event): the same page, empty,
   plus a phone field.
3. **Nothing reaches the card until staff approve it.** Staff see old → new side by side; **Tasdiqlash**
   writes it to the card, **Rad etish** throws it away.
4. **Biriktirish:** a universal-link submission is matched by phone to an existing client (one client per
   phone, 057) and attached to them on approval; no match → a new client is created on approval.
5. **Approved = Mijoz**, even without a won bitim or an event.

Fields (agreed with the owner 2026-11-12, no more): **rasm, ism-familiya, kompaniya, lavozim, soha/faoliyat**
(+ telefon on the universal link only).

## Non-goals

- No client login / account (members' mobile app is separate and untouched).
- No other fields (birthday, Instagram, email…) — the owner said these five are enough.
- No automatic approval.
- Not fixing the pre-existing storage hole (see "Noticed, out of scope").

## Anti-goals (would make it a failure even if it works)

- A link that lets someone read or change **another** client's data, or see more than these five fields.
- A submission silently overwriting a card without a staff click.
- Losing a submission (client filled it in, nobody can find it).
- The public page looking like a phishing page — it must look like the platform's own Login page.

## How it works

### Data (migration `097`; `096` is taken by loss_reason)

- `client_profile_links` — `token` (random, ≥ 22 url-safe chars, unique), `client_id` (NULL = the universal
  link), `created_by`, `created_at`, `expires_at` (personal: +30 days; universal: NULL = no expiry),
  `closed_at` (set when its submission is approved, or when regenerated). One open personal link per client:
  "Havola olish" returns the open one, or makes a new one if none/expired. The universal link: one row,
  admins can regenerate it (old one closes).
- `client_profile_submissions` — `link_id`, `client_id` (personal link: its client; universal: the phone
  match at submit time, may be NULL), `phone` (universal only, normalised like `clients.phone`),
  `full_name`, `company`, `role`, `activity`, `photo_path`, `status` (`pending` / `approved` / `rejected`),
  `reviewed_by`, `reviewed_at`, `created_at`. A personal link has at most one `pending` submission —
  submitting again replaces it (the client fixes a typo). Universal: one `pending` per phone, same rule.
- `clients.profile_confirmed_at timestamptz` — set on approval. `is_customer(clients)` (077) gains
  `OR c.profile_confirmed_at IS NOT NULL` (new migration redefines the function; 077 is not edited).
- RLS on both tables; staff read/act per "Who" below; the anonymous role touches them only through the two
  public functions.

### Public functions (anon, SECURITY DEFINER, `SET search_path`)

- `anketa_open(token)` → for a valid open link: `{kind: personal|universal, full_name, company, role,
  activity, image, phone_masked}` from the client card (personal) or empty (universal); if a pending
  submission exists for a personal link, its values instead (so the client sees what they sent). Expired /
  closed / unknown → one generic "link is not valid" error (no hint which).
- `anketa_submit(token, payload)` → validates: name required (2–100 chars), other text fields ≤ 150 chars,
  universal requires a valid Uzbek phone, `photo_path` (optional) must start with `anketa/<token>/`.
  Writes/replaces the pending submission. Returns ok. Abuse limit (my call): a personal link at most 20
  submissions per hour; the universal link at most 10 per hour **per visitor IP** and 1000 per hour in total
  (an event QR scanned by a crowd must not be refused) — beyond that, a polite "keyinroq urinib ko'ring". The
  IP is read by the page's server side from `CF-Connecting-IP` (so the submit goes through amo-sync's
  `/hooks/anketa/*`, which calls the SQL function as the owner; `anketa_open` can stay a plain anon RPC), and
  the page has a hidden honeypot field — filled = silently dropped. No CAPTCHA.

### Photo

The page lets the client take/pick a photo, crops it square (reuse `ui/ImageCropModal`), shrinks to a JPEG
≤ 1000 px, and uploads it with the anon key to the public `client-images` bucket under
`anketa/<token>/<random>.jpg` (the bucket already accepts uploads — see "Noticed"). On approval
`clients.image` becomes that file's public URL. Rejected photos stay as orphan files (small; acceptable).

### Public page `/anketa/:token`

- Route outside `ProtectedRoute`, like `/login`; same look as Login (photo ground, DM Sans, white card),
  mobile-first, Uzbek copy. Title: "Fikr Yetakchilari — ma'lumotlaringiz".
- Shows the photo (tap to change), then the four text fields pre-filled; universal link adds Telefon.
  Personal link shows the masked phone read-only ("+998 90 *** 45 67") so the client knows it's theirs.
- One button "Yuborish" → success screen "Rahmat! Ma'lumotlaringiz yuborildi." Reopening the link shows the
  sent values and lets them send again until approved; after approval the link says it is closed.

### Staff side

- **Getting a link:** a "Anketa havolasi" button on the bitim page (next to the client's name) and in the
  Mijozlar client card → small menu: Nusxalash · SMS yuborish. SMS uses the normal `SmsSend` flow: a template
  with the blank `{havola}` gets it filled automatically with this client's link (like `{ism}`), so staff
  type nothing. The template itself still needs Eskiz approval (095 flow).
- **Universal link:** Sozlamalar → Integratsiyalar → a "Umumiy anketa havolasi" row: copy, show as QR
  (for printing at events), regenerate (admin).
- **Reviewing:** Mijozlar gets a tab **Anketalar (N)** (N = pending). Each row: photo, name, phone, where it
  came from (personal link / umumiy), when. Opening one shows old → new per field (changed fields
  highlighted), the client it attaches to (universal: "Bor mijoz: <name>" or "Yangi mijoz ochiladi"), and
  **Tasdiqlash** / **Rad etish**. Staff may correct the four text fields in the sheet before approving (my
  call — saves a reject-and-resend loop over a typo; the photo can only be taken or left). Approve writes
  every non-empty field over the card (`full_name`, `company`, `role`, `activity`, `image`), sets
  `profile_confirmed_at`, closes the link — one RPC `approve_profile_submission(id, overrides)`, one
  transaction. Reject: `reject_profile_submission(id)`; the link stays open so the client can send again;
  the client is not told (reopening shows the card values again). Rejected and approved rows stay visible
  under a "Ko'rib chiqilgan" filter in the tab.
- **Matching at approval (my call):** a universal submission is matched by phone **again at approval time**
  (the stored `client_id` is only the hint shown in the list) — so a client created meanwhile is attached to,
  never duplicated (057). No match → a new client with `source = 'anketa'`. When one client has two pending
  submissions (personal + universal), approving one marks the other `rejected` automatically.
- **A lead with an open bitim** becomes a Mijoz on approval (as the owner asked); the bitim stays open in
  Sotuv as before.
- The bitim page and the client card show "Anketa yuborildi — tekshirish" when a pending one exists, linking
  to it.
- **Notice:** a new submission shows the in-app "Yangi anketa" toast through `LiveSync` (table added to the
  realtime publication and `TOUCHES`), shown only to users with `mijozlar`. No Telegram.

### Who (my call — the owner can change it)

- Get / copy a personal link: anyone with `mijozlar` **or** `sotuv-crmn` (sellers work with leads). The
  "SMS yuborish" item follows the existing SMS rights (095: `sms` module, or `sotuv-crmn` for one client) and
  is hidden for anyone without them — SMS rights are not widened.
- See and approve/reject submissions: anyone with `mijozlar` (approval moves a person into Mijozlar).
- Regenerate the universal link: admins.

## Constraints

- Strict TS, bun, migrations only added (`097`…), SQL tests in `supabase/tests/097_…` on the throwaway DB,
  failing on the old code first. Back up prod before applying.
- Existing flows untouched: `fill_client_from_fields`, 057 phone uniqueness, 084 copy to
  participations (approval updates `clients`, so participations follow automatically).
- Card writes by approval go through the normal `clients` triggers (phone normalising, 084 copy).

## Left to the builder

- Exact UI layout of the Anketalar tab and the review sheet (follow existing Mijozlar / `Sheet` patterns).
- Token generation details, index names, error codes.
- Whether Eskiz accepts a full URL in a `%w` blank; if not, the `{havola}` template keeps the domain
  literal ("https://app.fikryetakchilari.uz/anketa/{havola}") and the blank is filled with the token only.
- Rate-limit mechanism (a count over `client_profile_submissions` by `created_at` is enough).

## Noticed, out of scope

- The `client-images` storage policy (025, "client-images all") has no role restriction: anyone holding the
  public anon key can upload **or overwrite** any client's photo (`<clientId>.jpg`, upsert). This feature
  relies on anon upload only under `anketa/`; tightening the policy to "staff anywhere, anon only under
  `anketa/<valid token>/`, no anon update/delete" is a worthwhile follow-up.
