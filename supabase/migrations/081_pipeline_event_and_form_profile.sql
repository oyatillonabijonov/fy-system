-- 081: Sotuv round.
--  1. A voronka can belong to one event (crm_pipelines.event_id; the event deleted → the link clears).
--     The bitim page then offers "Tadbirga yozish" for that event.
--  2. Form answers (079's crm_leads.fields) fill the client's EMPTY card fields — "Lavozim…" → role,
--     "Soha…/Faoliyat…" → activity, "Kompaniya…" → company — so Mijozlar has less to ask for.
--     What staff already typed is never overwritten. Existing leads are backfilled.

ALTER TABLE public.crm_pipelines ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.fill_client_from_fields(p_client uuid, p_fields jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH a AS (
    SELECT f->>'k' AS k, btrim(f->>'v') AS v FROM jsonb_array_elements(COALESCE(p_fields, '[]'::jsonb)) f WHERE btrim(f->>'v') <> ''
  ), x AS (
    SELECT (SELECT v FROM a WHERE k ~* '(lavozim|position|job|должност)' LIMIT 1) AS role,
           (SELECT v FROM a WHERE k ~* '(soha|faoliyat|activity|industry|сфер)' LIMIT 1) AS activity,
           (SELECT v FROM a WHERE k ~* '(kompaniya|company|tashkilot|brend|brand|компани)' LIMIT 1) AS company
  )
  UPDATE public.clients c SET
    role     = COALESCE(NULLIF(btrim(c.role), ''), x.role),
    activity = COALESCE(NULLIF(btrim(c.activity), ''), x.activity),
    company  = COALESCE(NULLIF(btrim(c.company), ''), x.company)
  FROM x
  WHERE c.id = p_client AND p_client IS NOT NULL
    AND ((NULLIF(btrim(c.role), '') IS NULL AND x.role IS NOT NULL)
      OR (NULLIF(btrim(c.activity), '') IS NULL AND x.activity IS NOT NULL)
      OR (NULLIF(btrim(c.company), '') IS NULL AND x.company IS NOT NULL));
$$;
REVOKE ALL ON FUNCTION public.fill_client_from_fields(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.crm_lead_fill_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.fill_client_from_fields(NEW.client_id, NEW.fields);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trigger_crm_lead_fill_client ON public.crm_leads;
CREATE TRIGGER trigger_crm_lead_fill_client AFTER INSERT OR UPDATE OF fields, client_id ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_lead_fill_client();

-- Backfill: the leads that already carry form answers
DO $$ BEGIN
  PERFORM public.fill_client_from_fields(client_id, fields) FROM public.crm_leads WHERE jsonb_array_length(fields) > 0;
END $$;
