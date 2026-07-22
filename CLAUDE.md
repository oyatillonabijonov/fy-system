# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 1. Project Summary

FY-System is an internal business management dashboard for the "Fikr Yetakchilari" club. It combines a native CRM pipeline, client management, events with participant finance & cashback, employee/HR management with KPIs and per-module permissions, and an activity audit log. Single-page React app backed entirely by Supabase; all UI copy is in Uzbek.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict, no `any`); Deno TS in edge functions |
| Framework | React 19 + Vite 7, react-router-dom 7, TanStack Query 5 |
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`, no config file) + shadcn/ui (`base-nova`), framer-motion, Geist Variable font |
| Database | Supabase Postgres (migrations `001`–`047`) |
| Auth | Supabase Auth + `profiles` / `user_permissions` tables; roles `admin / manager / xodim` |
| Hosting | Oracle Cloud VM (aarch64, 4 OCPU, 24 GB RAM); frontend via **Coolify** at `https://app.fikryetakchilari.uz`; self-hosted Supabase at `https://api.fikryetakchilari.uz` |
| External APIs | Meta/Framer/Tilda lead webhooks |

Package manager: **bun** (not npm).

---

## 3. Folder Structure

```
/
├── src/
│   ├── App.tsx               # All routes, ProtectedRoute wrapping, AppShell (header/sidebar), PAGE_META
│   ├── main.tsx              # QueryClient defaults, BrowserRouter, AuthProvider
│   ├── components/
│   │   ├── pages/            # One component per route (Dashboard, Mijozlar, CrmN, Events, Hodimlar…)
│   │   ├── layout/           # Sidebar (filters items via hasAccess)
│   │   ├── auth/             # ProtectedRoute
│   │   ├── crm-n/            # Native CRM board/cards/modals
│   │   ├── events/           # Event + participant modals
│   │   ├── cashback/         # Cashback badges/modals
│   │   ├── hodimlar/         # Employee profile & KPI modals
│   │   ├── sozlamalar/       # User creation & permissions modals
│   │   └── ui/               # shadcn components (bunx shadcn@latest add <c>)
│   ├── context/              # AuthContext (useAuth), ThemeContext (data-theme)
│   ├── hooks/                # React Query hooks per feature (useClients, useCrmN, useKpi…)
│   └── lib/
│       ├── supabase/         # client.ts, generated types.ts, queries/ per feature
│       └── constants/        # employee.ts (Department enum mirror, positions)
├── supabase/
│   ├── migrations/           # 001–047, sequential — NEVER edit existing ones
│   ├── tests/                # SQL behaviour tests per migration (throwaway DB only)
│   └── functions/            # admin-create-user, admin-create-member, framer/meta/tilda-webhook
├── Dockerfile                # Coolify build: bun builder → nginx:alpine; VITE_* passed as ARG (build-time)
├── nginx.conf                # SPA fallback (try_files → index.html) + gzip
└── vite.config.ts            # Port 5001, @ alias
```

---

## 4. Environment Variables

Frontend (`.env.local`; switch files: `.env.local.local` = local stack, `.env.cloud.backup` = cloud):

```bash
# Required
VITE_SUPABASE_URL=         # Supabase project URL
VITE_SUPABASE_ANON_KEY=    # Supabase anon key
```

Edge functions (Supabase secrets; `SUPABASE_*` are auto-provided):

```bash
SUPABASE_URL= / SUPABASE_ANON_KEY= / SUPABASE_SERVICE_ROLE_KEY=
META_PAGE_ACCESS_TOKEN=       # meta-webhook: fetch lead details
META_WEBHOOK_VERIFY_TOKEN=    # meta-webhook: GET verification
CRM_DEFAULT_PIPELINE_ID=      # webhooks: where new leads land
CRM_DEFAULT_STAGE_ID=
```

Never create `.env*` files with real values.

---

## 5. Running the Project

