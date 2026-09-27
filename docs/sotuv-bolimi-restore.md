# Sotuv bo'limi (CRM-N) — detached, how to reconnect

Detached on 2026-09-28: the page is no longer routed or in the sidebar, so `/sotuv/crm-n`
falls through to the catch-all redirect (→ `/dashboard`). Nothing else was deleted:

- page `src/components/pages/CrmN.tsx`, components `src/components/crm-n/`
- data layer `src/lib/supabase/queries/crm.ts`, hook `src/hooks/useCrmN.ts`
- module `sotuv-crmn` (permissions), `crm_*` tables and their data

Git tag `backup/sotuv-bolimi-nav` = last commit where it was fully connected.

## Reconnect — 3 edits

1. `src/App.tsx` — import, page header, route (next to `/dashboard`):

```tsx
import { CrmN } from "./components/pages/CrmN"

// PAGE_META
'/sotuv/crm-n':   { title: "Sotuv bo'limi",    desc: 'Savdo jarayonlari va lidlar boshqaruvi.' },

// routes
<Route path="/sotuv/crm-n" element={
  <ProtectedRoute module="sotuv-crmn"><CrmN /></ProtectedRoute>
} />
```

2. `src/components/layout/Sidebar.tsx` — add `CreditCard` to the Phosphor import, then in the
   "Asosiy" section after "Mijozlar":

```tsx
{ name: "Sotuv bo'limi", icon: CreditCard, path: "/sotuv/crm-n", module: "sotuv-crmn" },
```

3. Remove the "detached" note from the CRM-N bullet in `CLAUDE.md`.
