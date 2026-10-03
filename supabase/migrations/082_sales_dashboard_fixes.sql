-- 082: Dashboard fixes after the whole-branch review of 080.
--  * a seller whose profiles.is_active is NULL counts (has_permission treats NULL as active);
--  * "Qayta qo'ng'iroq qilinmagan" skips hidden numbers and numbers that called again and got an answer;
--  * funnel rows carry pipeline_id (two voronkalar with one name stay apart);
--  * calls.missed_total dropped (always equal to calls.missed);
--  * crm_calls(phone, started_at) index for the called-back lookups.

CREATE INDEX IF NOT EXISTS crm_calls_phone_started_idx ON public.crm_calls (phone, started_at);

CREATE OR REPLACE FUNCTION public.sales_dashboard(p_from date, p_to date, p_pipeline uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t0 timestamptz; t1 timestamptz; p0 timestamptz; r jsonb;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'dashboard') THEN
    RAISE EXCEPTION 'Dashboard''ga ruxsat yo''q' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Davr noto''g''ri' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  t0 := p_from::timestamp AT TIME ZONE 'Asia/Tashkent';
  t1 := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Tashkent';
  p0 := (p_from - (p_to - p_from + 1))::timestamp AT TIME ZONE 'Asia/Tashkent';

  WITH l AS (
    SELECT * FROM public.crm_leads WHERE p_pipeline IS NULL OR pipeline_id = p_pipeline
  ), tk AS (
    SELECT t.* FROM public.crm_tasks t JOIN l ON l.id = t.lead_id
  ), c AS (
    SELECT * FROM public.crm_calls
    WHERE started_at >= t0 AND started_at < t1 AND (p_pipeline IS NULL OR lead_id IN (SELECT id FROM l))
  ), missed AS (
    SELECT m.*, EXISTS (SELECT 1 FROM public.crm_calls o
                        WHERE o.direction = 'out' AND o.phone = m.phone AND o.started_at > m.started_at) AS called_back
    FROM c m WHERE m.direction = 'in' AND m.talk_time = 0
  ), k AS (
    SELECT
      count(*) FILTER (WHERE created_at >= t0 AND created_at < t1) AS new,
      count(*) FILTER (WHERE is_won AND closed_at >= t0 AND closed_at < t1) AS won,
      count(*) FILTER (WHERE is_lost AND closed_at >= t0 AND closed_at < t1) AS lost,
      COALESCE(sum(price) FILTER (WHERE is_won AND closed_at >= t0 AND closed_at < t1), 0) AS won_sum,
      count(*) FILTER (WHERE created_at >= p0 AND created_at < t0) AS p_new,
      count(*) FILTER (WHERE is_won AND closed_at >= p0 AND closed_at < t0) AS p_won,
      count(*) FILTER (WHERE is_lost AND closed_at >= p0 AND closed_at < t0) AS p_lost,
      COALESCE(sum(price) FILTER (WHERE is_won AND closed_at >= p0 AND closed_at < t0), 0) AS p_won_sum
    FROM l
  ), seller_ids AS (
    SELECT responsible_user_id AS id FROM l
    WHERE responsible_user_id IS NOT NULL
      AND ((NOT is_won AND NOT is_lost) OR (created_at >= t0 AND created_at < t1) OR (closed_at >= t0 AND closed_at < t1))
    UNION SELECT assignee_id FROM tk
    WHERE assignee_id IS NOT NULL AND ((done_at >= t0 AND done_at < t1) OR (NOT is_done AND due_date < now()))
    UNION SELECT staff_id FROM c WHERE staff_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'pipelines', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY sort_order, name), '[]'::jsonb)
                  FROM public.crm_pipelines),
    'kpi', (SELECT jsonb_build_object('new', new, 'won', won, 'lost', lost, 'won_sum', won_sum,
              'conversion', CASE WHEN won + lost > 0 THEN round(won * 100.0 / (won + lost), 1) END) FROM k),
    'kpi_prev', (SELECT jsonb_build_object('new', p_new, 'won', p_won, 'lost', p_lost, 'won_sum', p_won_sum,
              'conversion', CASE WHEN p_won + p_lost > 0 THEN round(p_won * 100.0 / (p_won + p_lost), 1) END) FROM k),
    'funnel', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'pipeline', p.name, 'pipeline_id', p.id, 'stage_id', s.id, 'name', s.name, 'color', s.color,
                  'open', (SELECT count(*) FROM l WHERE l.stage_id = s.id AND NOT l.is_won AND NOT l.is_lost),
                  'open_sum', (SELECT COALESCE(sum(price), 0) FROM l WHERE l.stage_id = s.id AND NOT l.is_won AND NOT l.is_lost))
                ORDER BY p.sort_order, p.name, s.sort_order), '[]'::jsonb)
               FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id = s.pipeline_id
               WHERE NOT s.is_won AND NOT s.is_lost AND (p_pipeline IS NULL OR s.pipeline_id = p_pipeline)),
    'by_source', (SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'new', n, 'won', w) ORDER BY n DESC, w DESC), '[]'::jsonb)
                  FROM (SELECT source,
                               count(*) FILTER (WHERE created_at >= t0 AND created_at < t1) AS n,
                               count(*) FILTER (WHERE is_won AND closed_at >= t0 AND closed_at < t1) AS w
                        FROM l GROUP BY source) x WHERE n + w > 0),
    'by_pipeline', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'new', x.n, 'won', x.w) ORDER BY x.n DESC), '[]'::jsonb)
                    FROM (SELECT pipeline_id,
                                 count(*) FILTER (WHERE created_at >= t0 AND created_at < t1) AS n,
                                 count(*) FILTER (WHERE is_won AND closed_at >= t0 AND closed_at < t1) AS w
                          FROM l GROUP BY pipeline_id) x JOIN public.crm_pipelines p ON p.id = x.pipeline_id WHERE x.n + x.w > 0),
    'daily', (SELECT jsonb_agg(jsonb_build_object(
                'day', d::date,
                'new', (SELECT count(*) FROM l WHERE (l.created_at AT TIME ZONE 'Asia/Tashkent')::date = d::date),
                'won', (SELECT count(*) FROM l WHERE l.is_won AND (l.closed_at AT TIME ZONE 'Asia/Tashkent')::date = d::date)
              ) ORDER BY d)
              FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d),
    'sellers', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.won DESC, s.tasks_done DESC, s.full_name), '[]'::jsonb)
                FROM (SELECT x.*, CASE WHEN x.won + x.lost > 0 THEN round(x.won * 100.0 / (x.won + x.lost), 1) END AS conversion
                      FROM (SELECT pr.id, pr.full_name, pr.avatar_url,
                              (SELECT count(*) FROM l WHERE l.responsible_user_id = pr.id AND NOT l.is_won AND NOT l.is_lost) AS open,
                              (SELECT count(*) FROM l WHERE l.responsible_user_id = pr.id AND l.created_at >= t0 AND l.created_at < t1) AS new,
                              (SELECT count(*) FROM l WHERE l.responsible_user_id = pr.id AND l.is_won AND l.closed_at >= t0 AND l.closed_at < t1) AS won,
                              (SELECT count(*) FROM l WHERE l.responsible_user_id = pr.id AND l.is_lost AND l.closed_at >= t0 AND l.closed_at < t1) AS lost,
                              (SELECT COALESCE(sum(price), 0) FROM l WHERE l.responsible_user_id = pr.id AND l.is_won AND l.closed_at >= t0 AND l.closed_at < t1) AS won_sum,
                              (SELECT count(*) FROM tk WHERE tk.assignee_id = pr.id AND tk.done_at >= t0 AND tk.done_at < t1) AS tasks_done,
                              (SELECT count(*) FROM tk WHERE tk.assignee_id = pr.id AND tk.done_at >= t0 AND tk.done_at < t1 AND tk.done_at <= tk.due_date) AS tasks_on_time,
                              (SELECT count(*) FROM tk WHERE tk.assignee_id = pr.id AND NOT tk.is_done AND tk.due_date < now()) AS tasks_overdue_open,
                              (SELECT count(*) FROM c WHERE c.staff_id = pr.id AND c.direction = 'in') AS calls_in,
                              (SELECT count(*) FROM c WHERE c.staff_id = pr.id AND c.direction = 'out') AS calls_out,
                              (SELECT count(*) FROM c WHERE c.staff_id = pr.id AND c.direction = 'in' AND c.talk_time = 0) AS calls_missed,
                              (SELECT COALESCE(sum(talk_time), 0) FROM c WHERE c.staff_id = pr.id) AS talk_sec
                            FROM public.profiles pr
                            WHERE pr.id IN (SELECT id FROM seller_ids) AND COALESCE(pr.is_active, true)) x) s),
    'calls', (SELECT jsonb_build_object(
                'in', count(*) FILTER (WHERE direction = 'in'),
                'out', count(*) FILTER (WHERE direction = 'out'),
                'missed', count(*) FILTER (WHERE direction = 'in' AND talk_time = 0),
                'talk_sec', COALESCE(sum(talk_time), 0),
                'avg_talk_sec', COALESCE(round(avg(talk_time) FILTER (WHERE talk_time > 0)), 0),
                'missed_called_back', (SELECT count(*) FROM missed WHERE called_back)) FROM c),
    'attention', jsonb_build_object(
      'overdue_tasks', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.due_date), '[]'::jsonb) FROM (
          SELECT tk.id, tk.lead_id, l.name AS lead_name, tk.text, tk.kind, tk.due_date, pr.full_name AS assignee
          FROM tk JOIN l ON l.id = tk.lead_id LEFT JOIN public.profiles pr ON pr.id = tk.assignee_id
          WHERE NOT tk.is_done AND tk.due_date < now() ORDER BY tk.due_date LIMIT 10) x),
      'stale_leads', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.days DESC), '[]'::jsonb) FROM (
          SELECT l.id, l.name, s.name AS stage, floor(extract(epoch FROM now() - l.stage_changed_at) / 86400)::int AS days,
                 pr.full_name AS responsible
          FROM l JOIN public.crm_stages s ON s.id = l.stage_id LEFT JOIN public.profiles pr ON pr.id = l.responsible_user_id
          WHERE NOT l.is_won AND NOT l.is_lost AND l.stage_changed_at < now() - interval '14 days'
            AND NOT EXISTS (SELECT 1 FROM public.crm_notes n WHERE n.lead_id = l.id AND n.created_at > now() - interval '14 days')
            AND NOT EXISTS (SELECT 1 FROM public.crm_calls cc WHERE cc.lead_id = l.id AND cc.started_at > now() - interval '14 days')
          ORDER BY l.stage_changed_at LIMIT 10) x),
      'missed_unanswered', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.last_missed_at DESC), '[]'::jsonb) FROM (
          SELECT m.phone, max(cl.full_name) AS client_name, (array_agg(m.lead_id ORDER BY m.started_at DESC))[1] AS lead_id,
                 max(m.started_at) AS last_missed_at, count(*) AS count
          FROM public.crm_calls m LEFT JOIN public.clients cl ON cl.id = m.client_id
          WHERE m.direction = 'in' AND m.talk_time = 0 AND m.phone IS NOT NULL AND m.started_at > now() - interval '14 days'
            AND (p_pipeline IS NULL OR m.lead_id IN (SELECT id FROM l))
            -- handled: we called back, or they called again and someone answered
            AND NOT EXISTS (SELECT 1 FROM public.crm_calls o WHERE o.phone = m.phone AND o.started_at > m.started_at
                              AND (o.direction = 'out' OR o.talk_time > 0))
          GROUP BY m.phone ORDER BY max(m.started_at) DESC LIMIT 10) x)
    )
  ) INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.sales_dashboard(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_dashboard(date, date, uuid) TO authenticated;