```bash
# Install
bun install

# Development (port 5001, auto-opens)
bun run dev              # uses local .env.local (production backend)
# Env-switched dev via Doppler (envs injected, no .env file needed):
bun run dev:local        # Doppler config dev → local Supabase (127.0.0.1:54321)
bun run dev:cloud        # Doppler config stg → cloud (ulbdlkkftbzgafsrprnm.supabase.co)
bun run dev:prod         # Doppler config prd → production (api.fikryetakchilari.uz)

# Build / lint (build fails on type errors: tsc -b && vite build)
bun run build
bun run lint
bun run preview

# Local Supabase stack (Postgres 54322, API 54321, Studio 54323)
bun run supabase:start | supabase:stop | supabase:reset

# Secrets live in Doppler — see the Doppler block under "Production deployment &
# database". The old switch:local/switch:cloud scripts are gone; use dev:local /
# dev:cloud / dev:prod (Doppler configs dev / stg / prd) instead.

# Deploy DB migrations to PRODUCTION (Oracle self-hosted) — see
# "Production deployment & database" below for the full manual SSH/psql flow.
# ⚠️ Do NOT rely on `bun run supabase:migrate` (= supabase db push): it is linked
#    to a DIFFERENT project (ulbdlkkftbzgafsrprnm.supabase.co), not Oracle.
# After applying, refresh the PostgREST schema cache or new columns return HTTP 400:
#   docker exec supabase-db-1 psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"
#   docker restart supabase-rest-1          # faster
# Edge functions: npx supabase functions deploy <name>

# Regenerate types (updates both web and mobile)
bun run gen:types
```

### Tests

No JS test runner is configured. DB behaviour (money triggers, RLS, KPI periods) is covered by SQL scripts in `supabase/tests/`, one per migration. Each block `RAISE`s on failure, so `ON_ERROR_STOP=1` + exit code is the pass/fail signal.

**Never run them against production** — they insert fixtures. Build a throwaway stand:

```bash
docker run -d --name fy-test -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.106

# GoTrue isn't in this image, but migrations FK to auth.users and handle_new_user
# triggers off it — stub the parts the migrations touch:
docker exec -i fy-test psql -U postgres -d postgres <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY);
SQL

# Replay the schema. `docker cp` + `-f` (not stdin) so psql reports the failing file.
for f in supabase/migrations/*.sql; do
  docker cp "$f" fy-test:/tmp/m.sql
  docker exec fy-test psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/m.sql
done
# Expected failures on this stand: the storage.* migrations (013/014/016/019/021/025/029)
# — no storage schema in the image — and 042 (constraint already present). Ignore those.

# Run one test file:
docker cp supabase/tests/043_money_guards_test.sql fy-test:/tmp/t.sql
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql

docker rm -f fy-test
```

A test is only evidence if it **fails on the old code** — revert the function under test (re-apply the earlier migration) and confirm it goes red before trusting a green run. Both the migration-045 timezone bug and a false-passing test were caught exactly this way.

### Production deployment & database (⚠️ READ BEFORE DEPLOYING — keep current)

This is the single source of truth for "where things live and how to ship them." Update it whenever infra, the deploy flow, or the DB-apply process changes. **Never put secrets here** (CLAUDE.md is committed to git): no SSH keys, passwords, anon/service keys.

