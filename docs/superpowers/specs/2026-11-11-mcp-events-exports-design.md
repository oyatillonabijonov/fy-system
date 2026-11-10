# Claude connector, stage 2 — events and design materials

Date: 2026-11-11. Status: draft for approval. Builds on
`2026-11-10-crm-mcp-design.md` (the connector itself — read its §4, §6, §7.3 first).

Legend: **[user]** = decided by the owner. **[call]** = the designer's decision,
open to override. **[builder]** = left to whoever plans and builds it.

## 1. Intent

The connector is live and read-only. The owner now wants Claude to *do* event
work: "create an event, assign the responsible person — automate what belongs to
an event", with full permission, and to export the design materials freely.
**[user]**

## 2. Goals

1. **Create an event** from a conversation: name, dates, place, responsible
   person, cashback %, plan, tariffs. When something required is missing, Claude
   asks — it never invents a date, a person or a price. **[user]**
2. **Edit an event** — any of those fields, including tariffs and the responsible
   person. **[user]**
3. **Delete an event only after an explicit confirmation.** **[user]**
4. **Copy the task list** of an earlier event into a new one. **[user]**
5. **Enrol a participant** into an event (tariff, seller; existing client or a
   new one). No payments. **[user]**
6. **Link a sales voronka to an event** — admins only, as in the platform. **[user]**
7. **Export name stickers and venue signs** as PDF, looking exactly like the
   platform's own. **[user]**

## 3. Non-goals

- **Booklet export** — stays in the platform (it is rendered by the browser and
  cannot run on the server as is). **[user]** Claude points to the Tadbirlar page.
- Payments, refunds, expenses, cashback, no-show settlement — still out.
- Editing or removing participants, reordering them, uploading photos.
- Tasks beyond copying a list (creating/closing single tasks).
- Deleting anything other than an event.

## 4. Anti-goals

- An event is created with a guessed date, person or tariff.
- An event disappears without the user having said yes to *that* event.
- Claude does through the connector what the person could not do in the web app.
- A PDF that looks different from the platform's.
- The read-only guarantee of the existing nine tools weakens.

## 5. Facts from the code (2026-11-11)

- `events` writes are **plain table writes under RLS** (`is_staff`); the DB does
  not check the `tadbirlar` module — only the web route does. No CHECK
  constraints: required fields, date order and the 0–100 cashback range are
  enforced only by the web form.
- The web form writes `name, date, end_date, location, manager_id,
  cashback_percent, total_value` and the tariffs; it requires name, start date,
  a manager, at least one tariff (name + price each), `end >= start`.
  `manager_id` may be any active staff member.
- `saveEventTariffs` is three separate requests (delete the missing, upsert the
  kept, insert the new) — not one transaction. A tariff that participants use
  cannot be deleted (FK).
- Deleting an event cascades to participants, tariffs, tasks and (through
  participants) payments; `trigger_00_guard_participant_has_payments` raises
  `participant_has_payments` when a participant has a live payment, so such an
  event cannot be deleted. Expenses, cashback rows and the voronka link are
  detached (SET NULL).
- `enroll_participant(p_event_id, p_tariff_id, p_seller_id, p_client_id,
  p_full_name, p_phone, p_price)` is the only way to enrol; it raises
  `tariff_mismatch`, `seller_invalid`, `client_exists:<id>:<name>`,
  `client_required`, `already_enrolled`, … `copy_event_tasks(p_from, p_to)`
  copies tasks and their attachments.
- `crm_pipelines` can be written only by admins.
- Faollik (the audit log) is fed by DB triggers and reads `auth.uid()`, so a
  change made through the connector is logged under the signed-in person. The
  web updates live (`events`, `event_tariffs`, `event_participants` are in the
  realtime publication).
- Stickers and signs are drawn with jsPDF vector calls and no DOM
  (`src/lib/stickers/drawStickers.ts`, `src/lib/signs/drawSigns.ts`); only font
  loading and `doc.save()` are browser-specific. Styles: stickers `onyx`,
  `sandstone`, `graphite`, `linen`, `ivory`; signs `signal`, `ember`; nine arrow
  directions. Inputs are plain names / places — no images.

## 6. Design

### 6.1 Writing as the user

`asUser` gains a write mode. A tool declares itself a writer; only then does its
transaction open read-write — every existing tool keeps `READ ONLY`. Everything
else stays: role `authenticated`, the caller's claims, the 8 s timeout, fixed SQL
with bound parameters only. A writer's whole work is **one transaction**: an
event and its tariffs are created together or not at all (better than the web's
three requests). **[call]**

