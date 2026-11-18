# Telegram — messages tied to the event's date

Status: design (agreed in chat 2026-11-18: "1-si" — relative to the event). Builds on 100/101.

## What
A voronka linked to an event can hold rules: "N days before the event at HH:MM send template X to this voronka's
bitimlar (in these stages)". amo-sync sends them by itself at that time — no confirmation (the rule is the
decision; an admin sets it up in Voronka sozlamalari).

## Rules
- Migration 102: `tg_schedules` (pipeline, template, `days_before` 0–60, `at_time` Tashkent, `stage_ids`
  (empty = every open stage), `enabled`, author) and `tg_schedule_runs` (one row per schedule × bitim:
  sent / failed + reason) — a bitim never gets the same scheduled message twice.
- Due = event start date − days_before, at at_time (Tashkent); it fires within 12 hours after that (a worker
  restart doesn't skip it, a long outage doesn't send a stale reminder days later); the event's date passed →
  nothing.
- Recipients: the voronka's bitimlar, open (not won/lost) unless the rule names won/lost stages explicitly;
  existing chats go freely, new numbers count toward the 30-a-day cap (a refusal is recorded as failed).
- One message every 3 seconds (Telegram flood limits); sent_by = the rule's author.
- UI: Voronka sozlamalari → "Rejalashtirilgan xabarlar" (when the voronka has an event): rules with a
  "N ta yuborildi · M ta ketmadi" line, add / switch off / delete.
