# FY-System MCP connector for Claude — design

Date: 2026-11-10. Status: draft for approval.

Legend: **[user]** = decided by the owner in conversation. **[call]** = the
designer's decision, open to override. **[builder]** = left to whoever plans
and builds it.

## 1. Intent

The team already uses a Meta Ads MCP in Claude: instead of asking the
targetologist for numbers and pasting them into Claude, they tell Claude to
look at the ad account itself, and Claude — which knows the project and wrote
the creatives — analyses and recommends.

They want the same for their own CRM (FY-System): Claude reads the sales
numbers itself, groups clients, and sends SMS to a group. "Make the dialogue
between our CRM and Claude easy." **[user]**

The highest-value question is the one that needs both connectors at once:
*which ad brings leads that actually buy* — spend from the Meta Ads MCP, outcome
from this one. **[call]**

## 2. Goals

1. **Cloud connector.** One HTTPS URL, added in Claude through
   Customize → Connectors → Add custom connector. Nothing installed. Works in
   claude.ai, Desktop, mobile, Claude Code. **[user]**
2. **Every staff member can connect, with exactly their platform rights.** They
   sign in with their platform e-mail and password; Claude sees and does only
   what that person can in the web app. A deactivated or deleted staff member
   loses access. **[user]**
3. **Statistics** — leads per day, how fast sellers make first contact, and the
   numbers the platform already computes (dashboard, call analysis, finance).
   **[user]**
4. **Segmentation** — pick clients by conditions. **[user]**
5. **SMS to a segment, sent by Claude itself.** **[user]**
6. **Ad attribution on leads**, so goal 1's "which ad sells" can be answered.
   **[call]**

## 3. Non-goals (v1)

- Writes other than SMS: no tasks, notes, stage moves, new bitimlar, payments,
  expenses, refunds, cashback. Later versions.
- Telegram, telephony, Vazifalar, events management.
- Ad spend: comes from the Meta Ads MCP, not stored here.
- Showing attribution in the web UI.
- A UI to list/revoke Claude connections (admin can deactivate the user; see §6).
- Listing in Anthropic's connector directory. MCP resources and prompts.

## 4. Anti-goals — failure even if it works

The owner had no list; these are **[call]**.

- Claude ever shows or does more than the signed-in person could in the web app.
- An SMS goes to the wrong or an unexpectedly large group.
- Text written by an outsider (lead form answers, notes, call transcripts)
  steers Claude into an action. v1 keeps money out entirely; SMS is the only
  write and is fenced (§8).
- The running system breaks: no GoTrue upgrade, no edits to existing functions'
  behaviour for the web, no edits to existing migration files.
- Claude reports a "0" that really means "no permission" (§7.3).

## 5. Constraints and verified facts

Checked on 2026-11-10 against Claude's connector docs
(claude.com/docs/connectors/custom/remote-mcp, …/building/authentication):

- Custom connectors by URL exist on Free (one connector), Pro, Max, Ultra, Team,
  Enterprise. On Team/Enterprise an Owner adds it for the org; members connect
  with their own account.
- Requests come from Anthropic's cloud (`160.79.104.0/21`), never the user's
  device — for the MCP endpoint and for OAuth discovery/token calls.
- OAuth, as Claude's client requires it:
  - Unauthenticated request → **`401`** with
    `WWW-Authenticate: Bearer resource_metadata="<url>"` (ignored on a 200).
  - Protected-resource metadata (RFC 9728): `resource` must equal the MCP URL
    exactly as typed; only the first `authorization_servers` entry is used.
  - Authorization-server metadata (RFC 8414) at the issuer's `/.well-known/`
    path; must advertise `code_challenge_methods_supported: ["S256"]`.
  - Client registration: Dynamic Client Registration (`registration_endpoint`),
    or CIMD (needs `client_id_metadata_document_supported: true` and `"none"`
    in `token_endpoint_auth_methods_supported`). Claude is a public client.
  - PKCE S256 on every authorization request.
  - Redirect URIs: `https://claude.ai/api/mcp/auth_callback` (web, Desktop,
    mobile, Cowork) and, for Claude Code, loopback `http://localhost/callback`
    and `http://127.0.0.1/callback` **on any port**.
  - Token endpoint takes `application/x-www-form-urlencoded`; registration takes
    JSON. Refresh tokens must rotate; an invalid one answers `invalid_grant`.
    `offline_access` in `scopes_supported` makes Claude ask for a refresh token.
  - Discovery, registration and token endpoints must answer within 10 s.
