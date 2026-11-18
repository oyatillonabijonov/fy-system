-- 101: Telegram templates per voronka + a template offered when a bitim enters a stage
-- (docs/superpowers/specs/2026-11-18-telegram-stage-messages-design.md). The web asks before sending.
BEGIN;
ALTER TABLE public.tg_templates ADD COLUMN pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE SET NULL;   -- NULL = every voronka
ALTER TABLE public.crm_stages   ADD COLUMN tg_template_id uuid REFERENCES public.tg_templates(id) ON DELETE SET NULL;
COMMIT;
