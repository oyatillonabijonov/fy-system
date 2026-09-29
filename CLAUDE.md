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
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`, no config file) + Broom Plexus tokens + shadcn/ui (`base-nova`), framer-motion, DM Sans font (`@fontsource-variable/dm-sans`) |
| Database | Supabase Postgres (migrations `001`–`066`) |
| Auth | Supabase Auth + `profiles` / `user_permissions` tables; roles `admin / manager / xodim` |
| Hosting | Oracle Cloud VM (aarch64, 4 OCPU, 24 GB RAM); frontend via **Coolify** at `https://app.fikryetakchilari.uz`; self-hosted Supabase at `https://api.fikryetakchilari.uz` |
| External APIs | Meta/Framer/Tilda lead webhooks; **AmoCRM (read-only)** via the `amo-sync` service → `amo_*` tables (Dashboard) |

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
│   ├── migrations/           # 001–066, sequential — NEVER edit existing ones
│   ├── tests/                # SQL behaviour tests per migration (throwaway DB only)
│   └── functions/            # admin-create-user, admin-create-member, framer/meta/tilda-webhook
├── amo-sync/                 # Bun service: AmoCRM → amo_* tables every 10 min (only AmoCRM client; own Dockerfile)
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

`amo-sync` service (container env, never in the frontend):

```bash
DATABASE_URL=       # postgres://postgres:…@<db host>:5432/postgres (writes amo_* as table owner)
AMO_SUBDOMAIN=      # fikryetakchilari
AMO_TOKEN=          # AmoCRM long-lived token (Doppler fy-system: VITE_AMO_ACCESS_TOKEN — the name is legacy; it must NOT be read by Vite code)
SYNC_INTERVAL_MIN=10
EVENTS_FROM=2025-01-01  # first backfill of lead status history
TELEGRAM_BOT_TOKEN=     # payment receipts bot (Doppler); unset = receipts wait in the queue
TELEGRAM_CHAT_ID=       # target group id (negative number)
TELEGRAM_TASKS_CHAT_ID= # Vazifalar daily reminder group; unset = no reminder
TASKS_DIGEST_HOUR=9     # Tashkent hour after which the day's reminder goes out
GEMINI_API_KEY=         # task bot: free-tier Gemini reads chat messages (Doppler fy-system); unset = bot off
GEMINI_MODELS=          # optional, comma list tried in order (default gemini-3.5-flash-lite,…)
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

**Gateway: custom nginx, NOT Kong.** This is a **minimal** self-hosted Supabase stack — the standard Kong API gateway is replaced by `supabase-nginx-1` (`nginx:alpine`, custom `nginx.conf`) listening on `:8000`. It routes `/auth/v1/`→auth:9999, `/rest/v1/`→rest:3000, `/realtime/v1/`→realtime:4000, `/storage/v1/`→storage:5000; JWT/anon-key validation is done by PostgREST/GoTrue, not the gateway. Consequences: no Kong plugins (gateway-level rate-limiting, key management). Stack runs only **db, auth, rest, realtime, storage, functions, nginx** — there is **no studio, analytics, imgproxy, or pg_meta** container, so DB admin is via SSH + `psql` (not Studio). **Edge functions:** `supabase-functions-1` (`supabase/edge-runtime`) runs **only `admin-create-user`** as its main service (code copied to `~/supabase/functions/admin-create-user/` on the VM; env `SUPABASE_URL=http://nginx:8000` + anon/service keys from `~/supabase/.env`), routed by an exact `location = /functions/v1/admin-create-user` in `nginx.conf` — every other `/functions/v1/*` path is still 404 (the webhooks and `admin-create-member` aren't served in prod). After editing the function: copy the folder to the VM and `docker restart supabase-functions-1`.

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

**amo-sync (AmoCRM → `amo_*`) runs as a plain Docker container on the VM, outside Coolify** (like the Supabase stack): container `fy-amo-sync`, image `fy-amo-sync:latest`, network `supabase_supabase-net` (talks to `supabase-db-1` directly), `--restart unless-stopped`, env in `~/amo-sync/.env` (chmod 600; built from Doppler — never commit it). Logs: `docker logs --tail 50 fy-amo-sync` (one line per pass). Redeploy after changing `amo-sync/`:

```bash
tar czf - --exclude node_modules amo-sync | ssh -i ~/.ssh/heons_key ubuntu@141.147.119.131 \
  'tar xzf - -C ~ && cd ~/amo-sync && docker build -q -t fy-amo-sync:latest . \
   && docker rm -f fy-amo-sync && docker run -d --name fy-amo-sync --restart unless-stopped \
      --network supabase_supabase-net --env-file ~/amo-sync/.env fy-amo-sync:latest'
```

**Types after a schema change:** `bun run gen:types` uses `--local`, which won't work without a local stack. Either run a local Supabase, point gen:types at the Oracle DB URL, or use the **Stale types workaround** (§6) until types can be regenerated.

---

## 6. Conventions & Patterns

- **Routing:** all routes in `src/App.tsx`. `/login` is public; everything else nests in `<ProtectedRoute><AppShell/></ProtectedRoute>`, and each page wraps again with `module="…"` or `adminOnly` (Hodimlar, Faollik). New route ⇒ add a `PAGE_META` entry (header title/desc) + Sidebar item + module permission if needed.
- **Auth:** `useAuth()` → `{ user, isAdmin, hasAccess(module), canEdit(module) }`. Admins bypass module checks. **Module IDs live in three places that must move together**: `ModuleName` + `MODULES` (`src/lib/supabase/queries/auth.ts`), `VALID_MODULES` (`supabase/functions/admin-create-user`), and the `user_permissions` CHECK constraint (last rewritten in migration `047`). Adding or dropping a module without a migration silently breaks user creation. `MODULES` is only what the admin UI *offers* (Dashboard, Mijozlar, Tadbirlar, Moliya — `sotuv-crmn` is detached, `sozlamalar` is no longer a gate: Profilim/`/sozlamalar` is open to every signed-in user); `can_edit` is set explicitly per module and only Moliya reads it (`EDITABLE_MODULE`). RLS (`has_permission`) checks `can_view` only. The Events area is split across **two** modules: `tadbirlar` (Boshqaruv) and `tadbirlar-moliya` (Moliya) — see the Events note below.
- **Data:** per-feature query modules in `src/lib/supabase/queries/` + hooks in `src/hooks/`. Each exports `*_KEY` constants — reuse for invalidation. Optimistic updates follow `onMutate` / `onError` rollback / `onSettled` invalidate (see `useUpdateClient`). Regenerate `types.ts` via `supabase gen types` after schema changes.
- **Stale types workaround:** when a new column is added via migration but `types.ts` hasn't been regenerated yet, extend the Row type locally (`type ClientRow = Database[...]["Row"] & { newCol?: string | null }`) and cast the query result (`const { data, error } = result as unknown as { data: T[] | null; error: Error | null }`). Run `bun run gen:types` and remove the cast once types are regenerated.
- **Query defaults** (`main.tsx`): `staleTime` 5 min, `gcTime` 30 min, `retry` 1, `refetchOnWindowFocus/onMount` **off** (prevents tab-return flicker) — opt in per-query for near-real-time screens.
- **Theming / design system:** Broom **Plexus** system (Broom project "Fikr Yetakchilari"). Tokens in `src/styles/plexus-tokens.css` (`--ds-*`, generated — regenerate in Broom, don't hand-edit), exposed as Tailwind utilities in `src/index.css`: `bg-page` / `bg-surface` / `bg-surface-sunken`, `text-ink` / `text-ink-muted` / `text-ink-faint`, `border-line`, `bg-accent`, `bg-danger|success|warning|info`, `bg-mute-soft` / `hover:bg-mute-ghost-hover`, `rounded-control|surface|menu|item`, `h-control-sm|md|lg`, `shadow-sm|md|lg`. `ThemeContext` sets `data-theme` = `light` / `dark` / `contrast` / `photo` (`contrast` = light tokens on a dark `.app-ground` with the sidebar in a `data-theme="dark"` scope; `photo` "Manzara" = the same on the login photo under a 55 % shade) (the dark palette is our own, overriding Plexus' in `src/index.css` under `:root[data-theme="dark"]` — page `#0b0b0c` → main card `#141416` → dialogs `#19191c` → fields/inner cards `#202024`; keep that order so each layer reads) (the old `neutral`/`black-orange`/`light-orange` themes are gone); tokens flip automatically, so **use these utilities, never hex or inline `onMouseEnter` style mutation**. shadcn vars and the legacy `--sidebar-*`/`--header-*`/`--dropdown-*` vars are aliased to `--ds-*`. All pages are migrated; the only hex left is data colour (department / pipeline-stage / entity-type / avatar palettes, `eventTint`), Login's photo shade (`bg-black/25` over `public/images/login-sea.jpg`) and the booklet PDF (`src/lib/booklet/`, fixed colours on purpose). On `bg-accent` use `text-ink-on-accent` (accent is white in dark) — `text-white` only on `bg-danger`/`bg-success` or over photos.
- **UI:** DM Sans (`@fontsource-variable/dm-sans`, `--ds-font-*` overridden in `src/index.css` over Plexus' Inter); **max weight is SemiBold 600** — `font-bold`/`extrabold`/`black` and `b`/`strong`/`th` all map to 600, never add a heavier weight; **no shadows** on buttons, cards, menus or dialogs (`shadow-*` removed on purpose) — separate by fill, a `border-line` hairline on floating menus, and the `bg-surface-overlay` backdrop for dialogs; radii per Plexus (`rounded-control` 10px, `rounded-surface` 12px for cards, `rounded-menu` for popovers). Cards separate by fill (`bg-surface-sunken` on the white main), not borders. `.no-scrollbar` for hidden scrollbars; icons from `@phosphor-icons/react` (kept instead of Plexus' Hugeicons) with **one visual stroke (~1px, as in the sidebar)** — Phosphor's stroke scales with size, so weight follows size: ≤12px `bold`, 16–20px regular (default; don't use 13–15px, use 16), 22–28px `light`, ≥32px `thin`; `fill` only for on/off states; **one stroke colour**: every shape border is `border-line` (lightened to 7% in `src/index.css`), no darker hover/selected strokes — only focus and validation states differ; DnD `@hello-pangea/dnd`; charts `recharts` (colors via `var(--ds-…)`); tables `@tanstack/react-table`, **every table styled via `tbl` from `src/components/ui/table.ts`** (pill header row, `border-line` hairline between rows, flat row hover — no outer table border), **paged 20 rows at a time** with `Pager` from `src/components/ui/Pager.tsx` (`usePaged(items)` for arrays, `getPaginationRowModel` + `PAGE_SIZE` for tanstack tables, server `range()` + a count query when the list is fetched page by page, e.g. the payments log) — no infinite lists or "load more" buttons. All user-facing copy in Uzbek.
- **TypeScript:** strict + `noUnusedLocals/Parameters`, `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly`. No `any`.
- **Imports:** `@/*` → `./src/*` — always prefer `@/components/...`, `@/lib/...`, `@/hooks/...`.

