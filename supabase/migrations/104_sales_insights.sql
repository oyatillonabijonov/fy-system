-- 104: the Dashboard's second batch (Nuriddin's spec, 2-navbat), in its own function so the first
-- screen stays one fast call: sales_insights() =
--  * quality   — bitimlar opened in the period: all → qualified → won, and the same per score 0–7
--  * lost_reasons — why the period's lost bitimlar were lost (096's lost_reasons())
--  * activity  — leads, outgoing / connected / incoming calls by day and by hour of the day (Tashkent)
--  * by_ad     — the period's bitimlar by source → campaign → ad set → creative: leads, qualified, won,
--                seats and (Moliya right) agreed / paid
--  * cycle     — won in the period: days from the bitim to its first payment (no payment = the day it was won)
-- A bitim's seat = its client's place at its voronka's event. A guest enrolled beside the buyer has no
-- bitim, so by_ad counts one seat a bitim.
-- Loss reasons: four more to pick from; free text typed before 096 goes to the nearest fixed reason.
BEGIN;

CREATE OR REPLACE FUNCTION public.crm_loss_reasons() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['Narx', 'Vaqt to''g''ri kelmadi', 'Tadbirkor emas', 'Tasodifiy ariza', 'Noto''g''ri raqam', 'Javob bermadi',
               'Dubl', 'Keyingi tadbirga', 'Boshqa shaharda', 'Raqobatchi', 'Boshqa']
$$;

UPDATE public.crm_leads SET loss_reason = CASE
    WHEN loss_reason ~* 'vaqt' THEN 'Vaqt to''g''ri kelmadi'
    WHEN loss_reason ~* 'narx|qimmat' THEN 'Narx'
    WHEN loss_reason ~* 'bog.?lan|javob|ko.?tarm' THEN 'Javob bermadi'
    ELSE 'Boshqa' END
WHERE is_lost AND loss_reason IS NOT NULL AND loss_reason <> ALL (public.crm_loss_reasons());