- "Research" mode can call connector tools without per-call approval — the SMS
  fence in §8 must hold without a human click.

Checked on the VM: `supabase/gotrue:v2.143.0`, `postgrest:v12.0.2`. This GoTrue
cannot act as an OAuth authorization server. It will not be upgraded. **[call]**

From the repo (migrations up to `090`):

- `amo-sync` is a Bun service with one `Bun.serve` handler (`src/intake.ts`),
  reached through the gateway's `location /hooks/`. It talks to Postgres only as
  the owner role (postgres.js, `DATABASE_URL`) — nothing in the repo runs a
  query *as a user* yet. It already verifies Supabase JWTs with `JWT_SECRET`
  (`verifyJwt`, `src/pbx.ts`).
- Ready functions, each with its own permission guard: `sales_dashboard`
  (module `dashboard`), `call_analysis_stats` (`sotuv-crmn`; non-managers get
  their own row), `finance_summary` / `finance_debtors` / `event_profit`
  (`tadbirlar-moliya`), `send_sms(p_kind, p_text, p_client_ids uuid[])` (`sms`;
  9:00–21:00 Tashkent; `promo` skips `sms_opt_out`; no cap on recipients).
- **The three finance functions return zeros / no rows without permission —
  they do not raise.**
- No "time to first contact" metric exists anywhere.
- SMS recipient selection is done in the browser (all clients loaded, filtered
  client-side). No DB function selects recipients.
- Lead attribution is not captured: Meta leads keep only `leadgen_id`/`form_id`,
  and only in `webhook_logs.raw_body`; no `ad_id`/`campaign_id` is requested.
  No UTM handling; URL query params other than `token`/`voronka` are ignored.
- `crm_calls` has no "answered" column: answered = `talk_time > 0`.
  `crm_leads.created_by IS NULL` marks an intake lead (form or call).
- The API host sits behind Cloudflare → Traefik → `supabase-nginx-1`. A silent
  socket is cut at ~126 s; Cloudflare caches GET answers for hours.

## 6. Architecture

```
Claude (Anthropic cloud)
   │  HTTPS  https://api.fikryetakchilari.uz/mcp
   ▼
Cloudflare → Traefik → supabase-nginx-1
   │  new locations: /mcp…  and  /.well-known/oauth-…
   ▼
fy-amo-sync (Bun)            ── login check ──▶ GoTrue (auth:9999, password grant)
   ├─ OAuth endpoints + login page
   ├─ MCP endpoint (Streamable HTTP)
   └─ every tool call ──▶ Postgres, inside a transaction switched to the user
```

**Where it lives: inside `amo-sync`.** **[call]** It already has the HTTP
server, `JWT_SECRET`, the DB driver, the Docker network that reaches GoTrue and
Postgres by name, and a deploy routine. A separate container buys nothing yet.

**Public URL: `https://api.fikryetakchilari.uz/mcp`.** **[call]** OAuth
endpoints live under `/mcp/…`; the two metadata documents are served where the
RFCs put them (builder picks exact paths consistent with the issuer URL). The
gateway gets locations for `/mcp` and `/.well-known/oauth-` proxied to amo-sync
the same way `/hooks/` is (Docker DNS resolver + variable in `proxy_pass`).
Known trap from CLAUDE.md: the gateway's `nginx.conf` is a single-file bind
mount — after editing, `docker restart supabase-nginx-1`, not reload.

**Transport: stateless, plain JSON responses** (no long-lived SSE stream).
**[call]** Reason: the 126 s idle cut on this path, and nothing in v1 needs
server-initiated messages. Every answer on `/mcp` and the OAuth endpoints sends
`Cache-Control: no-store` (Cloudflare).

