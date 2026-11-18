-- 102: Telegram messages tied to the voronka's event date (docs/superpowers/specs/2026-11-18-telegram-scheduled-design.md).
-- amo-sync sends them; a bitim gets each scheduled message at most once (tg_schedule_runs).
BEGIN;
CREATE TABLE public.tg_schedules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid        NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  template_id uuid        NOT NULL REFERENCES public.tg_templates(id) ON DELETE CASCADE,
  days_before integer     NOT NULL DEFAULT 1 CHECK (days_before BETWEEN 0 AND 60),
  at_time     time        NOT NULL DEFAULT '10:00',
  stage_ids   uuid[]      NOT NULL DEFAULT '{}',          -- empty = every open stage
  enabled     boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tg_schedule_runs (
  schedule_id uuid        NOT NULL REFERENCES public.tg_schedules(id) ON DELETE CASCADE,
  lead_id     uuid        NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  status      text        NOT NULL CHECK (status IN ('sent', 'failed')),
  error       text,
  at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, lead_id)
);
ALTER TABLE public.tg_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tg_schedule_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_schedules sotuv read" ON public.tg_schedules FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'sotuv-crmn') OR public.is_admin(auth.uid()));
CREATE POLICY "tg_schedules admin write" ON public.tg_schedules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "tg_schedule_runs sotuv read" ON public.tg_schedule_runs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'sotuv-crmn') OR public.is_admin(auth.uid()));
REVOKE ALL ON public.tg_schedules, public.tg_schedule_runs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tg_schedules TO authenticated;
GRANT SELECT ON public.tg_schedule_runs TO authenticated;
COMMIT;