---

## 6.5 Mobile app (`/mobile`)

Member-facing Expo app (SDK 56, expo-router, TypeScript strict) for club members — staff use the web dashboard. Standalone package (own `package.json`, no workspaces); run with `cd mobile && bun install && bunx expo start`. Env: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `mobile/.env` (see `.env.example`).

- **Member auth**: `clients.auth_user_id` links to `auth.users`. Accounts are created ONLY via the `admin-create-member` edge function — the web UI entry (Mijozlar → DeviceMobile icon + `CreateMemberAccountModal`) was removed on purpose, so there is currently no UI to create member accounts; the edge function is still deployed. `handle_new_user` skips `profiles` creation when `user_metadata.user_type = 'member'` — losing that metadata would silently make the member a staff user.
- **Member writes go through RPCs** (`register_for_event`, `member_update_profile`) — RLS blocks direct writes (migration `028` replaced the old allow-all policies; members read only their own rows).
- **Types**: `mobile/src/lib/supabase/types.ts` is a copy of the web one — regenerate both with `bun run gen:types` (root). Manual aliases live in `supabase/types-manual-exports.txt`.
- **Design tokens**: `mobile/src/theme/tokens.ts` mirrors the web neutral theme; Geist TTFs in `mobile/assets/fonts` (copied from the `geist` npm package).
- Data layer mirrors the web conventions: `src/lib/supabase/queries/*` + `src/hooks/*` with `*_KEY` constants.

---

## 7. Important Notes