**Library: the official `@modelcontextprotocol/sdk`** if its Streamable HTTP
transport runs cleanly under `Bun.serve` (web-standard Request/Response);
otherwise hand-roll the three JSON-RPC methods needed (`initialize`,
`tools/list`, `tools/call`). **[builder]** — check current SDK docs first.

### 6.1 Sign-in (a small OAuth authorization server of our own)

**[call]** throughout; the shape is forced by §5.

- **Registration:** Dynamic Client Registration, stateless. The only redirect
  URIs ever accepted — at registration and again at authorize — are the three in
  §5 (loopback matched port-agnostically). Since nothing else can be a redirect
  target, registered clients need not be stored. CIMD is optional. **[builder]**
- **Authorize:** a login page in Uzbek, served by amo-sync, styled plainly in the
  platform's look. It names who is asking (the redirect host). The user types
  their platform e-mail and password; amo-sync checks them against GoTrue's
  password grant, then requires a `profiles` row with `is_active = true`
  (club members have no `profiles` row and are refused). Failed attempts are
  throttled per e-mail (5 per 15 min). The password is never stored or logged.
- **Code → tokens:** one-time authorization code (≤ 60 s, bound to client,
  redirect URI and PKCE challenge). Access token 1 h; refresh token 60 days,
  rotated on every use; reuse of a rotated refresh token revokes that
  connection. Tokens are opaque random strings; only their SHA-256 is stored.
- **Storage:** new table(s) for codes and tokens — RLS on, no policies, written
  only by amo-sync (same pattern as `task_reminders`). FK to `profiles`
  `ON DELETE CASCADE`, so `admin_delete_user` keeps working and removes the
  connection.
- **Every request** re-checks `is_active`; a deactivated user gets `401`.
  A password change does not disconnect Claude in v1 (accepted; deactivate to
  cut access).

### 6.2 Acting as the user — the security core

Every tool runs its SQL inside one transaction that first switches to the API
role and sets the caller's identity — the same thing PostgREST does:

```sql
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true);
```

so `auth.uid()`, RLS, `has_permission()`, `is_admin()`, `is_manager()` and the
062 "API role" guards all behave exactly as for the web app. **[call]**

Hard rule: the MCP module receives **only** an `asUser(uid, fn)` helper, never
the raw owner connection. A tool that forgot the switch would run as the owner
and bypass everything — so the code shape must make that impossible, and a test
must prove a seller's token cannot read finance or another seller's call
analyses. (Alternative with the same effect: mint a short-lived JWT and call
PostgREST. Builder may switch if the transaction approach hits a wall, keeping
the rule and the test.)

### 6.3 Audit

One row per tool call: who, which tool, arguments (SMS text included), when,
ok/error. amo-sync-only table. No UI in v1. **[call]** — client data is leaving
for an outside AI; there must be a record of who pulled what.

## 7. Tools

Names and exact parameters are **[builder]**; the set and behaviour are fixed
here. All take Tashkent dates. Lists are paged (default 50, max 200).

| Tool | Returns | Backed by | Needs |
|---|---|---|---|
| who am I | name, role, modules I can use | `profiles`, permissions | signed in |
| reference | voronkalar + bosqichlar, events, sellers, lead sources | tables | per table RLS |
| sales stats | KPIs + previous period, funnel, by source, by voronka, daily, sellers, calls, attention | `sales_dashboard` | `dashboard` |
| first-contact stats | §7.1 | **new function** | `dashboard`; the lead list needs `sotuv-crmn` |
| ad stats | §9.3 | **new function** | `dashboard` |
| call analysis stats | per seller: calls, average score, weekly trend, top mistakes | `call_analysis_stats` | `sotuv-crmn` |
| call analysis (one) | transcript, summary, score, criteria, mistakes, advice | `crm_call_analyses` | RLS (own calls; managers all) |
| finance summary | income, expense, net, debt, overdue, agreed, collected | `finance_summary` | `tadbirlar-moliya` |
| debtors | the Qarzdorlar list | `finance_debtors` | `tadbirlar-moliya` |
| event results | per event agreed / collected / debt / expense / profit | `event_profit` | `tadbirlar-moliya` |
| find clients / client card | search by name or phone; one client with bitimlar, participations, SMS | tables | RLS |
| find bitimlar / bitim | filter by voronka, stage, owner, source, dates, state; one bitim with form answers, feed, tasks, calls | tables | `sotuv-crmn` (RLS) |
| segment | §7.2 | **new function** | RLS + per-filter |
| SMS templates | Eskiz-approved texts | existing Eskiz read in amo-sync | `sms` |
| SMS preview | §8 | new | `sms` |
| SMS send | §8 | `send_sms` | `sms` |
| SMS history | campaigns with queued / sent / delivered / failed | `sms_campaign_stats` | `sms` |