**Secrets live in Doppler (the vault — fetch from here, don't hardcode).** All credentials are stored in [Doppler](https://dashboard.doppler.com); the CLI is installed and logged in on the dev machine (token is global, works from any dir). Two projects, both config `prd`:
- **`infra`** — `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` (heons_key), `POSTGRES_PASSWORD`, `SUPABASE_API_URL`, `COOLIFY_URL`, `APP_URL`, `GITHUB_REPO`, `OCI_*`, etc.
- **`fy-system`** — app env (`VITE_SUPABASE_*`) across 3 configs (the old env files): `prd` = production (api.fikryetakchilari.uz), `stg` = cloud (ulbdlkkftbzgafsrprnm.supabase.co), `dev` = local stack (127.0.0.1:54321). Repo dir linked via `doppler.yaml` to fy-system/prd; switch with `bun run dev:local|dev:cloud|dev:prod`.

```bash
doppler secrets get POSTGRES_PASSWORD -p infra -c prd --plain   # fetch one value
doppler secrets get SSH_PRIVATE_KEY  -p infra -c prd --plain > ~/.ssh/heons_key && chmod 600 ~/.ssh/heons_key  # recover SSH key
doppler run -- bun run dev                                       # inject fy-system env (in repo dir)
doppler secrets -p infra -c prd --only-names                    # list names only
```
After changing any secret, update Doppler — local `.env.local` is a convenience copy, not the source of truth.

**Infra map**

| Thing | Where | Notes |
|-------|-------|-------|
| Oracle VM | `ubuntu@141.147.119.131` (Ubuntu 22.04, aarch64, 4 OCPU / 24 GB) | SSH key on the dev machine at `~/.ssh/heons_key` (not in repo) |
| Frontend | `https://app.fikryetakchilari.uz` | Coolify → `Dockerfile` (bun build → nginx) |
| Coolify dashboard | `http://141.147.119.131:8000` | manages the **frontend only** |
| **Production DB / API** | `https://api.fikryetakchilari.uz` | self-hosted Supabase, **outside Coolify**, docker-compose at `/home/ubuntu/supabase/`, behind Traefik |
| Postgres container | `supabase-db-1` | `docker exec supabase-db-1 psql -U postgres -d postgres` |
| PostgREST container | `supabase-rest-1` | restart to refresh schema cache |
| Backups | `~/backups/*.dump` on the VM | `pg_dump ... -Fc` (see below) |

**Gateway: custom nginx, NOT Kong.** This is a **minimal** self-hosted Supabase stack — the standard Kong API gateway is replaced by `supabase-nginx-1` (`nginx:alpine`, custom `nginx.conf`) listening on `:8000`. It routes `/auth/v1/`→auth:9999, `/rest/v1/`→rest:3000, `/realtime/v1/`→realtime:4000, `/storage/v1/`→storage:5000; JWT/anon-key validation is done by PostgREST/GoTrue, not the gateway. Consequences: no Kong plugins (gateway-level rate-limiting, key management). Stack runs only **db, auth, rest, realtime, storage, nginx** — there is **no studio, analytics, imgproxy, or pg_meta** container, so DB admin is via SSH + `psql` (not Studio).

**Gateway CORS is hard-coded in `nginx.conf`, and editing it has a trap.** `Access-Control-Allow-Headers` is a static list repeated per `location` block — a request header the browser sends but the list omits is rejected at preflight (this is how image upload broke: Supabase storage sends `x-upsert` on `upsert:true` uploads, and the list didn't include it, so uploads failed CORS while the API itself was fine). If a new client header 400s only in the browser, add it to every `Access-Control-Allow-Headers` line. **The trap:** the file is a *single-file* bind mount (`./nginx.conf:/etc/nginx/nginx.conf:ro`), so `sed -i` (which writes a new inode) leaves the container reading the OLD file — `nginx -t` and `nginx -s reload` both silently validate/reload the stale config and look successful. After editing, you MUST `docker restart supabase-nginx-1` (not reload) for the change to take effect; verify with `docker exec supabase-nginx-1 grep -c <token> /etc/nginx/nginx.conf`.

**The active `.env.local` points at production** (`VITE_SUPABASE_URL=https://api.fikryetakchilari.uz`). ⚠️ Therefore `bun run dev` on localhost reads/writes the **live Oracle DB** — there is no local DB by default. (`.env.local.local` / `bun run dev:local` would use a local Supabase stack, but none is running for this project; port 54322 locally belongs to an unrelated project.)

**Frontend deploy:** push to `main` on GitHub → Coolify auto-redeploys. `VITE_*` are embedded at **build time** → set them as Coolify *build* variables, not just runtime env.

**Database deploy is MANUAL and separate.** ⚠️ Coolify does **NOT** apply migrations. Pushing migration files to GitHub changes nothing in the DB. `bun run supabase:migrate` (= `supabase db push`) is linked to a **different** project (`ulbdlkkftbzgafsrprnm.supabase.co`) — **do not use it for Oracle.** Apply migrations to production by hand:

```bash
# 0) Always back up first
ssh -i ~/.ssh/heons_key ubuntu@141.147.119.131 \
  'TS=$(date +%Y%m%d_%H%M%S); docker exec supabase-db-1 pg_dump -U postgres -d postgres -Fc -f /tmp/fy_$TS.dump \
   && docker cp supabase-db-1:/tmp/fy_$TS.dump ~/backups/fy_$TS.dump && echo backed up $TS'

# 1) Apply a migration file
cat supabase/migrations/0XX_name.sql | ssh -i ~/.ssh/heons_key ubuntu@141.147.119.131 \
  'cat > /tmp/m.sql && docker cp /tmp/m.sql supabase-db-1:/tmp/m.sql \
   && docker exec supabase-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/m.sql'

# 2) Record it (history table; the CLI does not track this self-hosted DB)
#    docker exec supabase-db-1 psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations(version) values ('0XX') on conflict do nothing;"
# 3) Refresh PostgREST schema cache (or new columns return HTTP 400 / PGRST relationship errors)
#    docker exec supabase-db-1 psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"
#    docker restart supabase-rest-1     # faster / more reliable
```

Migration history note: the VM's `supabase_migrations.schema_migrations` may lag the repo (files were applied by direct SQL without always recording the row). The numbered files in `supabase/migrations/` are the real source of truth; record new versions as you apply them.

**Types after a schema change:** `bun run gen:types` uses `--local`, which won't work without a local stack. Either run a local Supabase, point gen:types at the Oracle DB URL, or use the **Stale types workaround** (§6) until types can be regenerated.

---

## 6. Conventions & Patterns

- **Routing:** all routes in `src/App.tsx`. `/login` is public; everything else nests in `<ProtectedRoute><AppShell/></ProtectedRoute>`, and each page wraps again with `module="…"` or `adminOnly` (Hodimlar, Bolimlar, Faollik, Yangiliklar). New route ⇒ add a `PAGE_META` entry (header title/desc) + Sidebar item + module permission if needed.
- **Auth:** `useAuth()` → `{ user, isAdmin, hasAccess(module), canEdit(module) }`. Admins bypass module checks. **Module IDs live in three places that must move together**: `ModuleName` + `MODULES` (`src/lib/supabase/queries/auth.ts`), `VALID_MODULES` (`supabase/functions/admin-create-user`), and the `user_permissions` CHECK constraint (last rewritten in migration `047`). Adding or dropping a module without a migration silently breaks user creation. The Events area is split across **two** modules: `tadbirlar` (Boshqaruv) and `tadbirlar-moliya` (Moliya) — see the Events note below.
- **Data:** per-feature query modules in `src/lib/supabase/queries/` + hooks in `src/hooks/`. Each exports `*_KEY` constants — reuse for invalidation. Optimistic updates follow `onMutate` / `onError` rollback / `onSettled` invalidate (see `useUpdateClient`). Regenerate `types.ts` via `supabase gen types` after schema changes.
- **Stale types workaround:** when a new column is added via migration but `types.ts` hasn't been regenerated yet, extend the Row type locally (`type ClientRow = Database[...]["Row"] & { newCol?: string | null }`) and cast the query result (`const { data, error } = result as unknown as { data: T[] | null; error: Error | null }`). Run `bun run gen:types` and remove the cast once types are regenerated.
- **Query defaults** (`main.tsx`): `staleTime` 5 min, `gcTime` 30 min, `retry` 1, `refetchOnWindowFocus/onMount` **off** (prevents tab-return flicker) — opt in per-query for near-real-time screens.
- **Theming:** `ThemeContext` sets `data-theme` (`neutral`, `black-orange`, `light-orange`); CSS vars per theme in `src/index.css`. Theme colors via **inline `style={{ color: 'var(--header-text)' }}`**, hover via `onMouseEnter/Leave` mutating style — never hardcoded hex or Tailwind color classes for themed surfaces.
- **UI:** corner radii are always **8px** (`rounded-[8px]` or `apple-sq-10`/`apple-sq-12`); `.no-scrollbar` for hidden scrollbars; icons from `@phosphor-icons/react`; DnD `@hello-pangea/dnd`; charts `recharts`; tables `@tanstack/react-table`. All user-facing copy in Uzbek.
- **TypeScript:** strict + `noUnusedLocals/Parameters`, `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly`. No `any`.
- **Imports:** `@/*` → `./src/*` — always prefer `@/components/...`, `@/lib/...`, `@/hooks/...`.

---

## 6.5 Mobile app (`/mobile`)

Member-facing Expo app (SDK 56, expo-router, TypeScript strict) for club members — staff use the web dashboard. Standalone package (own `package.json`, no workspaces); run with `cd mobile && bun install && bunx expo start`. Env: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `mobile/.env` (see `.env.example`).

- **Member auth**: `clients.auth_user_id` links to `auth.users`. Accounts are created ONLY via the `admin-create-member` edge function (Mijozlar page → DeviceMobile icon). `handle_new_user` skips `profiles` creation when `user_metadata.user_type = 'member'` — losing that metadata would silently make the member a staff user.
- **Member writes go through RPCs** (`register_for_event`, `member_update_profile`) — RLS blocks direct writes (migration `028` replaced the old allow-all policies; members read only their own rows).
- **Types**: `mobile/src/lib/supabase/types.ts` is a copy of the web one — regenerate both with `bun run gen:types` (root). Manual aliases live in `supabase/types-manual-exports.txt`.
- **Design tokens**: `mobile/src/theme/tokens.ts` mirrors the web neutral theme; Geist TTFs in `mobile/assets/fonts` (copied from the `geist` npm package).
- Data layer mirrors the web conventions: `src/lib/supabase/queries/*` + `src/hooks/*` with `*_KEY` constants.

---

## 7. Important Notes

- **CRM-N is the only sales pipeline** (`/sotuv/crm-n`): native full-CRUD, `queries/crm.ts` + `components/crm-n/`, shown in the sidebar as "Sotuv bo'limi". The AmoCRM integration was removed in migration `044` — don't reintroduce `src/lib/amocrm/`, the `/api/amo` proxy, or the `amocrm_*` cache tables. `crm_leads.responsible_user_id` is a `profiles.id` (it used to be an AmoCRM user id).
- **Dashboard reads CRM-N** (`queries/dashboard.ts`): server-side counts over `crm_leads`, not row fetches — an unbounded select is capped by PostgREST `max_rows` and would silently undercount.
- **Never modify existing migration files** — always add a new numbered one.
- **Payments are the source of truth for event money** (migration `035`): the `payments` table holds each installment; `event_participants.paid` is a DERIVED total kept in sync by the `sync_participant_paid` trigger (`paid = SUM(payments.amount) + cashback_used`). Never write `paid` directly — insert a `payments` row (via `queries/payments.ts` / `usePayments`). That UPDATE then fires `auto_award_cashback`, so the whole chain (paid → cashback award/clawback → balance) flows from one insert. Debt shown anywhere = `price - paid`.
- **Events UI is two sibling tab-based pages** (migration `047`, split from the old single `Events.tsx`, which is gone — no separate detail route): both live under the sidebar's "Tadbirlar" submenu and share the selected-event tab via `useEventTab` (localStorage `fy_last_event_tab`), so picking an event on one page lands on it on the other. The tab bar itself is the shared `EventTabs` component.
  - **Boshqaruv** (`/tadbirlar/boshqaruv`, module `tadbirlar`, `components/pages/EventsBoshqaruv.tsx`): event create/edit/delete, `EventOverview` (collapsible banner, registration chart, participants table = photo/name/phone only, enroll, booklet export). **No money here.** No "Umumiy" tab; `+` create button present. `/tadbirlar` redirects here.
  - **Moliya** (`/tadbirlar/moliya`, module `tadbirlar-moliya`, `components/pages/EventsMoliya.tsx`): all money. A dark always-first **"Umumiy"** tab renders `FinanceOverview` — 3 KPI cards (income / debt / cashback balance) from the `event_finance_totals()` RPC via `useFinanceTotals` + the global payments log ("To'lov qo'shish" modal). Each event tab renders `EventFinance` (value-progress card, finance table with inline price/cashback edit, per-row payment, cashback spend). No `+` button (creating events belongs to Boshqaruv).
  - **Finance KPIs come from the DB, never summed in the browser:** `event_finance_totals()` (`047`, `SECURITY INVOKER` so RLS applies) returns `total_income = SUM(payments.amount)` (cashback excluded), `total_debt = SUM(GREATEST(price-paid,0))`, `total_cashback_balance = SUM(clients.cashback_balance)`. `FINANCE_TOTALS_KEY` is declared in `hooks/useEvents.ts` (not `usePayments.ts`, which imports from it — avoids a cycle); **every** money-moving mutation must invalidate it (add/delete payment, spend/adjust cashback, edit participant price, enroll participant, **delete event** — the last two are easy to miss).
  - Don't reintroduce a `/tadbirlar/:id` route or the removed `EventDetail`/`Events.tsx`.
- **Cashback is trigger-driven** (migrations `017`, `023`, `038`, `043`): `auto_award_cashback` awards on any `paid` increase and claws back on any decrease (capped by that participant's `cashback_earned`); spending cashback must set `skip_cashback_award = true` on that update (`queries/cashback.ts` relies on it). `clients.cashback_balance` is **recomputed from the `cashback_transactions` ledger** by a trigger on every insert/update/delete — the ledger is the source of truth; never write the balance directly. `spend_cashback` is staff-only and rejects amounts ≤ 0 or above the participant's debt (`043`).
- **AuthContext ignores `SIGNED_IN` echoes** Supabase fires on tab refocus (compares user id). Don't "simplify" that away — it prevents full reloads on every tab switch.
- **User creation only via edge functions** (service role) — `admin-create-user` for staff, `admin-create-member` for club members (Mijozlar page → DeviceMobile icon). Never client-side signup.
- **SECURITY DEFINER functions** were hardened in migration `019` (`SET search_path`) — follow the same pattern in new DB functions.
- Storage buckets: `event-covers` (`013/014`), `client-images` (`016`), `profile-avatars` (`021`), `news-images` (`029`); upsert policies fixed in `025`. On self-hosted Supabase, files live at `/var/lib/storage/stub/<bucket>/` inside the storage container (TENANT_ID=`stub`). **The bucket ROWS can be missing even when the RLS policies exist** — production had all the policies but zero `storage.buckets` rows, so every upload failed with `"Bucket not found"` and images never appeared; migration `048` backfills them (`INSERT … ON CONFLICT DO NOTHING`, additive). On a clean redeploy re-check `select * from storage.buckets` — the storage service reads bucket rows live (no restart needed to see new rows). CORS for uploads is a separate gateway concern — see the "Gateway CORS" note in §5.
- `localStorage` keys: `fy_theme`, `fy_lang`, `fy_sidebar_collapsed`, `fy_last_crm_pipeline_id`.
- **No scheduled jobs run.** `004` created a pg_cron entry for the AmoCRM sync; `044` unscheduled it and production has zero `cron.job` rows. Nothing else uses pg_cron/pg_net.

---

## Keeping This File Current

Update CLAUDE.md when something **structurally meaningful** changes:
- New feature area or major dependency added
- Folder structure or naming convention changed
- New required environment variable
- Deployment process changed

**Do NOT update for:** bug fixes, style changes, copy tweaks, or anything that wouldn't matter to someone reading the project for the first time.

---

## Working in Parallel

When making **independent** changes across multiple files, launch all Agent tool calls in a **single message** so they run concurrently. Do not serialize work that can be parallelized — one agent per independent change, all dispatched at once.

---

## Model Routing

- Use **haiku** for: reads, greps, status checks, deploys, git workflows, env edits, find/replace, "continue"/"go" signals

---

## Behavioral Guidelines

These rules reduce common LLM coding mistakes. They bias toward caution — use judgment on trivial tasks.

### 1. Think Before Coding

**Don't assume. Surface tradeoffs. Ask when unclear.**

- State your assumptions explicitly before implementing.
- If multiple interpretations exist, name them — don't pick silently.
- If a simpler approach exists, say so and push back.
- If something is genuinely unclear, stop and ask. Don't guess.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "extensibility" that wasn't requested.
- No error handling for scenarios that can't happen.
- If you wrote 200 lines and it could be 50, rewrite it.

> Ask: "Would a senior engineer call this overcomplicated?" If yes — simplify.

### 3. Surgical Changes

**Touch only what you must.**

When editing existing code:
- Don't improve adjacent code, comments, or formatting unless asked.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you spot unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports, variables, and functions that **your** changes made unused.
- Don't remove pre-existing dead code unless explicitly asked.

> Test: every changed line should trace directly to the user's request.

### 4. Verify Before Reporting Done

**Define success criteria upfront. Loop until verified.**

For multi-step tasks, state a brief plan first:
```
1. [What] → verify: [how to confirm it worked]
2. [What] → verify: [how to confirm it worked]
3. [What] → verify: [how to confirm it worked]
```

Run the check before saying "done." If you can't verify (e.g. needs a browser), say so explicitly and describe what the user should check.

---

**These guidelines are working when:** diffs are clean, rewrites are rare, and questions come before implementation — not after.
