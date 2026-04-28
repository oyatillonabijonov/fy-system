# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Use `bun` (not npm). All scripts come from `package.json`.

- `bun run dev` — Vite dev server on port **5001** (auto-opens browser). Proxies `/api/amo/*` → `https://fikryetakchilari.amocrm.ru/api/v4/*`.
- `bun run dev:local` — same, but forces `VITE_SUPABASE_URL=http://127.0.0.1:54321` (local Supabase).
- `bun run build` — `tsc -b && vite build` (strict TS project references; build fails on type errors).
- `bun run lint` — flat ESLint (`eslint .`).
- `bun run preview` — preview production build.

Supabase CLI helpers:
- `bun run supabase:start` / `supabase:stop` / `supabase:reset` — run local stack (Postgres on 54322, API on 54321, Studio on 54323).
- `bun run supabase:migrate` — `supabase db push` to remote.

Environment switching (writes to `.env.local`):
- `bun run switch:local` — copies `.env.local.local` → `.env.local`.
- `bun run switch:cloud` — copies `.env.cloud.backup` → `.env.local`.

There is no test runner configured.

## Architecture

### Routing
No router library. `src/App.tsx` (`AppInner`) holds `activeItem: string` state; a `switch` in `renderContent()` picks a page. The `Sidebar` calls `onNavigate(itemName)`. Navigation state is persisted to `localStorage` under `fy_last_route` (theme: `fy_theme`, language: `fy_lang`). Several sidebar items (`AmoCRM`, `Lidlar`, `Pipline`) all render `<Sotuv>` with a different `defaultTab`. `Tadbirlar` toggles between `Events` list and `EventDetail` via local `selectedEventId` state.

### Data layer
- `src/main.tsx` wraps everything in TanStack Query (`staleTime: 2min`, `gcTime: 10min`, `retry: 2`, devtools enabled).
- `src/lib/supabase/client.ts` — typed Supabase browser client (`createClient<Database>`), reading `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- `src/lib/supabase/types.ts` — generated `Database` types. Regenerate via `supabase gen types` if schema changes.
- Per-feature query modules in `src/lib/supabase/queries/` (`clients`, `crm`, `events`, `leads`, `amocrm`).
- Per-feature React Query hooks in `src/hooks/` (`useClients`, `useCrmN`, `useEvents`, `useDashboard`). Each module exports a `*_KEY` constant — reuse it for invalidation. Optimistic updates use the standard `onMutate` / `onError` rollback / `onSettled` invalidate pattern (see `useUpdateClient`).

### Two CRM pipelines coexist
This is the most important conceptual split:
1. **AmoCRM (external, read-mostly)** — `src/lib/amocrm/` calls AmoCRM's REST API through the Vite dev proxy `/api/amo`. OAuth tokens are cached in the `amocrm_tokens` table (single row, `id=1`). `token-manager.ts` refreshes 5 min before expiry, falls back to `VITE_AMO_ACCESS_TOKEN` env var when the table is empty (long-lived token path), and exposes `invalidateTokenCache()` for 401 retries (handled inside `client.ts`'s `fetchFromAmo`). The `Sotuv` page and analytics consume this.
2. **CRM-N (native, full CRUD)** — `src/lib/supabase/queries/crm.ts` + `src/components/crm-n/` + `src/components/pages/CrmN.tsx`. Pipelines/stages/leads live in our own Postgres tables (migrations `007_crm_native.sql`, `015_participant_sort_order.sql`).

When adding a feature, decide which CRM it belongs to — they are not interchangeable.

### Server-side (Supabase)
- `supabase/migrations/001…016_*.sql` — sequentially applied. **Never modify an existing migration file**; always add a new one.
- `supabase/functions/`:
  - `amocrm-sync` — Deno edge function that pulls leads/contacts/pipelines/users from AmoCRM into Supabase. Triggered by **pg_cron every 3 minutes** (see `004_cron_job.sql`, which uses `app.supabase_url` and `app.service_role_key` Postgres settings via `pg_net`).
  - `framer-webhook`, `meta-webhook`, `tilda-webhook` — inbound lead capture from landing pages / Meta ads. Logs go to the `webhook_logs` table (migration `008`).
- Storage buckets: `event-covers` (migration `013/014`), `client-images` (migration `016`).

### Theming
Two layers — keep them in sync when adding new themed surfaces:
1. **React context** (`src/context/ThemeContext.tsx`) sets `data-theme` on `<html>`. Active themes: `neutral`, `black-orange`, `light-orange` (the `themes` array is the source of truth — AGENTS.md is stale and lists more).
2. **CSS variables** (`src/index.css`, `[data-theme="…"]` blocks): each theme defines `--sidebar-*`, `--header-*`, `--main-*`, `--dropdown-*`, `--accent`, etc.

Theme-dependent colors are applied via **inline `style={{ color: 'var(--header-text)' }}`**, not Tailwind classes. Hover states are also inline (`onMouseEnter`/`onMouseLeave` mutate `e.currentTarget.style.background` to `var(--header-hover)` etc.). Don't introduce hardcoded hex values for anything that should respond to theme switching.

### UI conventions
- shadcn/ui configured in `components.json` (style `base-nova`, base color `neutral`, icon library `lucide`). New components: `bunx shadcn@latest add <component>` → land in `src/components/ui/`.
- `cn()` in `src/lib/utils.ts` = `twMerge(clsx(...))`.
- Tailwind 4 via `@tailwindcss/vite` — config lives in CSS, no `tailwind.config.*`.
- Font: Geist Variable (`@fontsource-variable/geist`).
- All corner radii are **8px** — use `rounded-[8px]` or the project utilities `apple-sq-10` / `apple-sq-12`. Recent commits standardised this; don't reintroduce other radii.
- Hidden scrollbars: `.no-scrollbar`.
- Drag-and-drop on pipelines uses `@hello-pangea/dnd`.
- Charts: `recharts` (Dashboard). Tables: `@tanstack/react-table` (Mijozlar, Lidlar). Animations: `framer-motion`.

### Path aliases
`@/*` → `./src/*` (set in both `tsconfig.app.json` and `vite.config.ts`). Always prefer `@/components/...`, `@/lib/...`, `@/hooks/...`.

### TypeScript
`tsconfig.app.json` is strict: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `erasableSyntaxOnly`. Use `import type { … }` for type-only imports. The user's global rule also forbids `any`.
