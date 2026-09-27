-- 050: Dashboard "Manbalar bo'yicha".
--
-- Migration 049 assumed lead source isn't recorded. It is, as tags: Facebook lead
-- forms tag leads fb<form id> / target…, Tilda and site forms tag tilda /
-- "Framer sayt", telephony tags Входящий / Пропущенный, imports tag import /
-- baza…. amo-sync now maps those to a source name in amo_leads.source (the
-- "Manba" field still wins when set); this adds a `by_source` block to
-- amo_dashboard(). Everything else in the function is unchanged from 049.

CREATE OR REPLACE FUNCTION public.amo_dashboard(
  p_from     timestamptz,
  p_to       timestamptz,
  p_pipeline bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH
bounds AS (
  SELECT p_from AS f, p_to AS t, p_from - (p_to - p_from) AS pf, now() AS n
),
bulk_minutes AS (
  SELECT date_trunc('minute', closed_at) AS m
  FROM amo_leads WHERE closed_at IS NOT NULL
  GROUP BY 1 HAVING count(*) > 10
),
leads AS (
  SELECT l.*, s.kind, s.name AS status_name,
         -- closed kind for sales metrics: bulk clean-ups become 'bulk'
         CASE WHEN s.kind <> 'open'
                   AND date_trunc('minute', l.closed_at) IN (SELECT m FROM bulk_minutes)
              THEN 'bulk' ELSE s.kind END AS ck
  FROM amo_leads l
  JOIN amo_statuses s ON s.pipeline_id = l.pipeline_id AND s.id = l.status_id
  WHERE p_pipeline IS NULL OR l.pipeline_id = p_pipeline
),
open_tasks AS (
  SELECT t.* FROM amo_tasks t JOIN leads l ON l.id = t.lead_id AND l.kind = 'open'
),
kpi AS (
  SELECT
    count(*) FILTER (WHERE ck = 'won'  AND closed_at >= b.f  AND closed_at < b.t) AS won,
    count(*) FILTER (WHERE ck = 'lost' AND closed_at >= b.f  AND closed_at < b.t) AS lost,
    count(*) FILTER (WHERE ck = 'bulk' AND closed_at >= b.f  AND closed_at < b.t) AS bulk_closed,
    count(*) FILTER (WHERE ck = 'won'  AND closed_at >= b.pf AND closed_at < b.f) AS prev_won,
    count(*) FILTER (WHERE ck = 'lost' AND closed_at >= b.pf AND closed_at < b.f) AS prev_lost,
    count(*) FILTER (WHERE created_at >= b.f  AND created_at < b.t) AS new_leads,
    count(*) FILTER (WHERE created_at >= b.pf AND created_at < b.f) AS prev_new_leads,
    count(*) FILTER (WHERE kind = 'open') AS active,
    count(*) FILTER (WHERE kind = 'open' AND updated_at < b.n - interval '14 days') AS stale,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM closed_at - created_at) / 86400)
      FILTER (WHERE ck = 'won' AND closed_at >= b.f AND closed_at < b.t) AS cycle_days,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM closed_at - created_at) / 86400)
      FILTER (WHERE ck = 'won' AND closed_at >= b.pf AND closed_at < b.f) AS prev_cycle_days
  FROM leads, bounds b
),
-- Real money: this system's payments (all events; pipeline filter doesn't apply)
revenue AS (
  SELECT
    coalesce(sum(amount) FILTER (WHERE paid_at >= b.f  AND paid_at < b.t), 0) AS revenue,
    coalesce(sum(amount) FILTER (WHERE paid_at >= b.pf AND paid_at < b.f), 0) AS prev_revenue,
    count(DISTINCT participant_id) FILTER (WHERE paid_at >= b.f  AND paid_at < b.t) AS payers,
    count(DISTINCT participant_id) FILTER (WHERE paid_at >= b.pf AND paid_at < b.f) AS prev_payers
  FROM payments, bounds b
),
tasks AS (
  SELECT
    (SELECT count(*) FROM open_tasks, bounds b WHERE complete_till < b.n) AS overdue,
    (SELECT count(*) FROM leads l WHERE l.kind = 'open'
       AND NOT EXISTS (SELECT 1 FROM open_tasks t WHERE t.lead_id = l.id)) AS no_task
),
funnel AS (
  SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.kind_order, x.sort), '[]'::jsonb) AS rows
  FROM (
    SELECT s.id, s.name, s.color, s.kind, s.sort,
           CASE s.kind WHEN 'open' THEN 0 WHEN 'won' THEN 1 ELSE 2 END AS kind_order,
           -- open stages: leads there now; won/lost: closed into it in the period (no bulk)
           count(l.id) FILTER (WHERE s.kind = 'open'
                               OR (l.ck = s.kind AND l.closed_at >= b.f AND l.closed_at < b.t)) AS count,
           -- leads that ENTERED this stage during the period (status history)
           (SELECT count(DISTINCT c.lead_id) FROM amo_status_changes c
             WHERE c.pipeline_id = s.pipeline_id AND c.to_status_id = s.id
               AND c.created_at >= b.f AND c.created_at < b.t) AS entered
    FROM amo_statuses s
    CROSS JOIN bounds b
    LEFT JOIN leads l ON l.pipeline_id = s.pipeline_id AND l.status_id = s.id
    WHERE p_pipeline IS NOT NULL AND s.pipeline_id = p_pipeline
    GROUP BY s.pipeline_id, s.id, s.name, s.color, s.kind, s.sort, b.f, b.t
  ) x
),
-- Won deals by pipeline (pipelines are the club's products).
by_pipeline AS (
  SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.won DESC, x.name), '[]'::jsonb) AS rows
  FROM (
    SELECT p.id, p.name,
           count(*) FILTER (WHERE l.ck = 'won'  AND l.closed_at >= b.f AND l.closed_at < b.t) AS won,
           count(*) FILTER (WHERE l.ck = 'lost' AND l.closed_at >= b.f AND l.closed_at < b.t) AS lost,
           count(*) FILTER (WHERE l.created_at >= b.f AND l.created_at < b.t) AS new_leads
    FROM leads l
    CROSS JOIN bounds b
    JOIN amo_pipelines p ON p.id = l.pipeline_id
    GROUP BY p.id, p.name
    HAVING count(*) FILTER (WHERE (l.closed_at >= b.f AND l.closed_at < b.t AND l.ck IN ('won','lost'))
                              OR (l.created_at >= b.f AND l.created_at < b.t)) > 0
  ) x
),
-- Leads and wins by source. amo_leads.source is derived by amo-sync from the
-- "Manba" field or, when that's empty (almost always), the lead's tags.
by_source AS (
  SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.new_leads DESC, x.won DESC, x.source), '[]'::jsonb) AS rows
  FROM (
    SELECT coalesce(l.source, 'Noma''lum') AS source,
           count(*) FILTER (WHERE l.created_at >= b.f AND l.created_at < b.t) AS new_leads,
           count(*) FILTER (WHERE l.ck = 'won'  AND l.closed_at >= b.f AND l.closed_at < b.t) AS won,
           count(*) FILTER (WHERE l.ck = 'lost' AND l.closed_at >= b.f AND l.closed_at < b.t) AS lost
    FROM leads l
    CROSS JOIN bounds b
    GROUP BY 1
    HAVING count(*) FILTER (WHERE (l.closed_at >= b.f AND l.closed_at < b.t AND l.ck IN ('won','lost'))
                              OR (l.created_at >= b.f AND l.created_at < b.t)) > 0
  ) x
),
daily AS (
  SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.day), '[]'::jsonb) AS rows
  FROM (
    SELECT d::date AS day,
           (SELECT count(*) FROM leads l
             WHERE (l.created_at AT TIME ZONE 'Asia/Tashkent')::date = d::date) AS new_leads,
           (SELECT count(*) FROM leads l
             WHERE l.ck = 'won' AND (l.closed_at AT TIME ZONE 'Asia/Tashkent')::date = d::date) AS won
    FROM bounds b,
         generate_series((b.f AT TIME ZONE 'Asia/Tashkent')::date,
                         ((b.t - interval '1 second') AT TIME ZONE 'Asia/Tashkent')::date,
                         interval '1 day') d
  ) x
),
managers AS (
  SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.won DESC, x.new_leads DESC, x.name), '[]'::jsonb) AS rows
  FROM (
    SELECT l.responsible_user_id AS id,
           coalesce(u.name, 'Noma''lum') AS name,
           count(*) FILTER (WHERE l.created_at >= b.f AND l.created_at < b.t) AS new_leads,
           count(*) FILTER (WHERE l.kind = 'open') AS active,
           count(*) FILTER (WHERE l.ck = 'won'  AND l.closed_at >= b.f AND l.closed_at < b.t) AS won,
           count(*) FILTER (WHERE l.ck = 'lost' AND l.closed_at >= b.f AND l.closed_at < b.t) AS lost,
           count(*) FILTER (WHERE l.kind = 'open' AND l.updated_at < b.n - interval '14 days') AS stale
    FROM leads l
    CROSS JOIN bounds b
    LEFT JOIN amo_users u ON u.id = l.responsible_user_id
    GROUP BY l.responsible_user_id, u.name
    HAVING count(*) FILTER (WHERE l.created_at >= b.f AND l.created_at < b.t) > 0
        OR count(*) FILTER (WHERE l.kind = 'open') > 0
        OR count(*) FILTER (WHERE l.ck IN ('won','lost') AND l.closed_at >= b.f AND l.closed_at < b.t) > 0
  ) x
),
losses AS (
  SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.count DESC), '[]'::jsonb) AS rows
  FROM (
    SELECT coalesce(nullif(loss_reason, ''), nullif(objection, ''), 'Sabab ko''rsatilmagan') AS reason,
           count(*) AS count
    FROM leads, bounds b
    WHERE ck = 'lost' AND closed_at >= b.f AND closed_at < b.t
    GROUP BY 1
  ) x
),
risky AS (
  SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.idle_days DESC), '[]'::jsonb) AS rows
  FROM (
    SELECT l.id, l.name, l.status_name AS stage,
           coalesce(u.name, 'Noma''lum') AS manager,
           floor(extract(epoch FROM b.n - l.updated_at) / 86400)::int AS idle_days,
           EXISTS (SELECT 1 FROM open_tasks t WHERE t.lead_id = l.id) AS has_task
    FROM leads l
    CROSS JOIN bounds b
    LEFT JOIN amo_users u ON u.id = l.responsible_user_id
    WHERE l.kind = 'open' AND l.updated_at < b.n - interval '14 days'
    ORDER BY l.updated_at ASC
    LIMIT 10
  ) x
)
SELECT jsonb_build_object(
  'kpi', (SELECT to_jsonb(k) || to_jsonb(r) FROM kpi k, revenue r),
  'tasks', (SELECT to_jsonb(t) FROM tasks t),
  'funnel', (SELECT rows FROM funnel),
  'by_pipeline', (SELECT rows FROM by_pipeline),
  'by_source', (SELECT rows FROM by_source),
  'daily', (SELECT rows FROM daily),
  'managers', (SELECT rows FROM managers),
  'losses', (SELECT rows FROM losses),
  'risky', (SELECT rows FROM risky),
  'synced_at', (SELECT value FROM amo_sync_state WHERE key = 'last_success_at'),
  'sync_error', (SELECT value FROM amo_sync_state WHERE key = 'last_error'),
  'amo_base_url', (SELECT value FROM amo_sync_state WHERE key = 'base_url'),
  'pipelines', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY sort), '[]'::jsonb)
                FROM amo_pipelines WHERE NOT is_archive)
);
$$;

REVOKE EXECUTE ON FUNCTION public.amo_dashboard(timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.amo_dashboard(timestamptz, timestamptz, bigint) TO authenticated;
