-- 103: the Dashboard's money comes from Moliya, plus plan / tasks / speed to lead / stage conversion.
--  * "Yutilgan summa" was the hand-typed crm_leads.price: tied to neither the tariff nor the payments.
--    New block `sales`: seats sold, agreed (= paid + owed), collected, debt — from event_participants / payments of the
--    chosen voronka's event (no voronka = every event). Money only with the Moliya right; seats for all.
--  * sellers get seats / agreed / collected (a seat sold without a bitim counts too); `daily` gets seats / collected.
--  * `plan`: the event's plan (events.total_value, new events.seats_plan) against fact, pace, forecast.
--  * `tasks`: open bitimlar by their nearest open task (overdue … later) and the ones with no task (idle).
--  * `speed`: time from a form lead to the first outgoing call, in all and in working time.
--  * `stage_conv`: how far the period's bitimlar got, stage by stage (history = crm_notes kind 'stage').
--  * attention lists: 50 rows + real totals, newest first (the oldest 10 were October test rows);
--    new list idle_leads.
-- Every old key keeps its meaning (kpi.won_sum is still there for the connector).
BEGIN;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS seats_plan integer CHECK (seats_plan > 0);

-- Working minutes between two moments. ponytail: hours are fixed (09:00–18:00, Mon–Sat, Tashkent);
-- make it a setting when the schedule actually changes.
CREATE OR REPLACE FUNCTION public.business_minutes(p_from timestamptz, p_to timestamptz)
RETURNS numeric LANGUAGE sql STABLE STRICT SET search_path = public, pg_temp AS $$
  SELECT COALESCE(sum(GREATEST(0, extract(epoch FROM LEAST(x.b, d + time '18:00') - GREATEST(x.a, d + time '09:00')))) / 60, 0)
  FROM (SELECT p_from AT TIME ZONE 'Asia/Tashkent' AS a, p_to AT TIME ZONE 'Asia/Tashkent' AS b) x,
       generate_series(x.a::date::timestamp, x.b::date::timestamp, interval '1 day') d
  WHERE extract(isodow FROM d) < 7
$$;

