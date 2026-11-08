-- 088: leads shared out to sellers, per voronka (Voronka sozlamalari → "Lidlarni taqsimlash").
-- A bitim nobody opened by hand (form, call: created_by NULL) with no owner goes to the
-- ticked seller who has gone longest without one. A client already with a ticked seller's
-- open bitim stays with that seller, and it counts as their turn. Bitimlar opened by hand
-- and voronka moves keep their owner. The Dashboard's seller numbers read the owner as is.
BEGIN;

ALTER TABLE public.crm_pipelines ADD COLUMN IF NOT EXISTS auto_assign boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.crm_pipeline_sellers (
  pipeline_id      uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_assigned_at timestamptz,   -- NULL = just ticked: gets the next lead
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pipeline_id, user_id)
);
ALTER TABLE public.crm_pipeline_sellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_pipeline_sellers read" ON public.crm_pipeline_sellers FOR SELECT USING (public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY "crm_pipeline_sellers admin" ON public.crm_pipeline_sellers FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipeline_sellers TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_lead_auto_assign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_seller uuid;
BEGIN
  IF NEW.responsible_user_id IS NOT NULL OR NEW.created_by IS NOT NULL THEN RETURN NULL; END IF;
  -- One lead at a time per voronka, or two at once would take the same turn.
  -- NO KEY: doesn't block the foreign-key checks of other bitimlar being inserted.
  PERFORM 1 FROM public.crm_pipelines WHERE id = NEW.pipeline_id AND auto_assign FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT l.responsible_user_id INTO v_seller
  FROM public.crm_leads l
  JOIN public.crm_pipeline_sellers s ON s.pipeline_id = NEW.pipeline_id AND s.user_id = l.responsible_user_id
  JOIN public.profiles p ON p.id = s.user_id AND COALESCE(p.is_active, true)
  WHERE l.client_id = NEW.client_id AND l.id <> NEW.id AND NOT l.is_won AND NOT l.is_lost
  ORDER BY l.created_at DESC LIMIT 1;

  IF v_seller IS NULL THEN
    SELECT s.user_id INTO v_seller
    FROM public.crm_pipeline_sellers s
    JOIN public.profiles p ON p.id = s.user_id AND COALESCE(p.is_active, true)
    WHERE s.pipeline_id = NEW.pipeline_id
    ORDER BY s.last_assigned_at NULLS FIRST, s.created_at, s.user_id LIMIT 1;
  END IF;
  IF v_seller IS NULL THEN RETURN NULL; END IF;

  UPDATE public.crm_pipeline_sellers SET last_assigned_at = clock_timestamp()
  WHERE pipeline_id = NEW.pipeline_id AND user_id = v_seller;
  UPDATE public.crm_leads SET responsible_user_id = v_seller WHERE id = NEW.id;
  INSERT INTO public.crm_notes (lead_id, kind, text, meta, created_at)
  SELECT NEW.id, 'created', 'Avtomatik taqsimlandi: ' || COALESCE(p.full_name, 'sotuvchi'),
         jsonb_build_object('auto_assigned', v_seller), clock_timestamp()
  FROM public.profiles p WHERE p.id = v_seller;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.crm_lead_auto_assign() FROM PUBLIC, anon, authenticated;

-- zz: after trigger_crm_lead_feed (same-event triggers fire by name), so "created" comes first
DROP TRIGGER IF EXISTS trigger_crm_lead_zz_auto_assign ON public.crm_leads;
CREATE TRIGGER trigger_crm_lead_zz_auto_assign AFTER INSERT ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_lead_auto_assign();

COMMIT;
