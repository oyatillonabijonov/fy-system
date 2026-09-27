-- 053: Moliya core — money moves only through RPCs, payments are voided or
-- refunded (never deleted), finance-only reads, KPIs from the DB.
-- Spec: docs/superpowers/specs/2026-09-27-tadbirlar-moliya-design.md §5.2
-- event_finance_totals() stays until 054: the old frontend calls it until the
-- new one is deployed.

BEGIN;

-- ─── payments: kind + void ───────────────────────────────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS kind        text NOT NULL DEFAULT 'payment',
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

-- 035 accepted any non-zero amount; a negative row can only have been a refund.
UPDATE public.payments SET kind = 'refund' WHERE amount < 0;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_kind_check CHECK (kind IN ('payment', 'refund')),
  ADD CONSTRAINT payments_kind_sign_check
    CHECK ((kind = 'payment' AND amount > 0) OR (kind = 'refund' AND amount < 0)),
  ADD CONSTRAINT payments_void_reason_check
    CHECK (voided_at IS NULL OR btrim(COALESCE(void_reason, '')) <> '');

-- paid = active (non-voided) payments + cashback spent. The sync trigger (043)
-- already fires on UPDATE, so voiding recalculates and claws back cashback.
CREATE OR REPLACE FUNCTION public.recalc_participant_paid(p_participant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.event_participants ep
  SET paid = COALESCE(
        (SELECT SUM(p.amount) FROM public.payments p
         WHERE p.participant_id = p_participant_id AND p.voided_at IS NULL),
        0
      ) + COALESCE(ep.cashback_used, 0)
  WHERE ep.id = p_participant_id;
$$;

-- ─── dashboard_revenue(): Dashboard's slice of real money ───────────────────
-- 049/050's amo_dashboard() is SECURITY INVOKER over `payments`, which above
-- is now readable only by `tadbirlar-moliya`. Left alone, that would (a) count
-- voided/refunded rows in Dashboard revenue, and (b) drop revenue to 0 for a
-- `dashboard`-only user without Moliya access. The individual payments list
-- stays Moliya-only; Dashboard is only allowed the four numbers below, so this
-- SECURITY DEFINER function computes just revenue/prev_revenue/payers/
-- prev_payers over non-voided payments, gated on `dashboard` instead of
-- `tadbirlar-moliya` (same bounds amo_dashboard already computes: p_from/p_to
-- = the period, p_prev_from = the previous period's start = b.pf).
CREATE OR REPLACE FUNCTION public.dashboard_revenue(
  p_from      timestamptz,
  p_to        timestamptz,
  p_prev_from timestamptz
)
RETURNS TABLE (
  revenue      numeric,
  prev_revenue numeric,
  payers       bigint,
  prev_payers  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    coalesce(sum(amount) FILTER (WHERE paid_at >= p_from      AND paid_at < p_to), 0),
    coalesce(sum(amount) FILTER (WHERE paid_at >= p_prev_from AND paid_at < p_from), 0),
    count(DISTINCT participant_id) FILTER (WHERE paid_at >= p_from      AND paid_at < p_to),
    count(DISTINCT participant_id) FILTER (WHERE paid_at >= p_prev_from AND paid_at < p_from)
  FROM public.payments
  -- No permission → filters out every row → one row of zeros (count is never
  -- NULL; sum is coalesced), not an empty result set. auth.uid() IS NULL is a
  -- trusted server context (psql / service_role — anon is REVOKEd below, so
  -- it can never reach this), same as guard_participant_finance_fields above.
  WHERE voided_at IS NULL
    AND (auth.uid() IS NULL OR public.has_permission(auth.uid(), 'dashboard'));
$$;
REVOKE EXECUTE ON FUNCTION public.dashboard_revenue(timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.dashboard_revenue(timestamptz, timestamptz, timestamptz) TO authenticated, service_role;

-- amo_dashboard() (050) copied verbatim except the `revenue` CTE, which now
-- reads dashboard_revenue() instead of summing `payments` directly.
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
-- Real money: dashboard_revenue() over this system's payments (all events;
-- pipeline filter doesn't apply), excluding voided rows and gated on the
-- `dashboard` module so it works for a Dashboard-only viewer too (053).
revenue AS (
  SELECT dr.revenue, dr.prev_revenue, dr.payers, dr.prev_payers
  FROM bounds b, public.dashboard_revenue(b.f, b.t, b.pf) dr
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

-- ─── event_participants: next due date ───────────────────────────────────────
ALTER TABLE public.event_participants ADD COLUMN IF NOT EXISTS next_due_date date;

-- ─── who may edit money ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_edit_finance(p_user uuid)
RETURNS bool
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin(p_user) OR EXISTS (
    SELECT 1 FROM public.user_permissions
    WHERE user_id = p_user AND module = 'tadbirlar-moliya' AND can_edit
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_edit_finance(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_edit_finance(uuid) TO authenticated, service_role;

-- ─── payments RLS: finance reads, nobody writes directly ─────────────────────
DROP POLICY IF EXISTS "payments select staff" ON public.payments;
DROP POLICY IF EXISTS "payments insert staff" ON public.payments;
DROP POLICY IF EXISTS "payments update staff" ON public.payments;
DROP POLICY IF EXISTS "payments delete staff" ON public.payments;
CREATE POLICY "payments select finance" ON public.payments
  FOR SELECT USING (public.has_permission(auth.uid(), 'tadbirlar-moliya'));
-- "payments select own" (members, 035) stays.

-- ─── cashback_transactions: writes need the finance edit right ──────────────
-- 028 gated writes on is_staff(auth.uid()) — any staff, not only Moliya
-- editors, could INSERT a manual_add row and then spend_cashback it into a
-- participant's paid with no cash behind it. Reads stay staff-or-own (028).
DROP POLICY IF EXISTS "cashback insert staff" ON public.cashback_transactions;
DROP POLICY IF EXISTS "cashback update staff" ON public.cashback_transactions;
DROP POLICY IF EXISTS "cashback delete staff" ON public.cashback_transactions;
CREATE POLICY "cashback insert finance" ON public.cashback_transactions
  FOR INSERT WITH CHECK (public.can_edit_finance(auth.uid()));
CREATE POLICY "cashback update finance" ON public.cashback_transactions
  FOR UPDATE USING (public.can_edit_finance(auth.uid())) WITH CHECK (public.can_edit_finance(auth.uid()));
CREATE POLICY "cashback delete finance" ON public.cashback_transactions
  FOR DELETE USING (public.can_edit_finance(auth.uid()));
-- "cashback select staff or own" (028) stays.
-- The ledger-writing triggers (auto_award_cashback, clawback_on_participant_delete,
-- update_client_cashback_balance) are all SECURITY DEFINER, so they run as the
-- function owner and are unaffected by these policies.

-- spend_cashback (043) was staff-only; raise the bar to the same finance-edit
-- right as every other money-moving RPC, same body otherwise.
CREATE OR REPLACE FUNCTION public.spend_cashback(
  p_participant_id uuid,
  p_client_id      uuid,
  p_event_id       uuid,
  p_amount         numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance numeric;
  v_debt    numeric;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'cashback_invalid_amount (requested=%)', p_amount;
  END IF;

  -- Lock client row to prevent concurrent overspend
  SELECT cashback_balance INTO v_balance
  FROM clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'cashback_insufficient (balance=%, requested=%)',
      COALESCE(v_balance, 0), p_amount;
  END IF;

  -- Never spend past the real debt: the UI caps on cached price/paid, which can
  -- be stale, and cashback spent beyond the debt is burned with nothing in return.
  SELECT COALESCE(price, 0) - COALESCE(paid, 0) INTO v_debt
  FROM event_participants
  WHERE id = p_participant_id
  FOR UPDATE;

  IF v_debt IS NULL THEN
    RAISE EXCEPTION 'participant_not_found (%)', p_participant_id;
  END IF;

  IF p_amount > v_debt THEN
    RAISE EXCEPTION 'cashback_exceeds_debt (debt=%, requested=%)', v_debt, p_amount;
  END IF;

  -- Record the spend (trigger_update_cashback_balance recomputes the balance)
  INSERT INTO cashback_transactions(
    client_id, event_id, participant_id, type, amount, description, created_by
  ) VALUES (
    p_client_id, p_event_id, p_participant_id,
    'used', p_amount, 'Keyingi xaridda chegirma', 'staff'
  );

  -- Update participant: accumulate cashback_used and raise paid (skip award)
  UPDATE event_participants
  SET cashback_used       = COALESCE(cashback_used, 0) + p_amount,
      paid                = paid + p_amount,
      skip_cashback_award = true
  WHERE id = p_participant_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.spend_cashback(uuid, uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.spend_cashback(uuid, uuid, uuid, numeric) TO authenticated, service_role;

-- ─── participant guards ──────────────────────────────────────────────────────
-- Agreed price and due date are money: only finance editors change them.
-- auth.uid() is NULL for SQL maintenance / service role — only app users are gated.
CREATE OR REPLACE FUNCTION public.guard_participant_finance_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.price IS DISTINCT FROM OLD.price OR NEW.next_due_date IS DISTINCT FROM OLD.next_due_date)
     AND NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_fields';
  END IF;
  -- Applies to everyone, finance editors included — an agreed price below what
  -- was already collected would make debt negative everywhere it's shown.
  IF NEW.price IS DISTINCT FROM OLD.price AND NEW.price < NEW.paid THEN
    RAISE EXCEPTION 'price_below_paid';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_participant_finance_fields() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trigger_guard_participant_finance_fields
  BEFORE UPDATE ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_participant_finance_fields();

-- A participant with live payments is money history: void them in Moliya first.
-- Also blocks deleting an event that has such participants (the cascade fires this).
CREATE OR REPLACE FUNCTION public.guard_participant_has_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments WHERE participant_id = OLD.id AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'participant_has_payments';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_participant_has_payments() FROM PUBLIC, anon, authenticated;
-- Named to sort alphabetically before "trigger_clawback_on_participant_delete" (038):
-- Postgres fires same-event BEFORE ROW triggers in trigger-name order, and this guard
-- must run first — otherwise the clawback trigger inserts a cashback_transactions row
-- (referencing the event) before this guard blocks the delete, and on an event-cascade
-- delete that row's event has already been removed, so the insert fails on the FK
-- instead of the participant_has_payments error callers expect.
CREATE TRIGGER trigger_00_guard_participant_has_payments
  BEFORE DELETE ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_participant_has_payments();

-- ─── record_payment ──────────────────────────────────────────────────────────
-- One call for "client X paid N for event E": finds the client's participation,
-- or enrols them (existing client by id, or new by name + phone via 052's
-- enroll_participant), then inserts the payment. All or nothing.
CREATE OR REPLACE FUNCTION public.record_payment(
  p_event_id      uuid,
  p_amount        numeric,
  p_method        text,
  p_paid_at       timestamptz DEFAULT now(),
  p_client_id     uuid        DEFAULT NULL,
  p_full_name     text        DEFAULT NULL,
  p_phone         text        DEFAULT NULL,
  p_tariff_id     uuid        DEFAULT NULL,
  p_seller_id     uuid        DEFAULT NULL,
  p_price         numeric     DEFAULT NULL,
  p_next_due_date date        DEFAULT NULL,
  p_note          text        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_participant uuid;
  v_price       numeric(12,2);
  v_paid        numeric(12,2);
  v_payment     uuid;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT id INTO v_participant
    FROM public.event_participants
    WHERE event_id = p_event_id AND contact_id = p_client_id;
  END IF;

  IF v_participant IS NULL THEN
    IF p_tariff_id IS NULL OR p_seller_id IS NULL THEN
      RAISE EXCEPTION 'enroll_required';
    END IF;
    v_participant := public.enroll_participant(
      p_event_id, p_tariff_id, p_seller_id, p_client_id, p_full_name, p_phone);
    IF p_price IS NOT NULL THEN
      IF p_price < 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;
      UPDATE public.event_participants SET price = p_price WHERE id = v_participant;
    END IF;
  END IF;

  -- Lock the row: two cashiers paying the same debt at once can't overshoot it.
  SELECT price, paid INTO v_price, v_paid
  FROM public.event_participants WHERE id = v_participant FOR UPDATE;
  IF p_amount > v_price - v_paid THEN
    RAISE EXCEPTION 'amount_exceeds_debt (debt=%)', GREATEST(v_price - v_paid, 0);
  END IF;

  INSERT INTO public.payments (participant_id, amount, method, paid_at, recorded_by, note, kind)
  VALUES (v_participant, p_amount, p_method, COALESCE(p_paid_at, now()), auth.uid(),
          NULLIF(btrim(COALESCE(p_note, '')), ''), 'payment')
  RETURNING id INTO v_payment;

  -- The old due date is settled once fully paid; a partial payment without a new
  -- date given keeps the existing one instead of silently wiping it.
  UPDATE public.event_participants
  SET next_due_date = CASE WHEN price > paid THEN COALESCE(p_next_due_date, next_due_date) ELSE NULL END
  WHERE id = v_participant;

  RETURN v_payment;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, timestamptz, uuid, text, text, uuid, uuid, numeric, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, timestamptz, uuid, text, text, uuid, uuid, numeric, date, text) TO authenticated, service_role;

-- ─── void_payment ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_payment(p_payment_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r        public.payments%ROWTYPE;
  v_price  numeric(12,2);
  v_paid   numeric(12,2);
  v_used   numeric(12,2);
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO r FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  IF r.voided_at IS NOT NULL THEN RAISE EXCEPTION 'already_voided'; END IF;

  -- Lock the participant for either direction: a concurrent record_payment must
  -- not race the recalc this void triggers.
  SELECT price, paid, cashback_used INTO v_price, v_paid, v_used
  FROM public.event_participants WHERE id = r.participant_id FOR UPDATE;

  IF r.kind = 'refund' THEN
    -- Voiding a refund puts the money back on the participant: never past the price.
    IF v_paid - r.amount > v_price THEN
      RAISE EXCEPTION 'void_would_overpay';
    END IF;
  ELSE
    -- Voiding a payment removes cash that may have already been refunded:
    -- the cash actually left standing (paid minus cashback used) must stay >= 0.
    IF (v_paid - COALESCE(v_used, 0)) - r.amount < 0 THEN
      RAISE EXCEPTION 'void_would_go_negative';
    END IF;
  END IF;

  UPDATE public.payments
  SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  WHERE id = p_payment_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.void_payment(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.void_payment(uuid, text) TO authenticated, service_role;

-- ─── refund_payment ──────────────────────────────────────────────────────────
-- Money handed back is its own negative row; capped by cash actually paid
-- (cashback spent isn't cash and goes back through the cashback ledger).
CREATE OR REPLACE FUNCTION public.refund_payment(
  p_participant_id uuid,
  p_amount         numeric,
  p_method         text,
  p_note           text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cash numeric(12,2);
  v_id   uuid;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT paid - COALESCE(cashback_used, 0) INTO v_cash
  FROM public.event_participants WHERE id = p_participant_id FOR UPDATE;
  IF v_cash IS NULL THEN RAISE EXCEPTION 'participant_not_found'; END IF;
  IF p_amount > v_cash THEN
    RAISE EXCEPTION 'refund_exceeds_paid (paid=%)', v_cash;
  END IF;

  INSERT INTO public.payments (participant_id, amount, method, paid_at, recorded_by, note, kind)
  VALUES (p_participant_id, -p_amount, p_method, now(), auth.uid(),
          NULLIF(btrim(COALESCE(p_note, '')), ''), 'refund')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refund_payment(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.refund_payment(uuid, numeric, text, text) TO authenticated, service_role;

-- ─── finance_summary (KPIs) ──────────────────────────────────────────────────
-- SECURITY INVOKER: payments RLS applies. Dates are Tashkent calendar days:
-- payments filter on paid_at, debt/agreed/collected on enrolment (created_at).
CREATE OR REPLACE FUNCTION public.finance_summary(
  p_from      date    DEFAULT NULL,
  p_to        date    DEFAULT NULL,
  p_event_id  uuid    DEFAULT NULL,
  p_seller_id uuid    DEFAULT NULL,
  p_no_seller boolean DEFAULT false,
  p_method    text    DEFAULT NULL
)
RETURNS TABLE (
  income           numeric,
  debt             numeric,
  overdue_debt     numeric,
  agreed           numeric,
  collected        numeric,
  cashback_balance numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH parts AS (
    SELECT ep.*
    FROM public.event_participants ep
    WHERE public.has_permission(auth.uid(), 'tadbirlar-moliya')
      AND (p_event_id IS NULL OR ep.event_id = p_event_id)
      AND (p_seller_id IS NULL OR ep.seller_id = p_seller_id)
      AND (NOT p_no_seller OR ep.seller_id IS NULL)
  ),
  dated AS (
    SELECT * FROM parts
    WHERE (p_from IS NULL OR (created_at AT TIME ZONE 'Asia/Tashkent')::date >= p_from)
      AND (p_to   IS NULL OR (created_at AT TIME ZONE 'Asia/Tashkent')::date <= p_to)
  )
  SELECT
    (SELECT COALESCE(SUM(p.amount), 0)
     FROM public.payments p JOIN parts ON parts.id = p.participant_id
     WHERE p.voided_at IS NULL
       AND (p_method IS NULL OR p.method = p_method)
       AND (p_from IS NULL OR (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date >= p_from)
       AND (p_to   IS NULL OR (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date <= p_to)),
    (SELECT COALESCE(SUM(GREATEST(price - paid, 0)), 0) FROM dated),
    (SELECT COALESCE(SUM(GREATEST(price - paid, 0)), 0) FROM dated
     WHERE next_due_date < (now() AT TIME ZONE 'Asia/Tashkent')::date),
    (SELECT COALESCE(SUM(price), 0) FROM dated),
    (SELECT COALESCE(SUM(paid), 0) FROM dated),
    (SELECT COALESCE(SUM(cashback_balance), 0) FROM public.clients
     WHERE public.has_permission(auth.uid(), 'tadbirlar-moliya'));
$$;
REVOKE EXECUTE ON FUNCTION public.finance_summary(date, date, uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.finance_summary(date, date, uuid, uuid, boolean, text) TO authenticated, service_role;

-- ─── finance_debtors (Qarzdorlar tab) ────────────────────────────────────────
-- PostgREST can't compare two columns (price > paid), so the list is an RPC.
CREATE OR REPLACE FUNCTION public.finance_debtors(
  p_from      date    DEFAULT NULL,
  p_to        date    DEFAULT NULL,
  p_event_id  uuid    DEFAULT NULL,
  p_seller_id uuid    DEFAULT NULL,
  p_no_seller boolean DEFAULT false,
  p_status    text    DEFAULT 'debt'   -- debt | overdue | paid | all
)
RETURNS TABLE (
  participant_id         uuid,
  event_id               uuid,
  event_name             text,
  client_id              uuid,
  full_name              text,
  phone                  text,
  seller_id              uuid,
  seller_name            text,
  tariff_id              uuid,
  tariff_name            text,
  price                  numeric,
  paid                   numeric,
  debt                   numeric,
  cashback_used          numeric,
  cashback_earned        numeric,
  cashback_percent       numeric,
  event_cashback_percent numeric,
  cashback_balance       numeric,
  next_due_date          date,
  enrolled_at            timestamptz,
  age_days               int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    ep.id, ep.event_id, e.name, ep.contact_id, ep.full_name, ep.phone,
    ep.seller_id, s.full_name, ep.tariff_id, t.name,
    ep.price, ep.paid, ep.price - ep.paid,
    COALESCE(ep.cashback_used, 0), COALESCE(ep.cashback_earned, 0),
    ep.cashback_percent, COALESCE(e.cashback_percent, 0),
    COALESCE(c.cashback_balance, 0), ep.next_due_date, ep.created_at,
    ((now() AT TIME ZONE 'Asia/Tashkent')::date - (ep.created_at AT TIME ZONE 'Asia/Tashkent')::date)
  FROM public.event_participants ep
  JOIN public.events e ON e.id = ep.event_id
  LEFT JOIN public.profiles s ON s.id = ep.seller_id
  LEFT JOIN public.event_tariffs t ON t.id = ep.tariff_id
  LEFT JOIN public.clients c ON c.id = ep.contact_id
  WHERE public.has_permission(auth.uid(), 'tadbirlar-moliya')
    AND (p_event_id IS NULL OR ep.event_id = p_event_id)
    AND (p_seller_id IS NULL OR ep.seller_id = p_seller_id)
    AND (NOT p_no_seller OR ep.seller_id IS NULL)
    AND (p_from IS NULL OR (ep.created_at AT TIME ZONE 'Asia/Tashkent')::date >= p_from)
    AND (p_to   IS NULL OR (ep.created_at AT TIME ZONE 'Asia/Tashkent')::date <= p_to)
    AND CASE p_status
          WHEN 'all'     THEN true
          WHEN 'paid'    THEN ep.price <= ep.paid
          WHEN 'overdue' THEN ep.price > ep.paid
                              AND ep.next_due_date < (now() AT TIME ZONE 'Asia/Tashkent')::date
          ELSE ep.price > ep.paid
        END
  ORDER BY ep.price - ep.paid DESC, ep.created_at
  -- ponytail: 1000 rows = PostgREST max_rows; paginate if a filter ever returns more.
  LIMIT 1000;
$$;
REVOKE EXECUTE ON FUNCTION public.finance_debtors(date, date, uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.finance_debtors(date, date, uuid, uuid, boolean, text) TO authenticated, service_role;

COMMIT;
