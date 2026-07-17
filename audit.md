Yetarli ma'lumot to'plandi. Quyida to'liq Phase 1 hisoboti:

  ---
  PHASE 1 AUDIT REPORT — Design Standardization

  ---
  A) GRADIENTS
  
  File:line: Login.tsx:16
  Element: Page base background 
  Current gradient: bg-gradient-to-br from-[#FAFAFA] via-white to-[#F5F5F5]
  Suggested solid: —
  Category: ✅ Intentional (Login blob)
  ────────────────────────────────────────
  File:line: Login.tsx:20   
  Element: Animated blob 1
  Current gradient: radial-gradient(circle, #635BFF 0%, #00D4FF 100%)
  Suggested solid: —
  Category: ✅ Intentional (Login blob)
  ────────────────────────────────────────
  File:line: Login.tsx:22
  Element: Animated blob 2
  Current gradient: radial-gradient(circle, #FF6B9D 0%, #FFA06B 100%)
  Suggested solid: —
  Category: ✅ Intentional (Login blob)
  ────────────────────────────────────────
  File:line: Login.tsx:24
  Element: Animated blob 3
  Current gradient: radial-gradient(circle, #00D4A8 0%, #00B4D8 100%)
  Suggested solid: —
  Category: ✅ Intentional (Login blob)
  ────────────────────────────────────────
  File:line: Login.tsx:26
  Element: Animated blob 4  
  Current gradient: radial-gradient(circle, #FFD93D 0%, #FF6B35 100%)
  Suggested solid: —
  Category: ✅ Intentional (Login blob)
  ────────────────────────────────────────
  File:line: Sidebar.tsx:408
  Element: Nav dashed divider   
  Current gradient: linear-gradient(to right, var(--sidebar-divider) 50%, 
    transparent 50%)
  Suggested solid: —
  Category: ✅ Functional (CSS dashed line trick)
  ────────────────────────────────────────
  File:line: Sidebar.tsx:419
  Element: Nav top scroll fade
  Current gradient: linear-gradient(to bottom, var(--sidebar-bg), transparent)
  Suggested solid: —
  Category: ✅ Functional (scroll UX indicator)
  ────────────────────────────────────────
  File:line: Sidebar.tsx:421
  Element: Nav bottom scroll fade
  Current gradient: linear-gradient(to top, var(--sidebar-bg) 30%, transparent)
  Suggested solid: —
  Category: ✅ Functional (scroll UX indicator)
  ────────────────────────────────────────
  File:line: PipelineColumn.tsx:98
  Element: Kanban column bottom fade
  Current gradient: linear-gradient(to bottom, transparent, var(--main-bg))
  Suggested solid: —
  Category: ✅ Functional (scroll UX indicator)
  ────────────────────────────────────────
  File:line: CrmNBoard.tsx:158
  Element: CRM-N column bottom fade
  Current gradient: linear-gradient(to bottom, transparent, var(--main-bg))
  Suggested solid: —
  Category: ✅ Functional (scroll UX indicator)
  ────────────────────────────────────────
  File:line: Events.tsx:128
  Element: Event cover placeholder
  Current gradient: bg-gradient-to-br from-[#F5F5F5] to-[#EBEBEB]
  Suggested solid: bg-[#EBEBEB]
  Category: 🔴 Fix
  ────────────────────────────────────────
  File:line: Mijozlar.tsx:975
  Element: Cashback balance card bg
  Current gradient: bg-gradient-to-br from-green-50 to-white
  Suggested solid: bg-[#F0FAF4]
  Category: 🔴 Fix
  ────────────────────────────────────────
  File:line: EventDetail.tsx:331
  Element: Event detail page background
  Current gradient: linear-gradient(180deg, #FFFFFF 0%, #FFE7D0 221.79%)
  Suggested solid: bg-[#FFF5EE]
  Category: ⚠️  RISK — see F
  ────────────────────────────────────────
  File:line: BookletCard.tsx:22
  Element: Booklet card background
  Current gradient: linear-gradient(180deg, #FFFFFF 0%, #FFE7D0 221.79%)
  Suggested solid: bg-[#FFF5EE]
  Category: ⚠️  RISK — see F

  Summary: 10 gradients are functional/intentional (keep). 4 need fixing.
  EventDetail + BookletCard share identical gradient — needs your decision (see
  Risk Notes).

  ---
  B) STATUS / BADGE COMPONENTS
 
  Found badge instances (all unique styles):

  File:line: clientStatus.ts + Mijozlar.tsx:387
  Status type: Client activity (Yangi/Faol/Sustlashgan/Yo'qotilgan)
  Radius: rounded-[4px]
  Padding: px-2 py-0.5               
  Font: text-[10px] font-bold
  Border: None
  Color source: Constants file
  ────────────────────────────────────────
  File:line: Hodimlar.tsx:151        
  Status type: Role (admin/manager/xodim)
  Radius: rounded-full ❌
  Padding: px-2 py-0.5
  Font: text-[10px] font-bold
  Border: None
  Color source: Local ROLE_BADGE const
  ────────────────────────────────────────
  File:line: HodimDetail.tsx:392
  Status type: Role (same)
  Radius: rounded-full ❌
  Padding: px-2 py-0.5
  Font: text-[10px] font-bold
  Border: None
  Color source: Duplicate ROLE_BADGE
  ────────────────────────────────────────
  File:line: Hodimlar.tsx:156
  Status type: Employee is_active
  Radius: rounded-full ❌
  Padding: px-2 py-0.5
  Font: text-[10px] font-bold
  Border: None
  Color source: Inline Tailwind
  ────────────────────────────────────────
  File:line: HodimDetail.tsx:396
  Status type: Employee is_active (with dot)
  Radius: —
  Padding: —
  Font: —
  Border: None
  Color source: Inline Tailwind
  ────────────────────────────────────────
  File:line: Mijozlar.tsx:96
  Status type: Cashback tx type
  Radius: rounded-[4px]
  Padding: px-1.5 py-0.5 ❌
  Font: text-[10px] font-bold
  Border: None
  Color source: Inline meta.classes
  ────────────────────────────────────────
  File:line: KanbanCard.tsx:120,126
  Status type: Lead won/lost
  Radius: rounded-full ❌
  Padding: px-2 py-0.5
  Font: text-[10px] font-semibold ❌
  Border: None
  Color source: Inline Tailwind
  ────────────────────────────────────────
  File:line: LeadDetailDrawer.tsx:142
  Status type: AmoCRM lead stage badge
  Radius: rounded-[8px] ❌
  Padding: px-3 py-2 ❌
  Font: text-[12px] font-medium ❌
  Border: border border-red-200 ❌
  Color source: Inline Tailwind
  ────────────────────────────────────────
  File:line: CrmNLeadDrawer.tsx:76
  Status type: CRM-N lead stage badge
  Radius: rounded-[8px] ❌
  Padding: px-3 py-2 ❌
  Font: text-[12px] font-medium ❌
  Border: border border-red-200 ❌
  Color source: Inline Tailwind
  ────────────────────────────────────────
  File:line: EventDetail.tsx:259-260
  Status type: Payment method (naqd/karta)
  Radius: rounded-[4px]
  Padding: px-1.5 py-0.5 ❌
  Font: text-[11px] font-bold ❌
  Border: None
  Color source: Inline Tailwind
  ────────────────────────────────────────
  File:line: EventDetail.tsx:373,378,383
  Status type: Debt/cashback/complete status
  Radius: rounded-[4px]
  Padding: px-1.5 py-0.5 ❌
  Font: text-[11px] font-bold ❌
  Border: None
  Color source: Inline Tailwind
  ────────────────────────────────────────
  File:line: Yangiliklar.tsx:306
  Status type: Post publish status
  Radius: —
  Padding: —
  Font: —
  Border: None
  Color source: Inline Tailwind
  ────────────────────────────────────────
  File:line: Sozlamalar.tsx:50-51
  Status type: User is_active
  Radius: rounded-[8px] ❌
  Padding: px-3 py-2 ❌
  Font: text-[12px] font-medium ❌
  Border: border border-green/red-200 ❌
  Color source: Inline Tailwind
  ────────────────────────────────────────
  File:line: Faollik.tsx:44-46
  Status type: Action type (created/updated/deleted)
  Radius: —
  Padding: —
  Font: —
  Border: None
  Color source: Local ACTION_META
  ────────────────────────────────────────
  File:line: Mijozlar.tsx:944
  Status type: Event attendance
  Radius: —
  Padding: —
  Font: —
  Border: None
  Color source: Inline Tailwind
  ────────────────────────────────────────
  File:line: EventDetail.tsx:576-577
  Status type: Participant payment status
  Radius: rounded-[8px]
  Padding: —
  Font: —
  Border: border green/red-200 ❌
  Color source: Inline Tailwind
  ────────────────────────────────────────
  File:line: CrmNLeadsList.tsx (via PipelineSettingsModal.tsx:308)
  Status type: Error/warning badge
  Radius: rounded
  Padding: px-1.5 py-0.5
  Font: text-[10px] font-bold
  Border: None
  Color source: Inline Tailwind

  ROLE_BADGE definitions (duplicated in 2 files):

  Hodimlar.tsx:8-11  &  HodimDetail.tsx:49-53:
    admin:   bg-purple-50 text-purple-700
    manager: bg-blue-50 text-blue-700
    xodim:   bg-gray-50 text-gray-700

  Inconsistency summary:
  
  - Radius: rounded-full / rounded-[4px] / rounded-[6px] / rounded-[8px] — 4 
  variants  
  - Padding: px-1.5 py-0.5 / px-2 py-0.5 / px-2.5 py-1 / px-3 py-2 — 4 variants
  - Font size: text-[10px] / text-[11px] / text-[12px] — 3 variants
  - Font weight: font-bold / font-semibold / font-medium — 3 variants
  - Borders: some have border border-{color}-200, most don't — mixed
  - No declared height on any badge (all auto-height from padding — varies
  18px–32px)

  Proposed unified spec (for your approval):
  
  h-6 (24px) · px-2.5 · rounded-md (6px) · text-[11px] font-bold
  no border · no shadow · solid bg tint + solid text

  Variant → existing status mapping:

  ┌─────────┬──────────────────────────────────────────────────────────────────┐
  │ variant │                             maps to                              │
  ├─────────┼──────────────────────────────────────────────────────────────────┤
  │ success │ Faol, paid, to'langan, attended, published, is_active=true, won  │
  ├─────────┼──────────────────────────────────────────────────────────────────┤
  │ warning │ Sustlashgan, pending, partial, post draft, manual_subtract       │
  ├─────────┼──────────────────────────────────────────────────────────────────┤
  │ danger  │ Yo'qotilgan, debt, lost, is_active=false, used, deleted,         │
  │         │ clawback                                                         │
  ├─────────┼──────────────────────────────────────────────────────────────────┤
  │ info    │ Yangi, manual_add, karta, updated, info states                   │
  ├─────────┼──────────────────────────────────────────────────────────────────┤
  │ neutral │ naqd, unknown, xodim role, not-attended                          │
  └─────────┴──────────────────────────────────────────────────────────────────┘
  
  ---
  C) DARK STROKES / BORDERS
  
  True violations (need fixing):

  File:line: LeadDetailDrawer.tsx:210
  Element: Inline-edit input (edit mode)
  Current border: border border-[#141414]
  Fix: border border-[#E0E0E0] focus:border-[#141414]
  ────────────────────────────────────────
  File:line: Status badges (multiple — see B above)
  Element: Sozlamalar, EventDetail, LeadDetailDrawer, CrmNLeadDrawer
  Current border: border border-{green/red/orange}-200
  Fix: Removed via StatusBadge (no border)

  Functional border-2 (keep — CSS spinner technique):

  File:line: App.tsx:163
  Element: Notification dot
  Note: border-2 rounded-full — white ring around red badge on dark bg. Functional
  
    visual separator, but uses border-2. Flag — borderline.
  ────────────────────────────────────────
  File:line: LeadDetailDrawer.tsx:505, CrmNLeadDrawer.tsx:450
  Element: Loading spinners
  Note: border-2 border-[#141414] border-t-transparent animate-spin — standard
  dark
    spinner. Keep.
  ────────────────────────────────────────
  File:line: CreateLeadModal.tsx:276, CreateCrmLeadModal.tsx:236, etc.
  Element: Loading spinners
  Note: border-2 border-white border-t-transparent animate-spin — white spinner.
    Keep.
  ────────────────────────────────────────
  File:line: CreateUserModal.tsx:213
  Element: Avatar upload area   
  Note: border-2 border-dashed border-[#E5E5E5] — light dashed, not a dark stroke.

    Keep.

  Focus-state borders (expected behavior — keep all):

  All focus:border-[#141414] on <input> and <textarea> elements — standard
  interactive feedback, not decorative. Not violations.

  ---
  D) FORMATTING
  
  Dates — 7 distinct formats currently in use:

  Format: Manual DD.MM.YYYY (local functions)
  Example output: 16.01.2026
  Where used: Mijozlar, Yangiliklar, EventDetail, Events, CrmNLeadsList,
    KanbanCard, LidCard, CrmNLeadDrawer, CrmNCard
  How many locations: 9 files, all define same function locally
  ────────────────────────────────────────
  Format: toLocaleDateString("uz-UZ")
  Example output: 16.01.2026 (browser-dep.)
  Where used: HodimDetail:63, Hodimlar:161
  How many locations: 2
  ────────────────────────────────────────
  Format: toLocaleDateString("uz-UZ", { day, month: "long", year })
  Example output: 16 yanvar 2026
  Where used: Faollik:328
  How many locations: 1
  ────────────────────────────────────────
  Format: toLocaleDateString("uz-UZ", { month: "long", year })
  Example output: Yanvar 2026   
  Where used: Bolimlar:35 (month selector)
  How many locations: 1
  ────────────────────────────────────────
  Format: toLocaleDateString("uz-UZ", { month: "short", day })
  Example output: 16 yan 
  Where used: amocrm/leads.ts:352,357
  How many locations: 2
  ────────────────────────────────────────
  Format: ISO slice YYYY-MM-DD
  Example output: 2026-01-16
  Where used: Date inputs only (Mijozlar, EventDetail)
  How many locations: keep for <input type="date">
  ────────────────────────────────────────
  Format: toISOString()
  Example output: 2026-01-16T...
  Where used: DB writes / AmoCRM conversion
  How many locations: keep for data layer

  Target: all display functions → formatDate(d) → 16.01.2026
  Exceptions: Faollik (needs "16 yanvar 2026"), Bolimlar (needs "Yanvar 2026") —
  formatDate won't cover these; they need separate handling or optional params.
  
  Currency — 6 distinct patterns:
  
  Pattern: new Intl.NumberFormat("uz-UZ").format(n) +  so'm
  Example output: 12 000 so'm
  Locations: ~10 files (ApplyCashbackModal, AdjustCashbackModal, CashbackBadge,
    Mijozlar, EventDetail formatSom, HodimDetail)
  ────────────────────────────────────────
  Pattern: amount.toLocaleString("uz-UZ") +  so'm
  Example output: 12 000 so'm
  Locations: CrmNLeadsList, CrmNBoard, CrmNCard
  ────────────────────────────────────────
  Pattern: toLocaleString("uz-UZ") + " UZS"
  Example output: 12 000 UZS
  Locations: Mijozlar.tsx:160 (only 1!)
  ────────────────────────────────────────
  Pattern: Intl.NumberFormat("uz-UZ").format(n) (no unit)
  Example output: 12 000 
  Locations: SetKpiTargetsModal, Bolimlar KPI bars
  ────────────────────────────────────────
  Pattern: Local fmt/formatSom/fmtSom/formatAmount functions
  Example output: varies 
  Locations: 7+ locally-defined copies of the same function
  ────────────────────────────────────────
  Pattern: new Intl.NumberFormat("uz-UZ") (in formatNumber prop)
  Example output: 12 000 
  Locations: HodimDetail KPI chart

  Note: uz-UZ locale uses space as thousands separator (12 000), not comma. The
  spec says comma (12,000). This will visually change all numbers.

  Phone — 3 distinct patterns:
  
  ┌──────────────────────┬────────────────────┬───────────────────────────────┐
  │       Pattern        │      Example       │             Where             │
  ├──────────────────────┼────────────────────┼───────────────────────────────┤
  │ Formatted input mask │                    │ Mijozlar.tsx                  │
  │  +998 XX XXX XX XX   │ +998 90 123 45 67  │ handlePhoneChange (local      │
  │                      │                    │ function)                     │
  ├──────────────────────┼────────────────────┼───────────────────────────────┤
  │ Raw display (no      │ +998901234567 or   │ HodimDetail, Hodimlar, Sotuv  │
  │ formatting)          │ 998901234567       │                               │
  ├──────────────────────┼────────────────────┼───────────────────────────────┤
  │ AmoCRM raw tel: href │ any format         │ LeadDetailDrawer:705          │
  └──────────────────────┴────────────────────┴───────────────────────────────┘
  
  ---
  E) BRAND PALETTE
  
  Existing colors (from index.css CSS vars):

  ┌─────────────────────┬─────────────┬──────────────────────────────────────┐
  │        Token        │     Hex     │               Used in                │
  ├─────────────────────┼─────────────┼──────────────────────────────────────┤
  │ Primary text /      │ #141414     │ All themes                           │
  │ neutral accent      │             │                                      │
  ├─────────────────────┼─────────────┼──────────────────────────────────────┤
  │ Brand red-orange    │ #D13328     │ black-orange + light-orange themes   │
  │                     │             │ (sidebar indicator, avatar bg)       │
  ├─────────────────────┼─────────────┼──────────────────────────────────────┤
  │ Sidebar bg          │ #F3F2F0     │ neutral theme                        │
  │ (neutral)           │             │                                      │
  ├─────────────────────┼─────────────┼──────────────────────────────────────┤
  │ Standard border     │ #E0E0E0     │ all themes                           │
  ├─────────────────────┼─────────────┼──────────────────────────────────────┤
  │ Light border        │ #F0F0F0     │ some inputs                          │
  ├─────────────────────┼─────────────┼──────────────────────────────────────┤
  │ Muted text          │ #999999     │ all themes                           │
  ├─────────────────────┼─────────────┼──────────────────────────────────────┤
  │ Main bg             │ #FFFFFF /   │ per theme                            │
  │                     │ #FFFAF8     │                                      │
  ├─────────────────────┼─────────────┼──────────────────────────────────────┤
  │ Notification red    │ #FF3B30     │ App.tsx notification dot             │
  └─────────────────────┴─────────────┴──────────────────────────────────────┘
  
  Department accent colors (from employee.ts):git
  
  ┌──────────────┬─────────┐
  │     Dept     │   Hex   │
  ├──────────────┼─────────┤
  │ Marketing    │ #EC4899 │
  ├──────────────┼─────────┤
  │ Sotuv        │ #3B82F6 │
  ├──────────────┼─────────┤
  │ Buxgalteriya │ #10B981 │
  ├──────────────┼─────────┤
  │ Operatsion   │ #F59E0B │
  ├──────────────┼─────────┤
  │ IT           │ #8B5CF6 │
  ├──────────────┼─────────┤
  │ HR           │ #06B6D4 │
  └──────────────┴─────────┘

  What's missing:

  - No src/lib/constants/theme.ts — brand colors exist only in CSS (not importable
  in TSX)
  - No semantic tokens (success/warning/danger/info/neutral hex values)
  - No defined primary brand color for status badge info variant — currently blue
  Tailwind classes

  Suggested additions for theme.ts:
  
  // Status badge system (proposed)
  success: { bg: '#E6F4EA', text: '#1E7E34' }
  warning: { bg: '#FFF4E5', text: '#B25E00' }
  danger:  { bg: '#FDECEC', text: '#C62828' }
  info:    { bg: '#E8F0FE', text: '#1A56DB' }
  neutral: { bg: '#F0F0F0', text: '#666666' }

  // Brand  
  brand: '#D13328'      // orange-red accent
  primary: '#141414'    // near-black
  
  ---
  F) RISK NOTES
  
  1. EventDetail + BookletCard background gradient (EventDetail.tsx:331,
  BookletCard.tsx:22) — identical linear-gradient(180deg, #FFFFFF 0%, #FFE7D0 
  221.79%). This is a warm cream-to-orange fade that gives events a "premium
  booklet" feel — it's visual identity, not accidental. Replacing with flat
  #FFF5EE loses the warmth gradient. Recommend: ask before changing, same as Login
  blobs.
  2. Sidebar + column scroll fades — 5 gradients (Sidebar.tsx:419/421,
  PipelineColumn.tsx:98, CrmNBoard.tsx:158, Sidebar.tsx:408) use CSS vars
  (var(--sidebar-bg), var(--main-bg)) and serve as scroll overflow indicators.
  They adapt to all 4 themes. Recommend: keep these — they're functional UX, not 
  decorative.
  3. Currency separator change — uz-UZ Intl produces 12 000 (space separator). The
  spec wants 12,000 (comma). This changes every number display in the app.
  Technically correct by spec but visually notable to users. Low risk, just 
  heads-up.
  4. Faollik + Bolimlar date formats — These pages need long-form dates (16 yanvar
  2026, Yanvar 2026) for labeling. formatDate only outputs DD.MM.YYYY. These two
  need special handling or optional format params — otherwise they'll break their
  copy.
  5. AmoCRM phone display — Phone values from AmoCRM can be non-UZ numbers
  (Russian +7, international). formatPhone should handle non-+998 numbers
  gracefully (pass through as-is rather than normalize).
  6. App.tsx:163 — border-2 notification dot — Red notification badge uses
  border-2 for a white separator ring. On dark sidebar backgrounds this is
  visually necessary. Technically violates "no border-2" but removing it may make
  the badge invisible on dark themes. Flag — recommend keeping.
  7. ROLE_BADGE duplication — Defined identically in Hodimlar.tsx and
  HodimDetail.tsx. Phase 2 will consolidate into StatusBadge — this duplication
  disappears automatically.
  8. Error banners vs status badges — Many files have px-3 py-2 bg-red-50 
  text-red-700 border border-red-200 patterns that are error message banners
  (inline form errors), not status badges. These should NOT be replaced with
  <StatusBadge> — they're a different UI component. Phase 2 should skip these.

  ---
  Counts:
  - Gradients to fix: 2 (+ 2 pending your decision on EventDetail/BookletCard)
  - Badge instances to unify: ~25 across 15+ files
  - Dark border violations: 1 (LeadDetailDrawer inline-edit) + badge borders
  removed via StatusBadge
  - Locally-defined date functions: 9 duplicates → 1 util
  - Locally-defined currency functions: 7+ duplicates → 1 util
 
  ---
  Phase 2 ni boshlashim uchun sizning tasdiqlashingizni kutaman.
  EventDetail/BookletCard gradienti haqida ham qaror kerak: ularni ham
  o'zgartiraylikmi yoki Login bloblari kabi saqlaymizmi?
