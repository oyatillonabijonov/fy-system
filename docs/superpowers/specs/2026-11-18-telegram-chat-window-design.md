# Telegram — chat window and inbox (redesign of the widget's UI)

Status: design. Date 2026-11-18. Builds on `2026-11-17-telegram-widget-design.md` (backend unchanged).

## Why

The owner tried stage 1: sending works, but "there's no Telegram feeling — it looks like SMS". Telegram sat as a
tab in the Izoh/Vazifa composer and as rows in the bitim feed. They want it to look and behave like AmoCRM's
Telegram widget: its own place, a real chat with history, a blue Telegram button that stays on screen (also while
talking on the phone), on the bitim page and the client card, plus one place in Sotuv bo'limi with every chat.

## Decided with the owner

- **Variant B:** a round blue Telegram button (bottom right) with the unread count; a click opens a floating chat
  window over the page (AmoCRM style), which can be collapsed back to the button.
- A **Sotuv bo'limi → Telegram** page with every chat (list left, chat right, like Telegram Desktop).
- Izoh / Vazifa / SMS stay in the composer as they are.

## The chat window

- Header: avatar + client name, phone, "Kompaniya" (the account it goes from), buttons collapse and close.
- Body: the whole history as Telegram bubbles — ours right (light blue), the client's left (grey); time and
  ✓ / ✓✓ under ours; files as chips that open; date separators ("Bugun", "Kecha", "12-noyabr"); scrolled to the
  newest; live (realtime already refreshes `["telegram"]`).
- Footer: template chips (one tap fills text + files), 📎 attach, text field (Enter sends, Shift+Enter new
  line), send button; errors inline in Uzbek (existing `TG_ERRORS`).
- Opening the window marks the chat read (the lead sees ✓✓) — replaces "opening the bitim marks it read".
- Desktop: 380 × 560 px card bottom right, above the button. Phone (< 640 px): a full-screen sheet, the button
  sits above the tab bar.
- Coexists with the call card (PhoneWidget): the call card's "Ma'lumot yuborish" opens this window.

## Where the button appears

- Bitim page (`/sotuv/bitim/:id`): chat of that bitim's client.
- Mijozlar client card: the client's chat; sending uses the client's latest open bitim (else latest bitim).
- Shown when the client has a phone or a chat exists.

## Telegram page (`/sotuv/telegram`)

- Sidebar: Sotuv bo'limi → Bitimlar / Qo'ng'iroqlar / **Telegram** (unread badge moves here from "Bitimlar"); phone:
  in "Yana" and the seller layout keeps its tabs (Bugun's "Javob kutyapti" stays).
- Left: chats newest first — avatar, name, last message line, time, unread badge; search by name/phone;
  filter "Mening" (my bitimlar + unowned) / "Hammasi".
- Right: the same chat view as the window + "Bitimni ochish" link. Phone: list → tap → full-screen chat.

## Removed

- The Telegram tab in the bitim composer and Telegram rows in the bitim feed (the chat holds the history).
- The phone-number menu's "Telegram'da yozish" now opens the window instead of a sheet.

## Data

No migration. New query: chats list with last message (`tg_chats` + newest `tg_messages` row per chat, client
name/phone, lead owner), client-scoped chat (`tg_chats.client_id`). Sending is unchanged (`/hooks/tg/send` with a
`lead_id`).

## Left to the builder

Component split (one `TgChat` view used by the window and the page), exact spacing within Plexus tokens; Telegram
blue `#2AABEE` is a brand data colour (allowed like other data colours).
