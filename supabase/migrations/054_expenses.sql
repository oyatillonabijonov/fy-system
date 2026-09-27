-- 054: Moliya — xarajatlar (chiqim), Chiqim / Sof cashflow KPI, har tadbir foydasi.
-- Expenses are event-bound or general (event_id NULL). Money rules match payments (053):
-- readable only with the Moliya module, written only through SECURITY DEFINER RPCs that
-- require can_edit_finance(), never deleted — voided with a reason.
-- Also drops event_finance_totals() (047): nothing calls it since the stage-3 frontend.
BEGIN;

CREATE TABLE public.expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid REFERENCES public.events(id) ON DELETE SET NULL,
  category    text NOT NULL
              CHECK (category IN ('zal','spiker','kofe_brek','reklama','maosh','ofis','boshqa')),
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  spent_at    date NOT NULL,
  note        text,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_at   timestamptz,
  voided_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  void_reason text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_void_has_reason CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);
CREATE INDEX expenses_spent_at_idx ON public.expenses (spent_at DESC, created_at DESC);
CREATE INDEX expenses_event_id_idx ON public.expenses (event_id);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses select finance" ON public.expenses
  FOR SELECT USING (public.has_permission(auth.uid(), 'tadbirlar-moliya'));
-- No INSERT/UPDATE/DELETE policy: add_expense / void_expense only.