- **CRM-N** (`/sotuv/crm-n`) is the native lead board: full-CRUD, `queries/crm.ts` + `components/crm-n/`. **Detached since 2026-09-28** (kept for later): no route and no sidebar item, so `/sotuv/crm-n` redirects to the dashboard; the page/components/queries, module `sotuv-crmn` and `crm_*` data are untouched. Reconnect steps: `docs/sotuv-bolimi-restore.md` (tag `backup/sotuv-bolimi-nav` = last connected commit). `crm_leads.responsible_user_id` is a `profiles.id`. The OLD AmoCRM integration (`src/lib/amocrm/`, `/api/amo` proxy, `amocrm_*` tables) was removed in `044` — don't bring that back.
- **Dashboard = AmoCRM analytics** (migration `049`, decided 2026-09-27): the `amo-sync/` service is the ONLY thing that calls AmoCRM; it copies pipelines, statuses, users, leads, open tasks and lead status changes into `amo_*` tables (incremental every 10 min, full pass daily that also drops deleted leads). The web reads everything through **one** RPC, `amo_dashboard(p_from, p_to, p_pipeline)` (`queries/amoDashboard.ts` / `useAmoDashboard`) — all numbers are SQL, nothing summed in the browser, the AmoCRM token never reaches the frontend. `amo_*` tables are readable only with the `dashboard` module. Data-quality rules inside the function (measured on the live account): **>10 leads closed in the same minute = bulk clean-up**, excluded from won/lost/conversion and reported as `bulk_closed`; **revenue / average check come from our own `payments`**, because AmoCRM deal amounts are almost never filled; lead source isn't a field in this account ("Manba" is almost never set), so amo-sync derives `amo_leads.source` from utm_source and the **tags** integrations stamp on leads (`fb<form id>`/`target…` → Facebook, `tilda`, `Framer sayt` → Sayt, Входящий/Исходящий → calls, …; regexes in `TAG_SOURCES`, `amo-sync/src/index.ts`) — a new tag style shows up as "Noma'lum" until it's added there (`050`). Loss reasons and deal amounts really are unrecorded (managers close without them) — that's a CRM-discipline problem, not a sync bug.
- **Never modify existing migration files** — always add a new numbered one.
- **Payments are the source of truth for event money** (migrations `035`, `053`): the `payments` table holds each installment; `event_participants.paid` is a DERIVED total kept in sync by the `sync_participant_paid` trigger (`paid = SUM(non-voided payments.amount) + cashback_used`). **Money moves only through RPCs** (`053`): `record_payment` (finds or enrols the client — new client by name + phone — then inserts; refuses amounts above the debt), `void_payment` (reason required; rows are never deleted), `refund_payment` (a negative `kind='refund'` row, capped by cash paid). `payments` has no INSERT/UPDATE/DELETE policy and is readable only with `tadbirlar-moliya` view permission; writing money needs its `can_edit` (`can_edit_finance()`). A trigger also refuses changing `price` / `next_due_date` without that right, and refuses deleting a participant (or event) that still has live payments — that guard trigger is named `trigger_00_guard_participant_has_payments` so it fires before 038's `trigger_clawback_on_participant_delete` (same-event BEFORE ROW triggers fire in alphabetical name order). Every payment/void/refund updates `paid`, which fires `auto_award_cashback` (award or clawback). Debt shown anywhere = `price - paid`. More guards from `053`: voiding a `payment` is refused if it would drive net cash below zero (void the matching refund first); `price` can never be set below `paid`; a partial `record_payment` with no new due date keeps the existing one instead of clearing it; and `cashback_transactions` writes plus `spend_cashback` now require `can_edit_finance()`, not just any staff row.
- **Expenses** (migration `054`): `expenses` rows are event-bound or general (`event_id` NULL; deleting an event turns its expenses general — `ON DELETE SET NULL`). Fixed categories (`zal, spiker, kofe_brek, reklama, maosh, ofis, boshqa`). Same money rules as payments: readable only with `tadbirlar-moliya`, no write policy — `add_expense` / `void_expense` (reason required) need `can_edit_finance()`; rows are never deleted or edited. Expenses have no seller or payment method, so under a seller/method filter the UI shows "—" for Chiqim / Sof cashflow. Profit is cash-basis: payments − refunds − expenses (cashback isn't cash).
- **Receipts (chek)** (migration `055`): optional file on a payment or an expense (`receipt_path`). PRIVATE bucket `receipts` (10 MB, jpg/png/webp/pdf): read with `tadbirlar-moliya` view, upload with `can_edit_finance()`, no update/delete. The money RPCs are untouched — the UI saves first, uploads to `<payment|expense>/<id>/<uuid>.<ext>`, then links it with `attach_receipt` (checks the folder matches the row; one receipt per row, never replaced). A failed upload never undoes the money: the row stays and the receipt can be attached later from the list (`components/moliya/Receipt.tsx`). Opened via a 5-minute signed URL. Production gateway: the storage location needs `client_max_body_size` ≥ 11m (nginx default is 1 MB).
- **Events UI is two sibling tab-based pages** (migration `047`, split from the old single `Events.tsx`, which is gone — no separate detail route): both live under the sidebar's "Tadbirlar" submenu. Boshqaruv keeps the event tabs (`EventTabs` + `useEventTab`); Moliya no longer uses them.
  - **Boshqaruv** (`/tadbirlar/boshqaruv`, module `tadbirlar`, `components/pages/EventsBoshqaruv.tsx`): event create/edit/delete, `EventOverview` (name + edit/delete header, four info cards — Jami ishtirokchi / Sana / Joy / Mas'ul; participants list = photo/name/phone plus tariff · seller, enroll, booklet export). **No money here.** Event banners/covers were removed on purpose (no banner on the page, no cover upload in the create/edit drawer); `events.cover_image` still exists and the mobile app still reads it, but the web no longer writes it. No "Umumiy" tab; `+` create button present. `/tadbirlar` redirects here.
  - **Tariffs & enrolment** (migration `052`): each event has ≥1 row in `event_tariffs` (name + price), edited in `CreateEventDrawer` via `saveEventTariffs`. Enrolling goes ONLY through the `enroll_participant` RPC (existing client by id, or new client by name + phone — a phone that already exists raises `client_exists:<id>:<name>` and the UI offers that client). The RPC copies the tariff price into `event_participants.price` (later tariff edits don't reprice) and requires a `seller_id` from the Sotuv department. `events.has_tariffs` and `event_participants.tariff` (text) are legacy, unused.
  - **Moliya** (`/tadbirlar/moliya`, module `tadbirlar-moliya`, `components/pages/EventsMoliya.tsx` + `components/moliya/`): ONE global page, no event tabs — the event is a filter. Filters (period in Tashkent days via `lib/period.ts`, event, seller incl. "Belgilanmagan", method) live in the URL (`useFinanceFilters`). KPI cards, then tabs **To'lovlar** (payments log, void/refund) and **Qarzdorlar** (status: debt/overdue/paid/all; inline price, seller, next due date, cashback %, cashback spend, "To'lov"). Plus **Xarajatlar** (expenses log; add / void with reason — `ExpensesTab`, `ExpenseModals`) and **Tadbir natijalari** (per-event agreed / collected / debt / expense / profit and plan % vs `events.total_value` — `EventProfitTab`). "Kirim" (`RecordPaymentModal`) and "Chiqim" (`AddExpenseModal`) buttons sit at the top of the page; "Kirim" covers existing and brand-new clients. Actions render only with `canEdit("tadbirlar-moliya")`.
  - **Finance numbers come from the DB, never summed in the browser:** `finance_summary()` (KPIs, incl. expense / net since 054), `finance_debtors()` (the Qarzdorlar list — PostgREST can't compare `price > paid`), and `event_profit()` (054; its rows' profit sums to finance_summary.net for the same period/event), all `SECURITY INVOKER` + a `has_permission(…,'tadbirlar-moliya')` guard. Dates: payments filter on `paid_at`, debt on enrolment (`created_at`), both as Asia/Tashkent days. Every Moliya query key starts with `FINANCE_KEY` (`hooks/useEvents.ts`); money mutations go through `hooks/useFinance.ts`, which invalidates it plus participants/clients/cashback. The seven finance queries in `hooks/useFinance.ts` set `refetchOnMount: true`, overriding the global `refetchOnMount: false` from `main.tsx`, because a money movement invalidates the other (inactive) tab's queries and they'd otherwise stay stale. `event_finance_totals()` (047) was dropped in `054`.
  - Don't reintroduce a `/tadbirlar/:id` route or the removed `EventDetail`/`Events.tsx`.
- **Cashback is credited after the event (migration `061`, replaces the award-on-payment of `023`/`038`):** `settle_event_cashback()` reconciles each participant to `round(cash × % / 100)` once the event is over (the day after `COALESCE(end_date, date)`, Tashkent) and 0 before that or for a no-show — writing `earned`/`clawback` rows; idempotent, run on every amo-sync pass and by `settle_no_show`. `auto_award_cashback` now only resets `skip_cashback_award`, which `spend_cashback` still sets. **No-show:** `settle_no_show(participant, keep, method, note)` refunds cash − keep, sets `price` to what's kept (no phantom debt), stamps `event_participants.no_show_at` — UI: Moliya → To'lovlar → "Qatnashmadi". Since `063` the cashback they spent on that event goes back to their balance (`manual_add` on the participant, `cashback_used` → 0), and a no-show's `price` follows `paid` in `recalc_participant_paid`, so a later refund/void never leaves a phantom debt. `clients.cashback_balance` is **recomputed from the `cashback_transactions` ledger** by a trigger on every insert/update/delete — the ledger is the source of truth; never write the balance directly. `spend_cashback` is staff-only and rejects amounts ≤ 0 or above the participant's debt (`043`). **Cashback inside a payment (`065`):** `record_payment(…, p_cashback)` — `p_amount` is what the payment settles, `p_cashback` of it comes from the balance (`spend_cashback`), the rest is the cash row, one transaction; all-cashback writes no cash row and returns NULL. UI: Kirim → "Keshbekdan ishlatish" (shown when the client has a balance). **Since `059`:** the ledger is written only through SECURITY DEFINER functions (no direct INSERT/UPDATE/DELETE policies); manual add/subtract goes through `adjust_cashback(client, 'add'|'subtract', amount, reason)` (finance editors, reason required, no overdraw) — UI: Mijozlar → client → Cashback → "O'zgartirish"; **cashback lives 12 months** — debits consume the oldest credits first, and `expire_cashback()` writes the uncovered part of credits older than 12 months as an `expired` row (idempotent). It runs on every amo-sync pass and inside spend/adjust; `cashback_next_expiry(client)` feeds "X so'm … da kuyadi" on the client card.
- **AuthContext ignores `SIGNED_IN` echoes** Supabase fires on tab refocus (compares user id). Don't "simplify" that away — it prevents full reloads on every tab switch.
- **Enrolment without tariffs/seller (migration `058`):** `enroll_participant(…, p_price)` accepts `p_tariff_id = NULL` ("Individual kelishuv", price typed) only when the event has no tariffs, and `p_seller_id = NULL` ("Belgilanmagan"); a given seller must still be an active Sotuv employee. `record_payment` enrols through it the same way. Events created before 052 have no tariffs, and nobody was in Sotuv — before 058 no one could be enrolled.
- **One client per phone (migration `057`):** `clients_phone_unique` + a BEFORE trigger that stores every phone as `+998XXXXXXXXX` (`clean_client_phone()` → `normalize_phone()`; junk like `""`/`+998` becomes NULL), so a number typed in any format by any writer (web, webhooks, mobile, RPCs) collides with the existing client. The Mijozlar add form also warns live and links to the existing client; a `23505` on `clients` means "phone taken".
- **Staff access rules (migration `056`, keep them):** non-admins may update only `full_name`, `phone`, `avatar_url` on their own `profiles` row (trigger `guard_profile_self_update` — before it, anyone could PATCH themselves to `role='admin'`); `is_admin()` / `has_permission()` return false for `is_active = false`, and the web signs such sessions out. `profiles.must_change_password` is set by `admin-create-user` (the admin hands out a temporary password); the shell shows a red banner until the user changes it in Profilim (`updatePassword` clears it — the only change of that column a user may make). **Derived money columns are function-only (migration `062`):** RLS lets any staff UPDATE/INSERT `event_participants` and `clients`, so SECURITY INVOKER guards refuse API-role (`authenticated`/`anon`) writes to `paid`, `cashback_used`, `cashback_earned`, `no_show_at`, `skip_cashback_award` and `clients.cashback_balance` (before it, a staff login with no Moliya right could PATCH a debt to paid or set any cashback balance); `cashback_percent` needs `can_edit_finance`. The money functions/triggers run as their owner, so they're unaffected — keep new money writers SECURITY DEFINER. Event setup is open to the Tadbirlar module (decided 2026-09-29, `065` reverted `063`/`064`'s finance-only checks): the event's cashback %, tariffs and the individual price. Moliya itself stays behind `tadbirlar-moliya`.
- **User creation only via edge functions** (service role) — `admin-create-user` for staff (served in prod by the `supabase-functions-1` container — after editing, copy `supabase/functions/admin-create-user/` to `~/supabase/functions/` on the VM and `docker restart supabase-functions-1`), `admin-create-member` for club members (no web UI entry any more — see Member auth). Never client-side signup.
- **SECURITY DEFINER functions** were hardened in migration `019` (`SET search_path`) — follow the same pattern in new DB functions.
- Storage buckets: `event-covers` (`013/014`), `client-images` (`016`), `profile-avatars` (`021`), `receipts` (`055`, private); `news-images` (`029`) removed in `051` (news feature dropped); upsert policies fixed in `025`. On self-hosted Supabase, files live at `/var/lib/storage/stub/<bucket>/` inside the storage container (TENANT_ID=`stub`). **The bucket ROWS can be missing even when the RLS policies exist** — production had all the policies but zero `storage.buckets` rows, so every upload failed with `"Bucket not found"` and images never appeared; migration `048` backfills them (`INSERT … ON CONFLICT DO NOTHING`, additive). On a clean redeploy re-check `select * from storage.buckets` — the storage service reads bucket rows live (no restart needed to see new rows). CORS for uploads is a separate gateway concern — see the "Gateway CORS" note in §5.
- `localStorage` keys: `fy_theme`, `fy_lang`, `fy_sidebar_collapsed`, `fy_last_crm_pipeline_id`.
- **Scheduled work = the `amo-sync` container only** (it also calls `expire_cashback()` each pass, and sends the daily Vazifalar reminder).
- **Vazifalar (migration `066`, `/vazifalar`, replaces the team's per-event Excel sheets):** `tasks` (event or NULL = "Umumiy", free-text `section` = the sheet's bo'lim, owner = staff `assignee_id` **or** an outside person's `assignee_name`, status `todo/in_progress/done/failed` — "overdue" is derived from `due_date`, never stored; `completed_at` follows the status by trigger) and `task_comments` (the Izoh log). **Every active staff member sees, creates and edits every task — no module gate**; delete = author or admin. `copy_event_tasks(from, to)` = "Nusxa olish" (fresh status/dates, owners kept). UI (`components/pages/Vazifalar.tsx`, `components/vazifalar/`): per-event list grouped by section with progress, a Kanban (drag = status change), and "Mening vazifalarim" (open tasks by due bucket). Morning report: `amo-sync/src/tasks.ts`, on its own minute timer, sends one message at 9:00 Tashkent to `TELEGRAM_TASKS_CHAT_ID` (per upcoming event: progress bar + done/in progress/not started/failed; tasks completed yesterday; "Bugun e'tibor" — overdue/today/tomorrow in one quote block per owner, staff @mentioned via `profiles.telegram`, which staff set themselves in Profilim). Imported tasks have `completed_at` NULL (done before tracking) so they never show as "done yesterday". **Tasks from the chat:** `amo-sync/src/taskbot.ts` long-polls the bot (`getUpdates` — the bot's only update consumer; the backlog is skipped on start); a message in `TELEGRAM_TASKS_CHAT_ID` that mentions the bot, from a staff member matched by `profiles.telegram`, goes to Gemini (JSON schema: tasks with title / owner / due / event / section, free Uzbek incl. Cyrillic and relative dates; model fallback chain for free-tier 503s), is resolved against profiles/events and inserted with `created_by` = the author; the reply lists each task with a "Bekor qilish" button (author or admin). Nothing else in the chat is read or sent to AI.
- **Telegram payment receipts (migration `060`):** triggers queue a `telegram_outbox` row (+ `pg_notify`) for every new payment/refund, every void and every cashback spend; the amo-sync container LISTENs, renders a PNG receipt (`amo-sync/src/receipt.ts`, SVG → resvg; bundled DM Sans with Inter as the Cyrillic fallback, the web logo in `amo-sync/assets/`; "system card" layout with a payment-progress bar) and `sendPhoto`s it with a short caption. The "paid / remaining" figures are computed as of the operation, not send time. 5 retries, rows older than a day are skipped (no flood when the bot is enabled later). Off until `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` are in `~/amo-sync/.env`. No pg_cron/pg_net (`044` removed the old AmoCRM cron entry). If the Dashboard shows the "sinxronizatsiya yangilanmagan" banner, check that container's logs and `amo_sync_state` (`last_success_at`, `last_error`).

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
