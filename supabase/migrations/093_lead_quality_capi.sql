-- 093: lead quality + Meta Conversions API queue.
-- amo-sync scores a site form that carries Lavozim / Oylik aylanma (src/leadScore.ts) and writes
-- crm_leads.lead_score / qualified (score >= the voronka's lead_threshold) / capi (the form's event_id,
-- fbc, fbp, page URL, visitor IP and browser). Triggers here queue Meta events into meta_events_log —
-- the queue and the log in one — and amo-sync (src/capi.ts) sends them:
--   Lead          a bitim becomes qualified (event_id = the form's, so Meta merges it with the browser's)
--   QualifiedLead a call analysis says yozildi / qayta qo'ng'iroq / o'ylab ko'radi (not rad etdi / maqsadsiz)
--   Purchase      the bitim is won (value = Summa) or a payment lands on the voronka's event (value = price)
-- Once per bitim per event (UNIQUE), and only for bitimlar that came through a scored site form (capi).
BEGIN;

ALTER TABLE public.crm_leads
  ADD COLUMN lead_score integer,
  ADD COLUMN qualified  boolean,
  ADD COLUMN capi       jsonb;
ALTER TABLE public.crm_pipelines
  ADD COLUMN lead_threshold integer NOT NULL DEFAULT 4 CHECK (lead_threshold BETWEEN 0 AND 7);

-- Staff may edit bitimlar (RLS), but the score and the Meta fields are amo-sync's
CREATE OR REPLACE FUNCTION public.guard_lead_quality()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.lead_score, NEW.qualified, NEW.capi) IS DISTINCT FROM (OLD.lead_score, OLD.qualified, OLD.capi) THEN
    RAISE EXCEPTION 'Lid bahosini faqat tizim yozadi' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trigger_guard_lead_quality BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_lead_quality();

CREATE TABLE public.meta_events_log (
  id          bigserial   PRIMARY KEY,
  lead_id     uuid        NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  event_name  text        NOT NULL CHECK (event_name IN ('Lead', 'QualifiedLead', 'Purchase')),
  event_id    text        NOT NULL,
  event_time  timestamptz NOT NULL DEFAULT now(),
  value       numeric,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts    integer     NOT NULL DEFAULT 0,
  next_try_at timestamptz NOT NULL DEFAULT now(),
  response    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,
  UNIQUE (lead_id, event_name)
);
CREATE INDEX idx_meta_events_due ON public.meta_events_log (next_try_at) WHERE status = 'pending';
ALTER TABLE public.meta_events_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta events admin read" ON public.meta_events_log FOR SELECT USING (public.is_admin(auth.uid()));
GRANT SELECT ON public.meta_events_log TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.meta_events_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_meta_event(p_lead uuid, p_event text, p_value numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_capi jsonb;
BEGIN
  SELECT capi INTO v_capi FROM public.crm_leads WHERE id = p_lead;
  IF v_capi IS NULL THEN RETURN; END IF;   -- not brought by a scored site form
  INSERT INTO public.meta_events_log (lead_id, event_name, event_id, value)
  VALUES (p_lead, p_event,
          CASE WHEN p_event = 'Lead' THEN COALESCE(NULLIF(v_capi->>'event_id', ''), p_lead || '_Lead') ELSE p_lead || '_' || p_event END,
          p_value)
  ON CONFLICT (lead_id, event_name) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.queue_meta_event(uuid, text, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.meta_on_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.qualified AND (TG_OP = 'INSERT' OR OLD.qualified IS DISTINCT FROM true) THEN
    PERFORM public.queue_meta_event(NEW.id, 'Lead');
  END IF;
  IF NEW.is_won AND (TG_OP = 'INSERT' OR NOT OLD.is_won) THEN
    PERFORM public.queue_meta_event(NEW.id, 'Purchase', NEW.price);
  END IF;
  RETURN NULL;
END $$;
-- No column list: is_won is set by the stage trigger, and UPDATE OF fires only for columns in the SET list
CREATE TRIGGER trigger_meta_on_lead AFTER INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.meta_on_lead();

-- Call analysis outcome is free text from the model: apostrophes folded before matching
CREATE OR REPLACE FUNCTION public.meta_on_call_analysis()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_out text := regexp_replace(lower(COALESCE(NEW.outcome, '')), '[‘’ʻʼ`´]', '''', 'g'); v_lead uuid;
BEGIN
  IF NEW.status <> 'done' OR (TG_OP = 'UPDATE' AND OLD.status = 'done') THEN RETURN NULL; END IF;
  IF v_out ~ '(yozildi|qayta qo''ng''iroq|o''ylab ko''radi)' AND v_out !~ '(maqsadsiz|rad etdi)' THEN
    SELECT lead_id INTO v_lead FROM public.crm_calls WHERE uuid = NEW.call_uuid;
    IF v_lead IS NOT NULL THEN PERFORM public.queue_meta_event(v_lead, 'QualifiedLead'); END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trigger_meta_on_call_analysis AFTER INSERT OR UPDATE OF status ON public.crm_call_analyses
  FOR EACH ROW EXECUTE FUNCTION public.meta_on_call_analysis();

-- A payment finds its bitim through the client and the voronka tied to the payment's event
CREATE OR REPLACE FUNCTION public.meta_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_lead uuid; v_price numeric;
BEGIN
  IF NEW.kind <> 'payment' THEN RETURN NULL; END IF;
  SELECT l.id, ep.price INTO v_lead, v_price
  FROM public.event_participants ep
  JOIN public.crm_pipelines p ON p.event_id = ep.event_id
  JOIN public.crm_leads l ON l.pipeline_id = p.id AND l.client_id = ep.contact_id
  WHERE ep.id = NEW.participant_id
  ORDER BY l.created_at DESC LIMIT 1;
  IF v_lead IS NOT NULL THEN PERFORM public.queue_meta_event(v_lead, 'Purchase', v_price); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trigger_meta_on_payment AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.meta_on_payment();

COMMIT;