Read tools are marked read-only in their MCP annotations; SMS send is not.

`tools/list` shows a user only the tools their modules allow; the DB guards stay
the real gate. **[call]**

The server's `instructions` text gives Claude the vocabulary in a few lines:
Bitim, Voronka, Bosqich; a *lid* becomes a *mijoz* after a won bitim or an event;
money is so'm; days are Asia/Tashkent; numbers start 2026-09-30. **[call]**

Free text that outsiders wrote (form answers, notes, transcripts, client names)
is returned in clearly labelled data fields, never mixed into instructions or
tool descriptions. **[call]**

### 7.1 First-contact time (new)

For leads created in the period:

- **Clock starts** at `crm_leads.created_at`.
- **First attempt** = first outgoing call to the lead's client phone at or after
  that moment, by anyone. **First conversation** = first such call with
  `talk_time > 0`, or an answered incoming call from that phone.
- Leads opened by hand (`created_by` not NULL) are excluded — the seller was
  already in contact.
- A lead opened by an incoming call that was **answered** counts as contacted at
  0 and is reported separately, not averaged in; a **missed** one runs from the
  call to the first outgoing call.
- Returned: count, median and average minutes to first attempt and to first
  conversation, share within 5 min / 15 min / 1 h / same day, and how many are
  still uncontacted — overall, per seller (`responsible_user_id`), per source,
  per day. Plus the oldest uncontacted leads (name, phone, age) for callers with
  `sotuv-crmn`.
- Calendar time in v1; night leads inflate the average, which is why the median
  and the buckets lead. A working-hours variant is a later option. **[call]**

All of the above is **[call]** — the owner asked for "how long until sellers
make contact" and nothing more specific.

### 7.2 Segmentation (new)

A DB function that takes filters and returns the matching clients (one row per
phone-bearing client) and the count. Runs with the caller's rights.

Filters, combinable **[call]**: customer / lead / all (`is_customer`); took part
in event X / did not; has debt / overdue debt (needs `tadbirlar-moliya`, else a
clear refusal); has a bitim in voronka X / stage X / open, won or lost; lead
source; client or bitim created between dates; no-show; name/phone search.
Always reported alongside: how many have no phone, how many opted out of promo.

The same filter object is what SMS preview and send take, so the group Claude
shows is the group that gets sent.

### 7.3 "No access" is never "zero"

Because the finance functions return zeros silently, the MCP layer checks the
module itself before calling them and answers with an explicit "you have no
access to Moliya" error. Same for every tool: a permission failure is an error
message Claude can relay, never an empty result. **[call]**

## 8. SMS

Claude sends by itself **[user]**. The existing rules stay untouched: `sms`
module, 9:00–21:00 Tashkent, `promo` skips opted-out clients, only texts Eskiz
has approved are delivered.

Fence **[call]**:

1. **Two steps, enforced by the server.** *Preview* takes a segment (or an
   explicit short list of client ids), the kind and the text, and returns: how
   many will receive it, how many are skipped (no phone, opted out), three
   rendered examples with `{ism}` filled, whether the text fits an approved
   Eskiz template, and a short-lived **confirmation token** bound to this user,
   this exact group and this exact text. *Send* requires that token and
   re-evaluates the group; if the count changed, it refuses and asks for a new
   preview.
