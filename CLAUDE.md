# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 1. Project Summary

FY-System is an internal business management dashboard for the "Fikr Yetakchilari" club. It combines two CRM pipelines (external AmoCRM sync + a native CRM), client management, events with participant finance & cashback, employee/HR management with KPIs and per-module permissions, and an activity audit log. Single-page React app backed entirely by Supabase; all UI copy is in Uzbek.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict, no `any`); Deno TS in edge functions |
| Framework | React 19 + Vite 7, react-router-dom 7, TanStack Query 5 |
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`, no config file) + shadcn/ui (`base-nova`), framer-motion, Geist Variable font |
| Database | Supabase Postgres (migrations `001`–`041`), pg_cron + pg_net |
| Auth | Supabase Auth + `profiles` / `user_permissions` tables; roles `admin / manager / xodim` |
| Hosting | Oracle Cloud VM (aarch64, 4 OCPU, 24 GB RAM); frontend via **Coolify** at `https://app.fikryetakchilari.uz`; self-hosted Supabase at `https://api.fikryetakchilari.uz` |
| External APIs | AmoCRM REST v4 (via dev proxy `/api/amo`), Meta/Framer/Tilda lead webhooks |

Package manager: **bun** (not npm).

---

## 3. Folder Structure

```
/
├── src/
│   ├── App.tsx               # All routes, ProtectedRoute wrapping, AppShell (header/sidebar), PAGE_META
│   ├── main.tsx              # QueryClient defaults, BrowserRouter, AuthProvider
│   ├── components/
│   │   ├── pages/            # One component per route (Dashboard, Mijozlar, Sotuv, CrmN, Events, Hodimlar…)
│   │   ├── layout/           # Sidebar (filters items via hasAccess)
│   │   ├── auth/             # ProtectedRoute
│   │   ├── crm-n/            # Native CRM board/cards/modals
│   │   ├── sotuv/            # AmoCRM-facing kanban/tables
│   │   ├── events/           # Event + participant modals
│   │   ├── cashback/         # Cashback badges/modals
│   │   ├── hodimlar/         # Employee profile & KPI modals
│   │   ├── sozlamalar/       # User creation & permissions modals
│   │   └── ui/               # shadcn components (bunx shadcn@latest add <c>)
│   ├── context/              # AuthContext (useAuth), ThemeContext (data-theme)
│   ├── hooks/                # React Query hooks per feature (useClients, useCrmN, useKpi…)
│   └── lib/
│       ├── supabase/         # client.ts, generated types.ts, queries/ per feature
│       ├── amocrm/           # AmoCRM client + token-manager (OAuth refresh, 401 retry)
│       └── constants/        # employee.ts (Department enum mirror, positions)
├── supabase/
│   ├── migrations/           # 001–041, sequential — NEVER edit existing ones
│   └── functions/            # amocrm-sync, admin-create-user, admin-create-member, framer/meta/tilda-webhook
├── Dockerfile                # Coolify build: bun builder → nginx:alpine; VITE_* passed as ARG (build-time)
├── nginx.conf                # SPA fallback (try_files → index.html) + gzip
└── vite.config.ts            # Port 5001, @ alias, /api/amo → amocrm.ru proxy
```

---

## 4. Environment Variables

Frontend (`.env.local`; switch files: `.env.local.local` = local stack, `.env.cloud.backup` = cloud):

```bash
# Required
VITE_SUPABASE_URL=         # Supabase project URL
VITE_SUPABASE_ANON_KEY=    # Supabase anon key

# Optional (AmoCRM integration)
VITE_AMO_SUBDOMAIN=        # e.g. fikryetakchilari
VITE_AMO_CLIENT_ID=        # OAuth client id
VITE_AMO_CLIENT_SECRET=    # OAuth client secret
VITE_AMO_ACCESS_TOKEN=     # long-lived token fallback when amocrm_tokens table is empty
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

# Development (port 5001, auto-opens; proxies /api/amo → AmoCRM)
bun run dev
bun run dev:local        # same, but forces local Supabase (127.0.0.1:54321)

# Build / lint (build fails on type errors: tsc -b && vite build)
bun run build
bun run lint
bun run preview

# Local Supabase stack (Postgres 54322, API 54321, Studio 54323)
bun run supabase:start | supabase:stop | supabase:reset

# Env switching (overwrites .env.local)
bun run switch:local | switch:cloud

# Deploy DB migrations to remote
bun run supabase:migrate          # = supabase db push
# After pushing migrations to self-hosted Supabase, PostgREST schema cache must be refreshed
# or new columns will return HTTP 400. Run via SQL editor or SSH:
#   NOTIFY pgrst, 'reload schema';          -- SQL editor approach
#   docker restart supabase-rest-1          -- SSH approach (faster)
# Edge functions: npx supabase functions deploy <name>

# Regenerate types (updates both web and mobile)
bun run gen:types
```

