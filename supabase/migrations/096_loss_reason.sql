-- 096: a bitim moved to a lost stage must say why — one of seven fixed reasons (crm_leads.loss_reason
-- was free text and almost never filled: 2 of 46). The reason is cleared when the bitim leaves the lost
-- stage. Bitimlar lost before this keep what they have (NULL or their free text) until someone edits it.
-- lost_reasons() = the reasons of a period for the Claude connector's sales_stats (dashboard module).
BEGIN;

CREATE OR REPLACE FUNCTION public.crm_loss_reasons() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['Narx', 'Vaqt to''g''ri kelmadi', 'Tadbirkor emas', 'Tasodifiy ariza', 'Noto''g''ri raqam', 'Javob bermadi', 'Boshqa']
$$;

CREATE OR REPLACE FUNCTION public.crm_lead_loss_reason()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_lost boolean;
BEGIN
  SELECT is_lost INTO v_lost FROM public.crm_stages WHERE id = NEW.stage_id;
  IF NOT COALESCE(v_lost, false) THEN
    NEW.loss_reason := NULL;
  ELSIF (TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id OR NEW.loss_reason IS DISTINCT FROM OLD.loss_reason)
        AND (NEW.loss_reason IS NULL OR NEW.loss_reason <> ALL (public.crm_loss_reasons())) THEN
    RAISE EXCEPTION 'Yutqazish sababini tanlang' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trigger_crm_lead_loss_reason ON public.crm_leads;
CREATE TRIGGER trigger_crm_lead_loss_reason BEFORE INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_lead_loss_reason();

CREATE OR REPLACE FUNCTION public.lost_reasons(p_from date, p_to date, p_pipeline uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t0 timestamptz; t1 timestamptz;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'dashboard') THEN
    RAISE EXCEPTION 'Dashboard''ga ruxsat yo''q' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Davr noto''g''ri' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  t0 := p_from::timestamp AT TIME ZONE 'Asia/Tashkent';
  t1 := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Tashkent';
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('reason', reason, 'count', n) ORDER BY n DESC, reason)
    FROM (SELECT COALESCE(loss_reason, 'Ko''rsatilmagan') AS reason, count(*) AS n FROM public.crm_leads
          WHERE is_lost AND closed_at >= t0 AND closed_at < t1 AND (p_pipeline IS NULL OR pipeline_id = p_pipeline)
          GROUP BY 1) x), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.lost_reasons(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lost_reasons(date, date, uuid) TO authenticated;

COMMIT;