Writers are marked for Claude (`readOnlyHint: false`; delete also
`destructiveHint: true`), so Claude's own approval prompt appears. **[call]**

### 6.2 Who may use the event tools

The `tadbirlar` module, as in the web (admins always). The voronka link: admins
only. The DB would accept an event write from any staff member; the connector
mirrors the web's gate, not the DB's looser one. **[call]**

### 6.3 Tools

| Tool | What it does | Writes |
|---|---|---|
| events | list: name, dates, place, responsible, participant count | no |
| event | one event: fields, tariffs (with ids), participants (name, phone, company, role, tariff, seller — no money), task count, linked voronka | no |
| find clients | search by name or phone → id, name, phone, company (for enrolment) | no |
| create event | §6.4 | yes |
| update event | any field; tariffs as a full list (with id = keep/change, without = new, missing = remove) | yes |
| delete event | §6.5 | yes |
| copy event tasks | from one event to another; refuses when the target already has tasks unless told to add anyway | yes |
| enrol participant | event, tariff, seller (or none), an existing client id **or** name + phone; the RPC's errors come back in plain words (an existing phone returns that client to confirm) | yes |
| link voronka | set or clear a voronka's event (admin) | yes |
| export stickers / export signs | §6.6 | no |

### 6.4 Create event — ask, don't guess

Required: name, start date, responsible person, at least one tariff (name +
price). Optional: end date (`>=` start), place, plan (`total_value`), cashback %
(0–100; default 5, as the web form), and "copy tasks from event X" to do both in
one step. **[call]**

- The tool's description and the server instructions tell Claude: *ask the user
  for anything required that they have not given; never invent it; read the
  result back.* The server refuses a call with a required field missing, so a
  guess cannot be skipped — but only Claude can make sure the value came from
  the user.
- The responsible person is given by id (Claude finds it in `reference` or by
  name and confirms with the user when several match). **[call]**
- **Duplicate guard:** an event with the same name on the same start date is
  refused unless the call says to create it anyway — a retried call must not
  make two events. **[call]**

### 6.5 Delete — two steps, enforced by the server

1. The first call deletes nothing. It returns what would go: the event's name
   and date, how many participants, tasks and tariffs disappear, what gets
   detached, and whether live payments block it — plus a **confirmation token**
   bound to this user and this event, valid 10 minutes.
2. Only a second call carrying that token deletes. The tool's text tells Claude
   to show the summary and get an explicit yes first. If payments block it, the
   answer says so and where to resolve them (Moliya). **[call]**

The token proves two calls happened, not that a human read the summary; Claude's
approval prompt for destructive tools is the second layer.

### 6.6 Stickers and signs

- **Same drawing code as the web.** The worker gets its own copy of the two
  drawing modules (it is built from its own folder and cannot import the web's);
  a test fails when the copies differ beyond import paths, so the looks cannot
  drift. Fonts come from the worker's bundled DM Sans. **[call]**
- **Stickers:** names from an event's participants and/or names given in the
  conversation, a caption (default: the event's name), one of the five styles.
  **Signs:** a list of place + arrow, one of the two styles.
- **Delivery:** the tool returns a **download link** on our own address, valid 15
  minutes, plus the page and item counts. The PDF is made when the tool runs and
  kept in the worker's memory until the link expires (a restart drops it; ask
  again). The link's id is unguessable; it is the only credential. **[call]**
- Exports need the `tadbirlar` module too.

### 6.7 What Claude is told

The server instructions gain a short block: the event tools change real data;
ask before creating when something is missing; delete only after an explicit
yes; exports are links that expire; the booklet is exported in the platform
(Tadbirlar → Dizayn materiallar). **[call]**

## 7. Verification

- DB-backed tests on the throwaway stand for every writer: happy path, each
  refusal, one-transaction behaviour (a bad tariff leaves no event behind), the
  audit row carrying the signed-in person, a seller without `tadbirlar` refused,
  the read tools still unable to write.
- Delete: no token → nothing deleted; wrong user's or expired token refused; a
  live payment blocks with the plain message.
- PDFs: generated under Bun, start with `%PDF`, right page count; the drift
  test; and a by-eye comparison of one sticker sheet and one sign sheet against
  the platform's output before shipping.
- End to end from Claude after rollout: create a test event, edit it, copy
  tasks, export stickers, delete it.

## 8. Rollout

No migration. Merge, redeploy the worker; the gateway already forwards `/mcp…`.
CLAUDE.md's connector note and the team message get the new abilities.