No test runner is configured. `amocrm-sync` runs automatically via **pg_cron every 3 minutes** (see `004_cron_job.sql`).

### Production deployment (Coolify)

Frontend is built via `Dockerfile` on the Oracle server. `VITE_*` env vars are embedded **at build time** — they must be set as build variables in Coolify before deploying (not just runtime env vars). The self-hosted Supabase stack (`docker-compose.yml` at `/home/ubuntu/supabase/`) runs outside Coolify and is accessed via Traefik reverse proxy.

---

## 6. Conventions & Patterns

- **Routing:** all routes in `src/App.tsx`. `/login` is public; everything else nests in `<ProtectedRoute><AppShell/></ProtectedRoute>`, and each page wraps again with `module="…"` or `adminOnly` (Hodimlar, Bolimlar, Faollik). New route ⇒ add a `PAGE_META` entry (header title/desc) + Sidebar item + module permission if needed.
- **Auth:** `useAuth()` → `{ user, isAdmin, hasAccess(module), canEdit(module) }`. Admins bypass module checks. Module IDs (`ModuleName` in `src/lib/supabase/queries/auth.ts`) must stay in sync with the `user_permissions` CHECK constraint (migration `018`) and `VALID_MODULES` in `supabase/functions/admin-create-user`.
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

- **Two CRMs coexist — not interchangeable.** (1) AmoCRM: external, read-mostly, `src/lib/amocrm/` through the `/api/amo` Vite proxy; route `/sotuv/amocrm` exists but is **not in the sidebar** (removed from navigation). (2) CRM-N (`/sotuv/crm-n`): native full-CRUD, `queries/crm.ts` + `components/crm-n/` — this is the primary sales view shown in the sidebar as "Sotuv bo'limi".
- **AmoCRM tokens:** cached in `amocrm_tokens` table (single row `id=1`); `token-manager.ts` refreshes 5 min early, falls back to `VITE_AMO_ACCESS_TOKEN`, and `fetchFromAmo` retries once on 401 via `invalidateTokenCache()`. Don't bypass this flow.
- **Never modify existing migration files** — always add a new numbered one.
- **Cashback is trigger-driven** (migrations `017`, `023`): `auto_award_cashback` awards on any `paid` increase; spending cashback must set `skip_cashback_award = true` on that update (`queries/cashback.ts` relies on it). `clients.cashback_balance` is maintained by a trigger from `cashback_transactions` — never update the balance directly.
- **AuthContext ignores `SIGNED_IN` echoes** Supabase fires on tab refocus (compares user id). Don't "simplify" that away — it prevents full reloads on every tab switch.
- **User creation only via edge functions** (service role) — `admin-create-user` for staff, `admin-create-member` for club members (Mijozlar page → DeviceMobile icon). Never client-side signup.
- **SECURITY DEFINER functions** were hardened in migration `019` (`SET search_path`) — follow the same pattern in new DB functions.
- Storage buckets: `event-covers` (`013/014`), `client-images` (`016`), `profile-avatars` (`021`); upsert policies fixed in `025`. On self-hosted Supabase, files live at `/var/lib/storage/stub/<bucket>/` inside the storage container (TENANT_ID=`stub`).
- `localStorage` keys: `fy_theme`, `fy_lang`.

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

## Model & Impact Routing

Before executing, declare in **one line** at the top of your reply:
> 🤖 `<haiku|sonnet|opus>` · 🎯 `<🟢low | 🟡med | 🔴high>` · ⚙️ `<one-line reason>`

**Model selection (cheapest tier that fits):**

| Use | For |
|-----|-----|
| **haiku** | Reads, greps, status checks, deploys, git workflows, env edits, find/replace, "continue"/"go" signals |
| **sonnet** | Code generation, debugging, multi-file features, refactors, plan decomposition |
| **opus** | Cross-system architecture, novel design, security-critical tradeoffs (rare) |

Rule: when unsure, use the cheaper tier. Escalate only if it struggles.

**Impact level (state blast radius for 🔴):**

| Tag | Means | Examples |
|-----|-------|----------|
| 🟢 low | Read-only / trivially undone | Read, Grep, status, Q&A |
| 🟡 med | Single-file / local config | Bug fix, doc edit, env var |
| 🔴 high | Multi-file / prod / irreversible | Deploy, merge to main, delete, secret rotation, 3+ files |

For 🔴 tasks: **list affected files/services before acting.**

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