-- ─── add_expense ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_expense(
  p_category text,
  p_amount   numeric,
  p_spent_at date,
  p_event_id uuid DEFAULT NULL,
  p_note     text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  INSERT INTO public.expenses (event_id, category, amount, spent_at, note, recorded_by)
  VALUES (p_event_id, p_category, p_amount, p_spent_at, NULLIF(btrim(p_note), ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_expense(text, numeric, date, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.add_expense(text, numeric, date, uuid, text) TO authenticated, service_role;

-- ─── void_expense ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_expense(p_expense_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_voided timestamptz;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT voided_at INTO v_voided FROM public.expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found';
  END IF;
  IF v_voided IS NOT NULL THEN
    RAISE EXCEPTION 'already_voided';
  END IF;

  UPDATE public.expenses
  SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  WHERE id = p_expense_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.void_expense(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.void_expense(uuid, text) TO authenticated, service_role;

-- ─── finance_summary: + expense, net ────────────────────────────────────────
-- The return type changes, so CREATE OR REPLACE can't do it: drop and recreate
-- in this transaction. Expenses follow the period (spent_at) and event filters;
-- they have no seller or method, so those two filters don't touch them (the UI
-- shows "—" for Chiqim / Sof cashflow while either is set).
DROP FUNCTION public.finance_summary(date, date, uuid, uuid, boolean, text);
CREATE FUNCTION public.finance_summary(
  p_from      date    DEFAULT NULL,
  p_to        date    DEFAULT NULL,
  p_event_id  uuid    DEFAULT NULL,
  p_seller_id uuid    DEFAULT NULL,
  p_no_seller boolean DEFAULT false,
  p_method    text    DEFAULT NULL
)
RETURNS TABLE (
  income           numeric,
  expense          numeric,
  net              numeric,
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
  ),
  inc AS (
    SELECT COALESCE(SUM(p.amount), 0) AS v
    FROM public.payments p JOIN parts ON parts.id = p.participant_id
    WHERE p.voided_at IS NULL
      AND (p_method IS NULL OR p.method = p_method)
      AND (p_from IS NULL OR (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date >= p_from)
      AND (p_to   IS NULL OR (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date <= p_to)
  ),
  exp AS (
    SELECT COALESCE(SUM(x.amount), 0) AS v
    FROM public.expenses x
    WHERE public.has_permission(auth.uid(), 'tadbirlar-moliya')
      AND x.voided_at IS NULL
      AND (p_event_id IS NULL OR x.event_id = p_event_id)
      AND (p_from IS NULL OR x.spent_at >= p_from)
      AND (p_to   IS NULL OR x.spent_at <= p_to)
  )
  SELECT
    inc.v,
    exp.v,
    inc.v - exp.v,
    (SELECT COALESCE(SUM(GREATEST(price - paid, 0)), 0) FROM dated),
    (SELECT COALESCE(SUM(GREATEST(price - paid, 0)), 0) FROM dated
     WHERE next_due_date < (now() AT TIME ZONE 'Asia/Tashkent')::date),
    (SELECT COALESCE(SUM(price), 0) FROM dated),
    (SELECT COALESCE(SUM(paid), 0) FROM dated),
    (SELECT COALESCE(SUM(cashback_balance), 0) FROM public.clients
     WHERE public.has_permission(auth.uid(), 'tadbirlar-moliya'))
  FROM inc, exp;
$$;
REVOKE EXECUTE ON FUNCTION public.finance_summary(date, date, uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.finance_summary(date, date, uuid, uuid, boolean, text) TO authenticated, service_role;

-- ─── event_profit (Tadbirlar tab) ───────────────────────────────────────────
-- One row per event with any money in the period, plus one event_id NULL row for
-- general expenses. Dates filter the same columns as finance_summary, so with the
-- same period/event the rows' SUM(profit) equals finance_summary.net.
-- Profit is cash: collected (payments − refunds, no cashback) − expenses.
CREATE OR REPLACE FUNCTION public.event_profit(
  p_from     date DEFAULT NULL,
  p_to       date DEFAULT NULL,
  p_event_id uuid DEFAULT NULL
)
RETURNS TABLE (
  event_id    uuid,
  event_name  text,
  event_date  timestamptz,
  total_value numeric,
  agreed      numeric,
  collected   numeric,
  debt        numeric,
  expense     numeric,
  profit      numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH dated AS (
    SELECT ep.event_id, SUM(ep.price) AS agreed, SUM(GREATEST(ep.price - ep.paid, 0)) AS debt
    FROM public.event_participants ep
    WHERE (p_from IS NULL OR (ep.created_at AT TIME ZONE 'Asia/Tashkent')::date >= p_from)
      AND (p_to   IS NULL OR (ep.created_at AT TIME ZONE 'Asia/Tashkent')::date <= p_to)
    GROUP BY ep.event_id
  ),
  cash AS (
    SELECT ep.event_id, SUM(p.amount) AS collected
    FROM public.payments p JOIN public.event_participants ep ON ep.id = p.participant_id
    WHERE p.voided_at IS NULL
      AND (p_from IS NULL OR (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date >= p_from)
      AND (p_to   IS NULL OR (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date <= p_to)
    GROUP BY ep.event_id
  ),
  spent AS (
    SELECT x.event_id, SUM(x.amount) AS expense
    FROM public.expenses x
    WHERE x.voided_at IS NULL
      AND (p_from IS NULL OR x.spent_at >= p_from)
      AND (p_to   IS NULL OR x.spent_at <= p_to)
    GROUP BY x.event_id
  ),
  ids AS (  -- UNION also collapses the NULL (general) key into one row
    SELECT event_id FROM dated UNION SELECT event_id FROM cash UNION SELECT event_id FROM spent
  )
  SELECT
    ids.event_id,
    e.name,
    e.date,
    COALESCE(e.total_value, 0),
    COALESCE(d.agreed, 0),
    COALESCE(c.collected, 0),
    COALESCE(d.debt, 0),
    COALESCE(s.expense, 0),
    COALESCE(c.collected, 0) - COALESCE(s.expense, 0)
  FROM ids
  LEFT JOIN public.events e ON e.id = ids.event_id
  LEFT JOIN dated d ON d.event_id IS NOT DISTINCT FROM ids.event_id
  LEFT JOIN cash  c ON c.event_id IS NOT DISTINCT FROM ids.event_id
  LEFT JOIN spent s ON s.event_id IS NOT DISTINCT FROM ids.event_id
  WHERE public.has_permission(auth.uid(), 'tadbirlar-moliya')
    AND (p_event_id IS NULL OR ids.event_id = p_event_id)
  ORDER BY ids.event_id IS NULL, e.date DESC NULLS LAST, e.name;
$$;
REVOKE EXECUTE ON FUNCTION public.event_profit(date, date, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.event_profit(date, date, uuid) TO authenticated, service_role;

-- ─── event_finance_totals (047) — replaced by finance_summary in 053 ────────
DROP FUNCTION IF EXISTS public.event_finance_totals();

COMMIT;