CREATE OR REPLACE FUNCTION public.sales_insights(p_from date, p_to date, p_pipeline uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t0 timestamptz; t1 timestamptz; r jsonb;
  v_fin boolean := public.has_permission(auth.uid(), 'tadbirlar-moliya');
BEGIN
  IF NOT public.has_permission(auth.uid(), 'dashboard') THEN
    RAISE EXCEPTION 'Dashboard''ga ruxsat yo''q' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Davr noto''g''ri' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  t0 := p_from::timestamp AT TIME ZONE 'Asia/Tashkent';
  t1 := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Tashkent';

  WITH l AS (   -- every bitim in scope with the seat it sold and that seat's first payment
    SELECT b.*, s.id AS seat_id, s.price AS seat_price, s.paid AS seat_paid,
           (SELECT min(pm.paid_at) FROM public.payments pm WHERE pm.participant_id = s.id AND pm.voided_at IS NULL AND pm.amount > 0) AS first_paid
    FROM public.crm_leads b
    LEFT JOIN public.crm_pipelines p ON p.id = b.pipeline_id
    LEFT JOIN LATERAL (SELECT e.id, e.price, e.paid FROM public.event_participants e
                       WHERE e.event_id = p.event_id AND e.contact_id = b.client_id AND e.no_show_at IS NULL
                       ORDER BY e.created_at LIMIT 1) s ON true
    WHERE p_pipeline IS NULL OR b.pipeline_id = p_pipeline
  ), coh AS (
    SELECT * FROM l WHERE created_at >= t0 AND created_at < t1
  ), won AS (
    SELECT l.*, GREATEST(extract(epoch FROM COALESCE(first_paid, closed_at) - created_at) / 86400, 0) AS days
    FROM l WHERE is_won AND closed_at >= t0 AND closed_at < t1
  ), c AS (
    SELECT direction, talk_time, (started_at AT TIME ZONE 'Asia/Tashkent') AS at FROM public.crm_calls
    WHERE started_at >= t0 AND started_at < t1 AND (p_pipeline IS NULL OR lead_id IN (SELECT id FROM l))
  ), ev AS (   -- what the activity chart counts, one row a happening
    SELECT 'leads' AS kind, (created_at AT TIME ZONE 'Asia/Tashkent') AS at FROM coh
    UNION ALL SELECT CASE WHEN direction = 'in' THEN 'in' ELSE 'out' END, at FROM c
    UNION ALL SELECT 'connected', at FROM c WHERE direction = 'out' AND talk_time > 0
  )
  SELECT jsonb_build_object(
    'quality', (SELECT jsonb_build_object(
        'leads', count(*), 'scored', count(lead_score), 'qualified', count(*) FILTER (WHERE qualified),
        'won', count(*) FILTER (WHERE is_won), 'won_qualified', count(*) FILTER (WHERE is_won AND qualified),
        'threshold', (SELECT lead_threshold FROM public.crm_pipelines WHERE id = p_pipeline),
        'by_score', (SELECT COALESCE(jsonb_agg(jsonb_build_object('score', x.s, 'leads', x.n, 'won', x.w) ORDER BY x.s NULLS LAST), '[]'::jsonb)
                     FROM (SELECT lead_score AS s, count(*) AS n, count(*) FILTER (WHERE is_won) AS w FROM coh GROUP BY lead_score) x)) FROM coh),
    'lost_reasons', public.lost_reasons(p_from, p_to, p_pipeline),
    'activity', jsonb_build_object(
      'by_day', (SELECT jsonb_agg(jsonb_build_object('day', d::date,
                    'leads', (SELECT count(*) FROM ev WHERE kind = 'leads' AND at::date = d::date),
                    'out', (SELECT count(*) FROM ev WHERE kind = 'out' AND at::date = d::date),
                    'connected', (SELECT count(*) FROM ev WHERE kind = 'connected' AND at::date = d::date),
                    'in', (SELECT count(*) FROM ev WHERE kind = 'in' AND at::date = d::date)) ORDER BY d)
                 FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d),
      -- every day of the period added up, by the hour it happened
      'by_hour', (SELECT jsonb_agg(jsonb_build_object('hour', h,
                    'leads', (SELECT count(*) FROM ev WHERE kind = 'leads' AND extract(hour FROM at) = h),
                    'out', (SELECT count(*) FROM ev WHERE kind = 'out' AND extract(hour FROM at) = h),
                    'connected', (SELECT count(*) FROM ev WHERE kind = 'connected' AND extract(hour FROM at) = h),
                    'in', (SELECT count(*) FROM ev WHERE kind = 'in' AND extract(hour FROM at) = h)) ORDER BY h)
                  FROM generate_series(0, 23) h)),
    -- Meta's own lead forms name the ad in platform / campaign_name / adset_name / ad_name, sites in utm_*
    'by_ad', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.leads DESC, x.source NULLS LAST, x.creative NULLS LAST), '[]'::jsonb) FROM (
        -- no source in the ad data (a Meta form without its platform, a plain site form, a call) = the bitim's own source
        SELECT COALESCE(NULLIF(attribution->>'utm_source', ''), NULLIF(attribution->>'platform', ''), source) AS source,
               COALESCE(NULLIF(attribution->>'utm_campaign', ''), NULLIF(attribution->>'campaign_name', '')) AS campaign,
               COALESCE(NULLIF(attribution->>'utm_term', ''), NULLIF(attribution->>'adset_name', '')) AS adset,
               COALESCE(NULLIF(attribution->>'utm_content', ''), NULLIF(attribution->>'ad_name', '')) AS creative,
               count(*) AS leads, count(*) FILTER (WHERE qualified) AS qualified, count(*) FILTER (WHERE is_won) AS won,
               count(seat_id) AS seats,
               CASE WHEN v_fin THEN COALESCE(sum(seat_price), 0) END AS agreed,
               CASE WHEN v_fin THEN COALESCE(sum(seat_paid), 0) END AS paid
        FROM coh GROUP BY 1, 2, 3, 4) x),
    'cycle', (SELECT jsonb_build_object(
        'count', count(*), 'avg_days', round(avg(days)::numeric, 1),
        'median_days', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY days::float8))::numeric, 1),
        'lt1', count(*) FILTER (WHERE days < 1), 'd1_3', count(*) FILTER (WHERE days >= 1 AND days < 4),
        'd4_7', count(*) FILTER (WHERE days >= 4 AND days < 8), 'd8_14', count(*) FILTER (WHERE days >= 8 AND days < 15),
        'gt14', count(*) FILTER (WHERE days >= 15),
        'by_seller', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.count DESC, x.full_name), '[]'::jsonb) FROM (
            SELECT won.responsible_user_id AS id, pr.full_name, count(*) AS count,
                   round((percentile_cont(0.5) WITHIN GROUP (ORDER BY won.days::float8))::numeric, 1) AS median_days
            FROM won LEFT JOIN public.profiles pr ON pr.id = won.responsible_user_id GROUP BY won.responsible_user_id, pr.full_name) x),
        'by_source', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.count DESC, x.source), '[]'::jsonb) FROM (
            SELECT won.source, count(*) AS count,
                   round((percentile_cont(0.5) WITHIN GROUP (ORDER BY won.days::float8))::numeric, 1) AS median_days
            FROM won GROUP BY won.source) x)) FROM won)
  ) INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.sales_insights(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_insights(date, date, uuid) TO authenticated;

COMMIT;
