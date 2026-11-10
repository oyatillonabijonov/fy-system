-- 090: AI analysis of sales calls. amo-sync takes each answered call (one at a time, through
-- call_analysis_claim()), has Gemini write it down and judge the seller, and stores one row
-- per call here. A seller reads the analyses of their own calls; admins and managers read
-- all. The per-seller numbers come from call_analysis_stats(). The sales script is one
-- editable text the AI compares calls with. Only calls that start after this migration is
-- applied are analysed (amo_sync_state 'call_analysis_from').
BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_call_analyses (
  call_uuid     text        PRIMARY KEY REFERENCES public.crm_calls(uuid) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed', 'skipped')),
  attempts      integer     NOT NULL DEFAULT 0,
  next_try_at   timestamptz NOT NULL DEFAULT now(),
  last_try_at   timestamptz,
  model         text,
  language      text,
  error         text,
  transcript    jsonb,       -- [{t, who: seller|client, text}]
  summary       text,
  outcome       text,
  score         integer     CHECK (score BETWEEN 0 AND 100),   -- NULL = not scored (too short, no content)
  criteria      jsonb,       -- [{name, score|null, comment}]
  good          jsonb,       -- [text]
  mistakes      jsonb,       -- [{t, quote, why, better, tag}]
  words         jsonb,       -- [{word, count, why}]
  advice        jsonb,       -- [text]
  script_missed jsonb,       -- [text]
  created_at    timestamptz NOT NULL DEFAULT now(),
  analysed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_call_analyses_pending ON public.crm_call_analyses (next_try_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.sales_script (
  id         boolean     PRIMARY KEY DEFAULT true CHECK (id),
  body       text        NOT NULL DEFAULT '',
  updated_at timestamptz,
  updated_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.sales_script (id) VALUES (true) ON CONFLICT DO NOTHING;

INSERT INTO public.amo_sync_state (key, value) VALUES ('call_analysis_from', extract(epoch FROM now())::bigint::text)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_manager(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role IN ('admin', 'manager') AND COALESCE(is_active, true));
$$;

ALTER TABLE public.crm_call_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call analyses read" ON public.crm_call_analyses FOR SELECT USING (
  public.has_permission(auth.uid(), 'sotuv-crmn')
  AND (public.is_manager(auth.uid())
       OR EXISTS (SELECT 1 FROM public.crm_calls c WHERE c.uuid = call_uuid AND c.staff_id = auth.uid())));
GRANT SELECT ON public.crm_call_analyses TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.crm_call_analyses FROM anon, authenticated;   -- written only by amo-sync

ALTER TABLE public.sales_script ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales script read" ON public.sales_script FOR SELECT USING (public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY "sales script edit" ON public.sales_script FOR UPDATE
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, UPDATE ON public.sales_script TO authenticated;
REVOKE INSERT, DELETE ON public.sales_script FROM anon, authenticated;

-- The next call to analyse, with the facts the AI is given. Taking it leases it for 10 minutes
-- (next_try_at), so a crash or an overlapping tick can't run the same call twice at once.
CREATE OR REPLACE FUNCTION public.call_analysis_claim()
RETURNS TABLE (call_uuid text, direction text, started_at timestamptz, duration integer, talk_time integer, attempts integer,
               seller_name text, client_name text, event_name text, event_date timestamptz, tariffs text, script text)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_uuid text;
BEGIN
  SELECT c.uuid INTO v_uuid
  FROM public.crm_calls c LEFT JOIN public.crm_call_analyses a ON a.call_uuid = c.uuid
  WHERE c.talk_time > 0
    AND c.started_at >= to_timestamp((SELECT value FROM public.amo_sync_state WHERE key = 'call_analysis_from')::bigint)
    AND c.started_at > now() - interval '1 day'
    AND (a.call_uuid IS NULL OR (a.status = 'pending' AND a.next_try_at <= now()))
  ORDER BY c.started_at
  LIMIT 1
  FOR UPDATE OF c SKIP LOCKED;
  IF v_uuid IS NULL THEN RETURN; END IF;

  INSERT INTO public.crm_call_analyses AS a (call_uuid, next_try_at, last_try_at)
  VALUES (v_uuid, now() + interval '10 minutes', now())
  ON CONFLICT ON CONSTRAINT crm_call_analyses_pkey DO UPDATE SET next_try_at = excluded.next_try_at, last_try_at = excluded.last_try_at;

  RETURN QUERY
  SELECT c.uuid, c.direction, c.started_at, c.duration, c.talk_time, a.attempts,
         p.full_name, CASE WHEN cl.full_name ~ '[^0-9+ ()-]' THEN cl.full_name END,   -- a bitim named by the phone isn't a name
         e.name, e.date,
         (SELECT string_agg(t.name || ': ' || t.price::bigint, '; ' ORDER BY t.sort_order) FROM public.event_tariffs t WHERE t.event_id = e.id),
         (SELECT NULLIF(btrim(s.body), '') FROM public.sales_script s)
  FROM public.crm_calls c
  JOIN public.crm_call_analyses a ON a.call_uuid = c.uuid
  LEFT JOIN public.profiles p ON p.id = c.staff_id
  LEFT JOIN public.clients cl ON cl.id = c.client_id
  LEFT JOIN public.crm_leads l ON l.id = c.lead_id
  LEFT JOIN public.crm_pipelines pl ON pl.id = l.pipeline_id
  LEFT JOIN public.events e ON e.id = pl.event_id
  WHERE c.uuid = v_uuid;
END $$;
REVOKE ALL ON FUNCTION public.call_analysis_claim() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.requeue_call_analysis(p_call text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Faqat admin' USING ERRCODE = '42501'; END IF;
  UPDATE public.crm_call_analyses SET status = 'pending', attempts = 0, next_try_at = now(), error = NULL WHERE call_uuid = p_call;
END $$;
REVOKE ALL ON FUNCTION public.requeue_call_analysis(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.requeue_call_analysis(text) TO authenticated;

-- Per seller for a period (Tashkent days of the call): calls analysed, average score, weekly
-- averages, the 3 most repeated mistake tags. A non-manager gets their own row only.
CREATE OR REPLACE FUNCTION public.call_analysis_stats(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_all boolean := public.is_manager(auth.uid());
BEGIN
  IF NOT public.has_permission(auth.uid(), 'sotuv-crmn') THEN RAISE EXCEPTION 'Ruxsat yo''q' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('sellers', COALESCE((
    WITH rows AS (
      SELECT c.staff_id, a.score, a.mistakes, (c.started_at AT TIME ZONE 'Asia/Tashkent')::date AS day
      FROM public.crm_call_analyses a JOIN public.crm_calls c ON c.uuid = a.call_uuid
      WHERE a.status = 'done' AND c.staff_id IS NOT NULL AND (v_all OR c.staff_id = auth.uid())
        AND (c.started_at AT TIME ZONE 'Asia/Tashkent')::date BETWEEN p_from AND p_to),
    sellers AS (
      SELECT r.staff_id, count(*)::int AS calls, round(avg(r.score))::int AS avg_score FROM rows r GROUP BY r.staff_id)
    SELECT jsonb_agg(jsonb_build_object(
      'staff_id', s.staff_id, 'name', p.full_name, 'calls', s.calls, 'avg_score', s.avg_score,
      'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('week', w.week, 'avg', w.avg, 'calls', w.calls) ORDER BY w.week)
                FROM (SELECT date_trunc('week', r.day)::date AS week, round(avg(r.score))::int AS avg, count(*)::int AS calls
                      FROM rows r WHERE r.staff_id = s.staff_id GROUP BY 1) w), '[]'::jsonb),
      'tags', COALESCE((SELECT jsonb_agg(jsonb_build_object('tag', t.tag, 'count', t.n) ORDER BY t.n DESC, t.tag)
                FROM (SELECT m->>'tag' AS tag, count(*)::int AS n
                      FROM rows r, jsonb_array_elements(COALESCE(r.mistakes, '[]'::jsonb)) m
                      WHERE r.staff_id = s.staff_id AND m->>'tag' IS NOT NULL
                      GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 3) t), '[]'::jsonb))
      ORDER BY s.avg_score DESC NULLS LAST, p.full_name)
    FROM sellers s JOIN public.profiles p ON p.id = s.staff_id), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.call_analysis_stats(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_analysis_stats(date, date) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_call_analyses;

COMMIT;