2. **Caps:** 300 recipients per send, 1 000 per person per day through Claude.
   Both are plain constants the owner can change.
3. **Marked:** the campaign records that it was sent through Claude, and SMS →
   Tarix in the web app shows it.
4. A text that fits no approved template is refused at preview with the reason,
   rather than queued to fail at Eskiz.

How the "via Claude" mark is stored (a new column plus a new function or
parameter — never an edit to migration `083`) and where the template-fit check
is shared with the web's `fitsTemplate` are **[builder]**.

## 9. Ad attribution on leads

Data only exists from the day capture starts, so **this ships first**. **[call]**

### 9.1 Capture

- **Meta lead ads:** ask the Graph API for the lead's ad, ad set and campaign
  (ids and names), platform, and organic flag, alongside the answers it already
  fetches.
  **Risk to verify on a real lead before building on it:** these fields can come
  back empty when the page token lacks ad-account rights. If they do, the owner
  must grant the token those rights in Meta — the code cannot fix that.
- **Site / Tilda / Framer forms:** take `utm_source`, `utm_medium`,
  `utm_campaign`, `utm_content`, `utm_term`, `fbclid` from the posted body **or**
  the URL query. They stop landing in "Forma javoblari". The ready-made prompt
  that Voronka sozlamalari copies for site builders is extended to pass them.
- **Stored** in a new `crm_leads` column (jsonb), set once when the bitim is
  opened; a repeat request on an open bitim records its attribution on the
  "Qayta murojaat" feed row instead of overwriting.

### 9.2 Backfill

Old Meta leads' `leadgen_id` is in `webhook_logs`; Meta keeps leads 90 days and
our numbers start 2026-09-30, so a one-off re-query can fill the history —
**if** §9.1's risk check shows the fields come back. **[builder]** decides after
that check.

### 9.3 Ad stats (new)

Per campaign → ad set → ad (Meta) and per utm source/campaign (sites), for leads
created in the period: leads, open, won, lost, sum of won bitim prices, and
first-contact median. Ids are Meta's own, so Claude can join them to spend from
the Meta Ads MCP. Cash actually collected per ad is **not** in v1 — payments
hang off event participation, not the bitim, and that link needs its own
design. **[call]**

## 10. Build order

Each step is usable on its own. **[call]**

1. **Attribution capture** (§9.1) + the Meta field check.
2. **Connector skeleton:** gateway locations, OAuth + login page, `asUser`,
   audit, *who am I*, *reference*, and the tools backed by ready functions
   (sales, call analysis, finance). First real connection from claude.ai.
3. **Find / card tools** and **first-contact stats**.
4. **Segmentation** and **SMS**.
5. **Ad stats** (+ backfill if possible).

## 11. Verification

- SQL behaviour tests in `supabase/tests/` for each new function, on a throwaway
  DB as CLAUDE.md describes, each shown to fail on the wrong logic first.
- `bun test` in amo-sync for: PKCE, one-time code, redirect allow-list (a foreign
  redirect URI is refused), refresh rotation and reuse, login throttle, the SMS
  confirmation token, and **isolation** — a seller token cannot read finance, a
  deactivated user is refused, no tool reaches the owner connection.
- End to end, by hand: add the URL as a custom connector on claude.ai; sign in
  as an admin and as a seller; compare three numbers with the web Dashboard;
  preview and send one SMS to a single test client.
- Confirm Cloudflare does not challenge Anthropic's range on `/mcp` and the
  OAuth paths.

## 12. Operations

- Migrations `091+`, applied to production by hand (CLAUDE.md §5), PostgREST
  cache refreshed.
- amo-sync redeploy; new env only if needed (GoTrue's internal address, the
  public base URL) — added to `~/amo-sync/.env` and Doppler, never committed.
- Gateway `nginx.conf` edit + container restart.
- CLAUDE.md gets a section for the connector once it ships.

## 13. Open questions for the owner

1. SMS caps: 300 per send and 1 000 per person per day — right numbers?
2. If Meta returns no ad fields for our token, will you grant the page token
   ad-account access in Meta Business?