CREATE OR REPLACE FUNCTION public.sales_dashboard(p_from date, p_to date, p_pipeline uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t0 timestamptz; t1 timestamptz; p0 timestamptz; r jsonb;
  v_fin boolean := public.has_permission(auth.uid(), 'tadbirlar-moliya');
  v_today date := (now() AT TIME ZONE 'Asia/Tashkent')::date;
  v_week_end date;   -- this week's Sunday
  v_event uuid;      -- the chosen voronka's event
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
  v_week_end := v_today + (7 - extract(isodow FROM v_today)::int);
  IF p_pipeline IS NOT NULL THEN SELECT event_id INTO v_event FROM public.crm_pipelines WHERE id = p_pipeline; END IF;

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
      count(*) FILTER (WHERE is_won AND created_at >= t0 AND created_at < t1) AS new_won,
      count(*) FILTER (WHERE is_lost AND created_at >= t0 AND created_at < t1) AS new_lost,
      count(*) FILTER (WHERE created_at >= p0 AND created_at < t0) AS p_new,
      count(*) FILTER (WHERE is_won AND closed_at >= p0 AND closed_at < t0) AS p_won,
      count(*) FILTER (WHERE is_lost AND closed_at >= p0 AND closed_at < t0) AS p_lost,
      COALESCE(sum(price) FILTER (WHERE is_won AND closed_at >= p0 AND closed_at < t0), 0) AS p_won_sum,
      count(*) FILTER (WHERE is_won AND created_at >= p0 AND created_at < t0) AS p_new_won
    FROM l
  ), ep AS (   -- Moliya rows the page counts: the chosen voronka's event, or every event
    SELECT p.*, (p.created_at >= t0 AND p.created_at < t1) AS cur, (p.created_at >= p0 AND p.created_at < t0) AS prev
    FROM public.event_participants p WHERE p_pipeline IS NULL OR p.event_id = v_event
  ), pay AS (
    SELECT pm.amount, ep.seller_id, (pm.paid_at AT TIME ZONE 'Asia/Tashkent')::date AS day,
           (pm.paid_at >= t0 AND pm.paid_at < t1) AS cur, (pm.paid_at >= p0 AND pm.paid_at < t0) AS prev
    FROM public.payments pm JOIN ep ON ep.id = pm.participant_id WHERE pm.voided_at IS NULL
  ), seller_ids AS (
    SELECT responsible_user_id AS id FROM l
    WHERE responsible_user_id IS NOT NULL
      AND ((NOT is_won AND NOT is_lost) OR (created_at >= t0 AND created_at < t1) OR (closed_at >= t0 AND closed_at < t1))
    UNION SELECT assignee_id FROM tk
    WHERE assignee_id IS NOT NULL AND ((done_at >= t0 AND done_at < t1) OR (NOT is_done AND due_date < now()))
    UNION SELECT staff_id FROM c WHERE staff_id IS NOT NULL
    UNION SELECT seller_id FROM ep WHERE seller_id IS NOT NULL AND cur
    UNION SELECT seller_id FROM pay WHERE seller_id IS NOT NULL AND cur
  ), ob AS (   -- every open bitim by its nearest open task
    SELECT o.owner, CASE WHEN o.due IS NULL THEN 'idle' WHEN o.due < now() THEN 'overdue'
                         WHEN o.day = v_today THEN 'today' WHEN o.day <= v_week_end THEN 'this_week'
                         WHEN o.day <= v_week_end + 7 THEN 'next_week' ELSE 'later' END AS bucket
    FROM (SELECT l.responsible_user_id AS owner, m.due, (m.due AT TIME ZONE 'Asia/Tashkent')::date AS day
          FROM l LEFT JOIN LATERAL (SELECT min(tk.due_date) AS due FROM tk WHERE tk.lead_id = l.id AND NOT tk.is_done) m ON true
          WHERE NOT l.is_won AND NOT l.is_lost) o
  ), sp AS (   -- form leads of the period and the first outgoing call to that client afterwards
    SELECT l.responsible_user_id AS owner, (NOT l.is_won AND NOT l.is_lost) AS is_open, f.at AS first_out,
           extract(epoch FROM f.at - l.created_at) / 60 AS total_min, public.business_minutes(l.created_at, f.at) AS biz_min
    FROM l LEFT JOIN LATERAL (SELECT min(o.started_at) AS at FROM public.crm_calls o
                              WHERE o.direction = 'out' AND o.started_at >= l.created_at
                                AND (o.lead_id = l.id OR o.client_id = l.client_id)) f ON true
    WHERE l.created_at >= t0 AND l.created_at < t1 AND l.created_by IS NULL AND COALESCE(l.source, '') NOT IN ('call', 'telegram')
  ), coh AS (
    SELECT * FROM l WHERE created_at >= t0 AND created_at < t1
  ), vis AS (  -- every stage a bitim of the period has been in: where it started, then each move
    SELECT n.lead_id, (n.meta->>'to')::uuid AS stage_id, n.created_at AS at
    FROM public.crm_notes n JOIN coh ON coh.id = n.lead_id WHERE n.kind = 'stage' AND n.meta ? 'to'
    UNION ALL
    SELECT coh.id, COALESCE((SELECT (n.meta->>'from')::uuid FROM public.crm_notes n
                             WHERE n.lead_id = coh.id AND n.kind = 'stage' AND n.meta ? 'from' ORDER BY n.created_at LIMIT 1), coh.stage_id),
           coh.created_at
    FROM coh
  ), stays AS (
    SELECT v.stage_id, v.at, lead(v.at) OVER (PARTITION BY v.lead_id ORDER BY v.at) AS left_at FROM vis v
  ), reach AS (  -- the furthest open stage of its own voronka each one got to
    SELECT coh.pipeline_id, COALESCE(coh.is_won, false) AS is_won,
           (SELECT max(s.sort_order) FROM vis v JOIN public.crm_stages s ON s.id = v.stage_id
            WHERE v.lead_id = coh.id AND s.pipeline_id = coh.pipeline_id AND NOT s.is_won AND NOT s.is_lost) AS top
    FROM coh
  ), a_tasks AS (
    SELECT tk.id, tk.lead_id, l.name AS lead_name, tk.text, tk.kind, tk.due_date, pr.full_name AS assignee
    FROM tk JOIN l ON l.id = tk.lead_id LEFT JOIN public.profiles pr ON pr.id = tk.assignee_id
    WHERE NOT tk.is_done AND tk.due_date < now()
  ), a_stale AS (
    SELECT l.id, l.name, s.name AS stage, floor(extract(epoch FROM now() - l.stage_changed_at) / 86400)::int AS days,
           pr.full_name AS responsible, l.stage_changed_at
    FROM l JOIN public.crm_stages s ON s.id = l.stage_id LEFT JOIN public.profiles pr ON pr.id = l.responsible_user_id
    WHERE NOT l.is_won AND NOT l.is_lost AND l.stage_changed_at < now() - interval '14 days'
      AND NOT EXISTS (SELECT 1 FROM public.crm_notes n WHERE n.lead_id = l.id AND n.created_at > now() - interval '14 days')
      AND NOT EXISTS (SELECT 1 FROM public.crm_calls cc WHERE cc.lead_id = l.id AND cc.started_at > now() - interval '14 days')
  ), a_idle AS (
    SELECT l.id, l.name, s.name AS stage, floor(extract(epoch FROM now() - l.created_at) / 86400)::int AS days,
           pr.full_name AS responsible, l.created_at
    FROM l JOIN public.crm_stages s ON s.id = l.stage_id LEFT JOIN public.profiles pr ON pr.id = l.responsible_user_id
    WHERE NOT l.is_won AND NOT l.is_lost AND NOT EXISTS (SELECT 1 FROM tk WHERE tk.lead_id = l.id AND NOT tk.is_done)
  ), a_missed AS (
    SELECT m.phone, max(cl.full_name) AS client_name, (array_agg(m.lead_id ORDER BY m.started_at DESC))[1] AS lead_id,
           max(m.started_at) AS last_missed_at, count(*) AS count
    FROM public.crm_calls m LEFT JOIN public.clients cl ON cl.id = m.client_id
    WHERE m.direction = 'in' AND m.talk_time = 0 AND m.phone IS NOT NULL AND m.started_at > now() - interval '14 days'
      AND (p_pipeline IS NULL OR m.lead_id IN (SELECT id FROM l))
      -- handled: we called back, or they called again and someone answered
      AND NOT EXISTS (SELECT 1 FROM public.crm_calls o WHERE o.phone = m.phone AND o.started_at > m.started_at
                        AND (o.direction = 'out' OR o.talk_time > 0))
    GROUP BY m.phone
  )
  SELECT jsonb_build_object(
    'pipelines', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY sort_order, name), '[]'::jsonb)
                  FROM public.crm_pipelines),
    'kpi', (SELECT jsonb_build_object('new', new, 'won', won, 'lost', lost, 'won_sum', won_sum, 'new_won', new_won, 'new_lost', new_lost,
              'conversion', CASE WHEN won + lost > 0 THEN round(won * 100.0 / (won + lost), 1) END) FROM k),
    'kpi_prev', (SELECT jsonb_build_object('new', p_new, 'won', p_won, 'lost', p_lost, 'won_sum', p_won_sum, 'new_won', p_new_won,
              'conversion', CASE WHEN p_won + p_lost > 0 THEN round(p_won * 100.0 / (p_won + p_lost), 1) END) FROM k),
    'sales', jsonb_build_object(
      'linked', p_pipeline IS NULL OR v_event IS NOT NULL,
      'seats', (SELECT count(*) FROM ep WHERE cur AND no_show_at IS NULL),
      'p_seats', (SELECT count(*) FROM ep WHERE prev AND no_show_at IS NULL),
      'money', CASE WHEN v_fin THEN (SELECT jsonb_build_object(
          'agreed', COALESCE(sum(price) FILTER (WHERE cur), 0), 'p_agreed', COALESCE(sum(price) FILTER (WHERE prev), 0),
          'collected', (SELECT COALESCE(sum(amount) FILTER (WHERE cur), 0) FROM pay),
          'p_collected', (SELECT COALESCE(sum(amount) FILTER (WHERE prev), 0) FROM pay),
          -- of what the period's participants agreed to: paid by now, still owed (agreed = paid + owed)
          'paid', COALESCE(sum(LEAST(paid, price)) FILTER (WHERE cur), 0),
          'owed', COALESCE(sum(GREATEST(price - paid, 0)) FILTER (WHERE cur), 0),
          -- the period's seats by payment (full + partial + unpaid = seats)
          'full', count(*) FILTER (WHERE cur AND no_show_at IS NULL AND paid >= price),
          'partial', count(*) FILTER (WHERE cur AND no_show_at IS NULL AND paid > 0 AND paid < price),
          'unpaid', count(*) FILTER (WHERE cur AND no_show_at IS NULL AND paid <= 0 AND price > 0),
          -- as of now, whatever the period: what the scope's participants still owe
          'debt', COALESCE(sum(GREATEST(price - paid, 0)), 0)) FROM ep) END),
    'plan', (SELECT COALESCE(jsonb_agg(to_jsonb(y) ORDER BY y.event_date), '[]'::jsonb) FROM (
        SELECT x.*,
               -- (GREATEST skips NULLs, so no plan must be asked for by name: it would read as "0 needed")
               CASE WHEN x.days_left > 0 AND x.seats_plan IS NOT NULL THEN round(GREATEST(x.seats_plan - x.seats, 0)::numeric / x.days_left, 1) END AS seats_need_per_day,
               round(x.seats_7d / 7.0, 1) AS seats_per_day,
               x.seats + round(x.seats_7d / 7.0 * x.days_left) AS seats_forecast,
               CASE WHEN x.days_left > 0 AND x.revenue_plan IS NOT NULL THEN round(GREATEST(x.revenue_plan - x.agreed, 0) / x.days_left) END AS agreed_need_per_day,
               round(x.agreed_7d / 7) AS agreed_per_day,
               x.agreed + round(x.agreed_7d / 7 * x.days_left) AS agreed_forecast
        FROM (SELECT e.id AS event_id, e.name, (e.date AT TIME ZONE 'Asia/Tashkent')::date AS event_date,
                     GREATEST((e.date AT TIME ZONE 'Asia/Tashkent')::date - v_today, 0) AS days_left, e.seats_plan,
                     (SELECT count(*) FROM public.event_participants p WHERE p.event_id = e.id AND p.no_show_at IS NULL) AS seats,
                     (SELECT count(*) FROM public.event_participants p WHERE p.event_id = e.id AND p.no_show_at IS NULL
                        AND p.created_at > now() - interval '7 days') AS seats_7d,
                     CASE WHEN v_fin THEN NULLIF(e.total_value, 0) END AS revenue_plan,
                     CASE WHEN v_fin THEN (SELECT COALESCE(sum(p.price), 0) FROM public.event_participants p WHERE p.event_id = e.id) END AS agreed,
                     CASE WHEN v_fin THEN (SELECT COALESCE(sum(p.price), 0) FROM public.event_participants p WHERE p.event_id = e.id
                                             AND p.created_at > now() - interval '7 days') END AS agreed_7d,
                     CASE WHEN v_fin THEN (SELECT COALESCE(sum(pm.amount), 0) FROM public.payments pm
                                           JOIN public.event_participants p ON p.id = pm.participant_id
                                           WHERE p.event_id = e.id AND pm.voided_at IS NULL) END AS collected
              FROM public.events e
              -- the chosen voronka's event, or every coming event some voronka sells
              WHERE CASE WHEN p_pipeline IS NOT NULL THEN e.id = v_event
                         ELSE (COALESCE(e.end_date, e.date) AT TIME ZONE 'Asia/Tashkent')::date >= v_today
                              AND EXISTS (SELECT 1 FROM public.crm_pipelines cp WHERE cp.event_id = e.id) END) x) y),
    'funnel', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'pipeline', p.name, 'pipeline_id', p.id, 'stage_id', s.id, 'name', s.name, 'color', s.color,
                  'open', (SELECT count(*) FROM l WHERE l.stage_id = s.id AND NOT l.is_won AND NOT l.is_lost),
                  'open_sum', (SELECT COALESCE(sum(price), 0) FROM l WHERE l.stage_id = s.id AND NOT l.is_won AND NOT l.is_lost))
                ORDER BY p.sort_order, p.name, s.sort_order), '[]'::jsonb)
               FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id = s.pipeline_id
               WHERE NOT s.is_won AND NOT s.is_lost AND (p_pipeline IS NULL OR s.pipeline_id = p_pipeline)),
    -- of the bitimlar opened in the period: how many got to each stage or past it (the won stage = won)
    'stage_conv', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'pipeline_id', s.pipeline_id, 'stage_id', s.id, 'name', s.name, 'color', s.color, 'won', s.is_won,
                  'reached', (SELECT count(*) FROM reach r WHERE r.pipeline_id = s.pipeline_id
                                AND (r.is_won OR (NOT s.is_won AND r.top >= s.sort_order))),
                  'avg_days', CASE WHEN NOT s.is_won THEN
                                (SELECT round((avg(extract(epoch FROM COALESCE(st.left_at, now()) - st.at)) / 86400)::numeric, 1)
                                 FROM stays st WHERE st.stage_id = s.id) END)
                ORDER BY p.sort_order, p.name, s.is_won, s.sort_order), '[]'::jsonb)
               FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id = s.pipeline_id
               WHERE NOT s.is_lost AND (p_pipeline IS NULL OR s.pipeline_id = p_pipeline)),
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
                'won', (SELECT count(*) FROM l WHERE l.is_won AND (l.closed_at AT TIME ZONE 'Asia/Tashkent')::date = d::date),
                'seats', (SELECT count(*) FROM ep WHERE ep.no_show_at IS NULL AND (ep.created_at AT TIME ZONE 'Asia/Tashkent')::date = d::date),
                'collected', CASE WHEN v_fin THEN (SELECT COALESCE(sum(pay.amount), 0) FROM pay WHERE pay.day = d::date) END
              ) ORDER BY d)
              FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d),
    'sellers', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.seats DESC, s.won DESC, s.tasks_done DESC, s.full_name), '[]'::jsonb)
                FROM (SELECT x.*, CASE WHEN x.won + x.lost > 0 THEN round(x.won * 100.0 / (x.won + x.lost), 1) END AS conversion
                      FROM (SELECT pr.id, pr.full_name, pr.avatar_url,
                              (SELECT count(*) FROM l WHERE l.responsible_user_id = pr.id AND NOT l.is_won AND NOT l.is_lost) AS open,
                              (SELECT count(*) FROM l WHERE l.responsible_user_id = pr.id AND l.created_at >= t0 AND l.created_at < t1) AS new,
                              (SELECT count(*) FROM l WHERE l.responsible_user_id = pr.id AND l.is_won AND l.closed_at >= t0 AND l.closed_at < t1) AS won,
                              (SELECT count(*) FROM l WHERE l.responsible_user_id = pr.id AND l.is_lost AND l.closed_at >= t0 AND l.closed_at < t1) AS lost,
                              (SELECT COALESCE(sum(price), 0) FROM l WHERE l.responsible_user_id = pr.id AND l.is_won AND l.closed_at >= t0 AND l.closed_at < t1) AS won_sum,
                              (SELECT count(*) FROM ep WHERE ep.seller_id = pr.id AND ep.cur AND ep.no_show_at IS NULL) AS seats,
                              CASE WHEN v_fin THEN (SELECT COALESCE(sum(ep.price), 0) FROM ep WHERE ep.seller_id = pr.id AND ep.cur) END AS agreed,
                              CASE WHEN v_fin THEN (SELECT COALESCE(sum(pay.amount), 0) FROM pay WHERE pay.seller_id = pr.id AND pay.cur) END AS collected,
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
    'tasks', jsonb_build_object(
      'total', (SELECT jsonb_build_object(
                  'overdue', count(*) FILTER (WHERE bucket = 'overdue'), 'today', count(*) FILTER (WHERE bucket = 'today'),
                  'this_week', count(*) FILTER (WHERE bucket = 'this_week'), 'next_week', count(*) FILTER (WHERE bucket = 'next_week'),
                  'later', count(*) FILTER (WHERE bucket = 'later'), 'idle', count(*) FILTER (WHERE bucket = 'idle')) FROM ob),
      -- by the bitim's owner (id NULL = no owner)
      'by_seller', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.overdue + x.idle DESC, x.full_name), '[]'::jsonb) FROM (
          SELECT ob.owner AS id, pr.full_name, pr.avatar_url,
                 count(*) FILTER (WHERE bucket = 'overdue') AS overdue, count(*) FILTER (WHERE bucket = 'today') AS today,
                 count(*) FILTER (WHERE bucket = 'this_week') AS this_week, count(*) FILTER (WHERE bucket = 'next_week') AS next_week,
                 count(*) FILTER (WHERE bucket = 'later') AS later, count(*) FILTER (WHERE bucket = 'idle') AS idle
          FROM ob LEFT JOIN public.profiles pr ON pr.id = ob.owner GROUP BY ob.owner, pr.full_name, pr.avatar_url) x)),
    'speed', (SELECT jsonb_build_object(
                'leads', count(*), 'called', count(first_out),
                'waiting', count(*) FILTER (WHERE first_out IS NULL AND is_open),
                'avg_min', round(avg(total_min)), 'median_min', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY total_min::float8)),
                'avg_biz_min', round(avg(biz_min)), 'median_biz_min', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY biz_min::float8)),
                -- by working time
                'lt15', count(*) FILTER (WHERE biz_min < 15), 'lt60', count(*) FILTER (WHERE biz_min >= 15 AND biz_min < 60),
                'lt240', count(*) FILTER (WHERE biz_min >= 60 AND biz_min < 240), 'gt240', count(*) FILTER (WHERE biz_min >= 240),
                'by_seller', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.leads DESC, x.full_name), '[]'::jsonb) FROM (
                    SELECT sp.owner AS id, pr.full_name, count(*) AS leads, count(sp.first_out) AS called,
                           count(*) FILTER (WHERE sp.first_out IS NULL AND sp.is_open) AS waiting,
                           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY sp.biz_min::float8)) AS median_biz_min
                    FROM sp LEFT JOIN public.profiles pr ON pr.id = sp.owner GROUP BY sp.owner, pr.full_name) x)) FROM sp),
    'attention', jsonb_build_object(
      'totals', jsonb_build_object('overdue_tasks', (SELECT count(*) FROM a_tasks), 'stale_leads', (SELECT count(*) FROM a_stale),
                                   'idle_leads', (SELECT count(*) FROM a_idle), 'missed_unanswered', (SELECT count(*) FROM a_missed)),
      'overdue_tasks', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.due_date DESC), '[]'::jsonb)
                        FROM (SELECT * FROM a_tasks ORDER BY due_date DESC LIMIT 50) x),
      'stale_leads', (SELECT COALESCE(jsonb_agg(to_jsonb(x) - 'stage_changed_at' ORDER BY x.stage_changed_at DESC), '[]'::jsonb)
                      FROM (SELECT * FROM a_stale ORDER BY stage_changed_at DESC LIMIT 50) x),
      'idle_leads', (SELECT COALESCE(jsonb_agg(to_jsonb(x) - 'created_at' ORDER BY x.created_at DESC), '[]'::jsonb)
                     FROM (SELECT * FROM a_idle ORDER BY created_at DESC LIMIT 50) x),
      'missed_unanswered', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.last_missed_at DESC), '[]'::jsonb)
                            FROM (SELECT * FROM a_missed ORDER BY last_missed_at DESC LIMIT 50) x)
    )
  ) INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.sales_dashboard(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_dashboard(date, date, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.business_minutes(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_minutes(timestamptz, timestamptz) TO authenticated;

COMMIT;
