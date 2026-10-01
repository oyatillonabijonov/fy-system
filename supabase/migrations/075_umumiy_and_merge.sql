-- 075: Sotuv feedback.
--  1. "Umumiy" voronka, first in the list: every incoming call from a number with no open
--     bitim lands there (lead source 'call' switched on and pointed at it). The operator fills
--     in the name later and moves the bitim to the project's voronka (Tog' safari, Akademiya…).
--  2. "Sdelka" is called "Bitim" everywhere now — the feed trigger's text too.
--  3. merge_crm_leads(keep, drop): one client's duplicate open bitimlar become one — the feed,
--     tasks and calls move to the kept bitim, the other is deleted, a feed row records it.

BEGIN;

INSERT INTO public.crm_pipelines (name, sort_order)
SELECT 'Umumiy', (SELECT COALESCE(MIN(sort_order), 0) - 1 FROM public.crm_pipelines)
WHERE NOT EXISTS (SELECT 1 FROM public.crm_pipelines WHERE name = 'Umumiy');

INSERT INTO public.crm_stages (pipeline_id, name, color, sort_order, is_won, is_lost)
SELECT p.id, s.name, s.color, s.ord, s.won, s.lost
FROM public.crm_pipelines p,
     (VALUES ('Yangi', '#378ADD', 0, false, false), ('Bog''lanildi', '#BA7517', 1, false, false),
             ('Saralandi', '#7F77DD', 2, false, false), ('Yutildi', '#1D9E75', 3, true, false),
             ('Yutqazildi', '#E24B4A', 4, false, true)) AS s(name, color, ord, won, lost)
WHERE p.name = 'Umumiy' AND NOT EXISTS (SELECT 1 FROM public.crm_stages WHERE pipeline_id = p.id);

UPDATE public.crm_lead_sources
SET pipeline_id = (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy'), enabled = true
WHERE id = 'call';

ALTER TABLE public.crm_notes DROP CONSTRAINT IF EXISTS crm_notes_kind_check;
ALTER TABLE public.crm_notes ADD CONSTRAINT crm_notes_kind_check CHECK (kind IN ('note', 'created', 'stage', 'lead', 'merged'));

-- Same as 072 except the word
CREATE OR REPLACE FUNCTION public.crm_lead_feed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_notes (lead_id, kind, text, created_by)
    VALUES (NEW.id, 'created', 'Bitim yaratildi', auth.uid());
  ELSIF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.crm_notes (lead_id, kind, text, meta, created_by)
    SELECT NEW.id, 'stage', f.name || ' → ' || t.name,
           jsonb_build_object('from', OLD.stage_id, 'to', NEW.stage_id), auth.uid()
    FROM public.crm_stages f, public.crm_stages t WHERE f.id = OLD.stage_id AND t.id = NEW.stage_id;
  END IF;
  RETURN NULL;
END $$;
UPDATE public.crm_notes SET text = 'Bitim yaratildi' WHERE kind = 'created' AND text = 'Sdelka yaratildi';

CREATE OR REPLACE FUNCTION public.merge_crm_leads(p_keep uuid, p_drop uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  k public.crm_leads;
  d public.crm_leads;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'sotuv-crmn') THEN
    RAISE EXCEPTION 'Sotuv bo''limiga ruxsat yo''q' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO k FROM public.crm_leads WHERE id = p_keep FOR UPDATE;
  SELECT * INTO d FROM public.crm_leads WHERE id = p_drop FOR UPDATE;
  IF k.id IS NULL OR d.id IS NULL OR k.id = d.id THEN
    RAISE EXCEPTION 'Bitim topilmadi' USING ERRCODE = 'no_data_found';
  END IF;
  IF k.client_id IS DISTINCT FROM d.client_id OR k.client_id IS NULL THEN
    RAISE EXCEPTION 'Faqat bitta mijozning bitimlari birlashtiriladi' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.crm_notes SET lead_id = k.id WHERE lead_id = d.id;
  UPDATE public.crm_tasks SET lead_id = k.id WHERE lead_id = d.id;
  UPDATE public.crm_calls SET lead_id = k.id WHERE lead_id = d.id;
  -- Blanks of the kept bitim are filled from the other one
  UPDATE public.crm_leads SET
    price = CASE WHEN k.price > 0 THEN k.price ELSE d.price END,
    responsible_user_id = COALESCE(k.responsible_user_id, d.responsible_user_id),
    updated_at = now()
  WHERE id = k.id;
  INSERT INTO public.crm_notes (lead_id, kind, text, meta, created_by)
  VALUES (k.id, 'merged', 'Birlashtirildi: ' || d.name,
          jsonb_build_object('dropped', d.id, 'pipeline', d.pipeline_id, 'stage', d.stage_id), auth.uid());
  DELETE FROM public.crm_leads WHERE id = d.id;
END $$;
GRANT EXECUTE ON FUNCTION public.merge_crm_leads(uuid, uuid) TO authenticated;

COMMIT;
