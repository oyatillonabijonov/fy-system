# Telegram chat window and inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram looks like a real chat: a blue floating button + AmoCRM-style chat window on the bitim page and client card, and a Sotuv bo'limi → Telegram inbox.

**Architecture:** One `TgChat` view (header, bubbles with day separators, composer) used by both the floating window (`TgWidget`) and the inbox page. Data is client-scoped (`tg_chats.client_id`); sending keeps `/hooks/tg/send` with a `lead_id`. Window open state lives in the URL (`?tg=1`) so the call card and the phone menu can open it.

**Tech Stack:** React 19, TanStack Query, Tailwind/Plexus, Phosphor icons.

**Spec:** `docs/superpowers/specs/2026-11-18-telegram-chat-window-design.md`

## Global Constraints

- No migration, no worker change.
- Telegram blue `#2AABEE` only for the button and our bubbles' accent; bubbles: ours `bg-[#D7EEFC] text-[#0C447C]` (dark: `bg-[#163b55] text-[#d7eefc]`), theirs `bg-surface-sunken`.
- Window 380 × 560 px desktop, full-screen below 640 px; button bottom-right, above the mobile tab bar (`--tabbar-h`).
- Day labels: "Bugun", "Kecha", else `d-oy` (`12-noyabr`); time `HH:MM` Tashkent.
- Enter sends, Shift+Enter new line. Errors via existing `tgErrorText`.
- Plexus utilities, pill buttons, no shadows except none (window separated by `border-line`), DM Sans ≤ 600, Uzbek copy.

## Review Focus

1. A client with a phone but no chat yet → window opens empty with "Hali yozishma yo'q" and can send (first contact).
2. A chat whose bitim is closed → the client card / inbox still sends (uses the chat's lead, else the client's latest bitim).
3. New incoming message while the window is open → appears without reload and is marked read.
4. Phone width → window is full screen, no sideways scroll, composer above the keyboard.
5. The call card's "Ma'lumot yuborish" while already on that bitim → window opens (URL param change, no remount needed).

---

### Task 1: Helpers, queries, hooks

**Files:** Modify `src/lib/telegram.ts`, `src/lib/telegram.test.ts`, `src/lib/supabase/queries/telegram.ts`, `src/hooks/useTelegram.ts`.

**Produces:**
- `dayLabel(iso: string, today: string): string` and `withDays<T extends { created_at: string }>(msgs: T[], today: string): ({ day: string } | T)[]` (a `{ day }` marker before the first message of each Tashkent day).
- `filterInbox(rows: TgInboxRow[], q: string, mine: boolean, uid: string | null): TgInboxRow[]` (q matches title/phone digits; mine = owner is uid or unowned).
- `getClientTelegram(clientId) → { chats, messages }`, `getTgInbox() → TgInboxRow[]` (`{ id, title, phone, unread, last_message_at, lead_id, client_id, owner_id, last: { text, files, direction } | null }`), `getClientLeadId(clientId) → string | null` (open bitim first, newest).
- Hooks `useClientTelegram(clientId)`, `useTgInbox()`, `useClientLeadId(clientId)`; `useReadTelegram` keeps taking a lead id.
- [ ] Test first (`telegram.test.ts`): `dayLabel` today/yesterday/older (`"2026-11-12T09:00:00Z"` with today `2026-11-18` → `"12-noyabr"`); `withDays` inserts one marker per day; `filterInbox` by name, by phone digits, mine/unowned. Run → FAIL. Implement → PASS. `tsc -b` clean. Commit.

### Task 2: `TgChat` view

**Files:** Create `src/components/telegram/TgChat.tsx`; Modify `src/components/telegram/TgComposer.tsx` (becomes the footer: chips, 📎, auto-growing textarea, Enter sends); Delete `src/components/telegram/TgFeedItem.tsx` after Task 3 removes its use.

**Produces:** `TgChat({ clientId, leadId, title, phone, onClose?, onCollapse? })` — header, scrollable bubbles (`withDays`), empty state "Hali yozishma yo'q — birinchi xabarni yuboring", footer; marks read on mount and whenever unread > 0 while mounted.
- [ ] Build; `tsc -b`, eslint clean on the file. Commit.

### Task 3: Floating button + window on bitim page and client card

**Files:** Create `src/components/telegram/TgWidget.tsx`; Modify `src/components/pages/SotuvLead.tsx` (mount widget; remove the Telegram composer tab, feed rows, `useReadTelegram` effect; phone menu item sets `?tg=1`), `src/components/pages/Mijozlar.tsx` (mount widget in the client card), `src/components/sotuv/PhoneWidget.tsx` (`?tg=1` instead of `?tab=telegram`).

**Produces:** `TgWidget({ clientId, leadId, title, phone })` — round `#2AABEE` button with `TgBadge`, opens `TgChat` in a 380 × 560 card (desktop) / full-screen (phone); open state = `tg` search param.
- [ ] Build; `tsc -b`, eslint; browser check if a signed-in preview is available. Commit.

### Task 4: Sotuv bo'limi → Telegram page

**Files:** Create `src/components/pages/SotuvTelegram.tsx`; Modify `src/App.tsx` (route `/sotuv/telegram` with `module="sotuv-crmn"`, `PAGE_META`), `src/components/layout/nav.ts` (sub-item "Telegram" after Qo'ng'iroqlar), `src/components/layout/Sidebar.tsx` + `MobileNav.tsx` (badge on `/sotuv/telegram`).
- [ ] List (search, Mening/Hammasi, rows with avatar, last line, time, badge) + `TgChat` on the right with "Bitimni ochish"; phone: list → full-screen chat. Build, lint. Commit.

### Task 5: Ship

- [ ] `bun run build`, eslint on touched files, web tests; fresh review of the branch; PR, merge, pull main checkout; CLAUDE.md Telegram note updated.
