-- 059: manual cashback adjustments + 12-month expiry.
--
-- 1. adjust_cashback(): finance editors add or subtract cashback by hand, with a
--    reason. The ledger becomes write-through-functions only — the direct
--    INSERT/UPDATE/DELETE policies (053) are dropped, so nobody can edit or delete
--    history rows from the API; every writer (triggers, spend/adjust/expire) is
--    SECURITY DEFINER.
-- 2. Expiry: every credit (earned, manual_add) is valid for 12 months. Debits
--    (used, manual_subtract, clawback, expired) are taken from the OLDEST credits
--    first, so the part of credits older than 12 months that debits haven't
--    covered is what expires: GREATEST(0, old_credits - all_debits). expire_cashback()
--    writes that as an 'expired' ledger row — idempotent (the new row is itself a
--    debit, so a second run finds nothing). It runs on every amo-sync pass (every
--    10 min) and right before any spend/adjust for that client, so expired money
--    can't be spent even if the job lagged.
-- 3. cashback_next_expiry(): the amount and date of the next portion to expire,
--    for the client card.

BEGIN;

-- ─── ledger type 'expired' ──────────────────────────────────────────────────
ALTER TABLE public.cashback_transactions DROP CONSTRAINT IF EXISTS cashback_transactions_type_check;
ALTER TABLE public.cashback_transactions ADD CONSTRAINT cashback_transactions_type_check
  CHECK (type IN ('earned', 'used', 'manual_add', 'manual_subtract', 'clawback', 'expired'));

CREATE OR REPLACE FUNCTION public.recalc_client_cashback_balance(p_client_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.clients c
  SET cashback_balance = GREATEST(0, COALESCE((
        SELECT SUM(
          CASE
            WHEN t.type IN ('earned', 'manual_add')               THEN  t.amount
            WHEN t.type IN ('used', 'manual_subtract', 'expired') THEN -t.amount
            WHEN t.type = 'clawback'                              THEN  t.amount  -- stored negative
            ELSE 0
          END
        )
        FROM public.cashback_transactions t
        WHERE t.client_id = p_client_id
      ), 0)),
      updated_at = now()
  WHERE c.id = p_client_id;
$$;

-- ─── ledger is append-only through functions ────────────────────────────────
DROP POLICY IF EXISTS "cashback insert finance" ON public.cashback_transactions;
DROP POLICY IF EXISTS "cashback update finance" ON public.cashback_transactions;
DROP POLICY IF EXISTS "cashback delete finance" ON public.cashback_transactions;

-- ─── expiry ─────────────────────────────────────────────────────────────────
-- p_client NULL = every client. Returns how many clients lost cashback.
CREATE OR REPLACE FUNCTION public.expire_cashback(p_client uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT t.client_id,
           SUM(t.amount) FILTER (WHERE t.type IN ('earned', 'manual_add')
                                   AND t.created_at < now() - interval '12 months') AS old_credits,
           SUM(CASE WHEN t.type = 'clawback' THEN -t.amount ELSE t.amount END)
             FILTER (WHERE t.type IN ('used', 'manual_subtract', 'clawback', 'expired')) AS debits
    FROM public.cashback_transactions t
    WHERE p_client IS NULL OR t.client_id = p_client
    GROUP BY t.client_id
  LOOP
    IF COALESCE(r.old_credits, 0) - COALESCE(r.debits, 0) > 0 THEN
      INSERT INTO public.cashback_transactions (client_id, type, amount, description, created_by)
      VALUES (r.client_id, 'expired', r.old_credits - COALESCE(r.debits, 0),
              'Muddati tugadi (12 oy)', 'system');
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.expire_cashback(uuid) FROM PUBLIC, anon, authenticated;

-- Next portion to expire: walk credits oldest-first until the debits are used up.
CREATE OR REPLACE FUNCTION public.cashback_next_expiry(p_client uuid)
RETURNS TABLE (amount numeric, expires_on date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH credits AS (
    SELECT t.amount, t.created_at,
           SUM(t.amount) OVER (ORDER BY t.created_at, t.id) AS cum
    FROM public.cashback_transactions t
    WHERE t.client_id = p_client AND t.type IN ('earned', 'manual_add')
  ), debits AS (
    SELECT COALESCE(SUM(CASE WHEN t.type = 'clawback' THEN -t.amount ELSE t.amount END), 0) AS d
    FROM public.cashback_transactions t
    WHERE t.client_id = p_client AND t.type IN ('used', 'manual_subtract', 'clawback', 'expired')
  )
  SELECT LEAST(c.amount, c.cum - d.d), (c.created_at + interval '12 months')::date
  FROM credits c, debits d
  WHERE c.cum > d.d
  ORDER BY c.created_at
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.cashback_next_expiry(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cashback_next_expiry(uuid) TO authenticated;

-- ─── manual add / subtract ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.adjust_cashback(
  p_client_id uuid,
  p_type      text,     -- 'add' | 'subtract'
  p_amount    numeric,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance numeric;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF p_type NOT IN ('add', 'subtract') THEN
    RAISE EXCEPTION 'cashback_invalid_type';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'cashback_invalid_amount (requested=%)', p_amount;
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  PERFORM public.expire_cashback(p_client_id);
  SELECT cashback_balance INTO v_balance FROM public.clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;
  IF p_type = 'subtract' AND p_amount > COALESCE(v_balance, 0) THEN
    RAISE EXCEPTION 'cashback_insufficient (balance=%, requested=%)', COALESCE(v_balance, 0), p_amount;
  END IF;

  INSERT INTO public.cashback_transactions (client_id, type, amount, description, created_by)
  VALUES (p_client_id, CASE p_type WHEN 'add' THEN 'manual_add' ELSE 'manual_subtract' END,
          p_amount, btrim(p_reason), 'staff');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.adjust_cashback(uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.adjust_cashback(uuid, text, numeric, text) TO authenticated;

-- ─── spend: expire first (body otherwise as in 043/053) ─────────────────────
CREATE OR REPLACE FUNCTION public.spend_cashback(p_participant_id uuid, p_client_id uuid, p_event_id uuid, p_amount numeric)
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

  -- Cashback older than 12 months is gone before we look at the balance
  PERFORM public.expire_cashback(p_client_id);

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

-- Expire whatever is already past 12 months
SELECT public.expire_cashback();

COMMIT;
