-- Migration 040: Fix update_client_cashback_balance to handle 'clawback' type
--
-- Bug: migration 038 added clawback transactions but did not update the balance
-- trigger, so clawback inserts were silently ignored — balances never decreased.
--
-- Sign convention confirmed from live data:
--   earned / manual_add      → amount stored POSITIVE  → balance += amount
--   used   / manual_subtract → amount stored POSITIVE  → balance -= amount
--   clawback                 → amount stored NEGATIVE  → balance += amount
--                                                         (effectively subtracts)
--
-- double-floor: auto_award_cashback already floors with LEAST(clawback, balance)
-- before writing the transaction, so GREATEST(0, ...) here is a safety net only.
--
-- Future consistency check MUST include clawback:
--   CASE WHEN type IN ('earned','manual_add')      THEN  amount
--        WHEN type IN ('used','manual_subtract')   THEN -amount
--        WHEN type = 'clawback'                    THEN  amount  -- already negative
--        ELSE 0 END

-- ─── FIX 1: Update balance trigger ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_client_cashback_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.type IN ('earned', 'manual_add') THEN
      UPDATE public.clients
      SET cashback_balance = cashback_balance + NEW.amount,
          updated_at = now()
      WHERE id = NEW.client_id;
    ELSIF NEW.type IN ('used', 'manual_subtract') THEN
      UPDATE public.clients
      SET cashback_balance = cashback_balance - NEW.amount,
          updated_at = now()
      WHERE id = NEW.client_id;
    ELSIF NEW.type = 'clawback' THEN
      -- amount is already negative; GREATEST prevents any floating-point drift below 0
      UPDATE public.clients
      SET cashback_balance = GREATEST(0, cashback_balance + NEW.amount),
          updated_at = now()
      WHERE id = NEW.client_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_client_cashback_balance() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_client_cashback_balance() TO service_role;

-- ─── FIX 2: Recalculate all balances from transaction history ─────────────────
-- Repairs any drift caused by clawback transactions that were written before
-- this fix was applied.

DO $$
DECLARE
  v_fixed int;
BEGIN
  WITH recalc AS (
    SELECT
      cl.id,
      GREATEST(0, COALESCE(SUM(
        CASE
          WHEN t.type IN ('earned', 'manual_add')      THEN  t.amount
          WHEN t.type IN ('used', 'manual_subtract')   THEN -t.amount
          WHEN t.type = 'clawback'                     THEN  t.amount
          ELSE 0
        END
      ), 0)) AS calculated
    FROM public.clients cl
    LEFT JOIN public.cashback_transactions t ON t.client_id = cl.id
    GROUP BY cl.id
  ),
  updated AS (
    UPDATE public.clients c
    SET cashback_balance = r.calculated,
        updated_at = now()
    FROM recalc r
    WHERE c.id = r.id
      AND c.cashback_balance <> r.calculated
    RETURNING c.id
  )
  SELECT COUNT(*) INTO v_fixed FROM updated;

  RAISE NOTICE 'Cashback balance drift fixed: % client(s) corrected', v_fixed;
END;
$$;
