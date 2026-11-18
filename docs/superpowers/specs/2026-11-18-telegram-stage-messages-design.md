# Telegram — templates per voronka and a message offered on a stage move

Status: design (agreed in chat 2026-11-18). Builds on the Telegram widget (100) and the chat window.

## Why
Each event / voronka has its own material (text + PDF). Sellers shouldn't hunt for files or send the wrong
event's PDF; moving a bitim to e.g. "Ma'lumot berildi" should offer the voronka's message right away.

## Decided with the owner
- Both together: (1) a template can belong to one voronka, (2) a stage can carry a template.
- On a stage move the app **asks first**: "Mijozga «Nonushta haqida» Telegramda yuborilsinmi?" — Yuborish / Yo'q.
  Nothing is sent without that click (a wrong drag must not message a client).

## Design
- Migration 101: `tg_templates.pipeline_id` (NULL = every voronka; voronka deleted → NULL),
  `crm_stages.tg_template_id` (template deleted → NULL).
- Template editor (Integratsiyalar → Telegram → Shablonlar): "Voronka" select (Hammasi / one voronka); the list
  shows it.
- Chat footer chips: only templates of the bitim's voronka plus the "Hammasi" ones.
- Voronka sozlamalari: each stage row gets a "Telegram xabari" select (that voronka's + general templates, or none).
- Stage move (Kanban drop, bitim page stage strip / select, mobile chips): after the move is saved, if the new
  stage has a template → the confirm dialog → `POST /hooks/tg/send {lead_id, template_id, text: body}`; success
  toast "Telegramga yuborildi", a refusal shows the Uzbek error (number not on Telegram, cap…).
- Later (not now): time-based messages (e.g. a day before the event).
