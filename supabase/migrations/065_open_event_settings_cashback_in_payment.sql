-- 065: simpler access (decided 2026-09-29) + cashback applied inside a payment.
--
-- 1. Anyone with the Tadbirlar module sets up events freely again — the event's
--    cashback %, tariffs and the individual price ("Individual kelishuv"). The
--    063 (cashback % / individual price) and 064 (tariffs) finance-only checks are
--    removed. What stays: Moliya itself (payments, refunds, debtors, expenses)
--    needs the tadbirlar-moliya module, and 062's guard (no API writes to paid /
--    cashback columns) plus 063's no-show rules (spent cashback returned, price
--    follows paid).
-- 2. record_payment(…, p_cashback): p_amount is what the payment settles; up to
--    p_cashback of it is paid from the client's cashback balance (spend_cashback)
--    and the rest (p_amount − p_cashback) is recorded as cash — one transaction.
--    p_cashback = p_amount writes no cash row and returns NULL.

BEGIN;

-- ─── 1. open event settings again ───────────────────────────────────────────
DROP TRIGGER IF EXISTS trigger_guard_event_cashback_percent ON public.events;
DROP FUNCTION IF EXISTS public.guard_event_cashback_percent();
DROP TRIGGER IF EXISTS trigger_guard_event_tariffs ON public.event_tariffs;
DROP FUNCTION IF EXISTS public.guard_event_tariffs();

-- 062's guard as it was (063 had added a finance check on direct INSERTs)
CREATE OR REPLACE FUNCTION public.guard_participant_derived_money()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.paid, 0) <> 0 OR COALESCE(NEW.cashback_used, 0) <> 0
       OR COALESCE(NEW.cashback_earned, 0) <> 0 OR NEW.no_show_at IS NOT NULL THEN
      RAISE EXCEPTION 'forbidden: derived_money_fields';
    END IF;
  ELSE
    IF NEW.paid IS DISTINCT FROM OLD.paid
       OR NEW.cashback_used IS DISTINCT FROM OLD.cashback_used
       OR NEW.cashback_earned IS DISTINCT FROM OLD.cashback_earned
       OR NEW.no_show_at IS DISTINCT FROM OLD.no_show_at
       OR NEW.skip_cashback_award IS DISTINCT FROM OLD.skip_cashback_award THEN
      RAISE EXCEPTION 'forbidden: derived_money_fields';
    END IF;
    IF NEW.cashback_percent IS DISTINCT FROM OLD.cashback_percent
       AND NOT public.can_edit_finance(auth.uid()) THEN
      RAISE EXCEPTION 'forbidden: finance_fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- enroll_participant as in 058 (063's individual_price check removed)
CREATE OR REPLACE FUNCTION public.enroll_participant(
  p_event_id  uuid,
  p_tariff_id uuid,
  p_seller_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone     text DEFAULT NULL,
  p_price     numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_price       numeric(12,2);
  v_client      public.clients%ROWTYPE;
  v_phone       text;
  v_participant uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: staff_only';
  END IF;

  IF p_tariff_id IS NOT NULL THEN
    SELECT price INTO v_price
    FROM public.event_tariffs
    WHERE id = p_tariff_id AND event_id = p_event_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'tariff_mismatch';
    END IF;
  ELSE
    -- No tariff = "Individual kelishuv": allowed only when the event has none,
    -- and then the agreed price must be given.
    IF EXISTS (SELECT 1 FROM public.event_tariffs WHERE event_id = p_event_id) THEN
      RAISE EXCEPTION 'tariff_required';
    END IF;
    IF p_price IS NULL OR p_price < 0 THEN
      RAISE EXCEPTION 'price_required';
    END IF;
    v_price := p_price;
  END IF;

  -- Seller is optional ("Belgilanmagan"); when given it must be an active Sotuv employee.
  IF p_seller_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_seller_id AND department = 'sotuv' AND COALESCE(is_active, true)
  ) THEN
    RAISE EXCEPTION 'seller_invalid';
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'client_not_found';
    END IF;
  ELSE
    -- normalize_phone is best-effort (043 note): demand real digits, or junk
    -- like '-' would glue unrelated people onto one client.
    v_phone := public.normalize_phone(COALESCE(p_phone, ''));
    IF btrim(COALESCE(p_full_name, '')) = '' OR v_phone !~ '^\+?\d{9,15}$' THEN
      RAISE EXCEPTION 'client_required';
    END IF;

    SELECT * INTO v_client FROM public.clients WHERE phone = v_phone;
    IF FOUND THEN
      RAISE EXCEPTION 'client_exists:%:%', v_client.id, v_client.full_name;
    END IF;

    INSERT INTO public.clients (full_name, phone, status)
    VALUES (btrim(p_full_name), v_phone, 'Faol')
    RETURNING * INTO v_client;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_participants
    WHERE event_id = p_event_id AND contact_id = v_client.id
  ) THEN
    RAISE EXCEPTION 'already_enrolled';
  END IF;

  INSERT INTO public.event_participants (
    event_id, contact_id, full_name, phone, email, company, role, photo_url,
    price, paid, attended, tariff_id, seller_id
  ) VALUES (
    p_event_id, v_client.id, v_client.full_name, v_client.phone, v_client.email,
    v_client.company, v_client.role, v_client.image,
    v_price, 0, false, p_tariff_id, p_seller_id
  )
  RETURNING id INTO v_participant;

  RETURN v_participant;
END;
$$;

-- ─── 2. cashback inside a payment ───────────────────────────────────────────
-- New trailing parameter = new signature, so the old one is dropped (grants re-issued).
DROP FUNCTION IF EXISTS public.record_payment(uuid, numeric, text, timestamptz, uuid, text, text, uuid, uuid, numeric, date, text);

-- Body as in 053/058, plus the p_cashback part.
CREATE FUNCTION public.record_payment(
  p_event_id      uuid,
  p_amount        numeric,
  p_method        text,
  p_paid_at       timestamptz DEFAULT now(),
  p_client_id     uuid DEFAULT NULL,
  p_full_name     text DEFAULT NULL,
  p_phone         text DEFAULT NULL,
  p_tariff_id     uuid DEFAULT NULL,
  p_seller_id     uuid DEFAULT NULL,
  p_price         numeric DEFAULT NULL,
  p_next_due_date date DEFAULT NULL,
  p_note          text DEFAULT NULL,
  p_cashback      numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_participant uuid;
  v_client      uuid;
  v_price       numeric(12,2);
  v_paid        numeric(12,2);
  v_cashback    numeric(12,2) := COALESCE(p_cashback, 0);
  v_payment     uuid;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF v_cashback < 0 OR v_cashback > p_amount THEN
    RAISE EXCEPTION 'cashback_invalid_amount (requested=%)', v_cashback;
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT id INTO v_participant
    FROM public.event_participants
    WHERE event_id = p_event_id AND contact_id = p_client_id;
  END IF;

  IF v_participant IS NULL THEN
    -- enroll_participant validates tariff / price / seller (058)
    v_participant := public.enroll_participant(
      p_event_id, p_tariff_id, p_seller_id, p_client_id, p_full_name, p_phone, p_price);
    IF p_price IS NOT NULL THEN
      IF p_price < 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;
      UPDATE public.event_participants SET price = p_price WHERE id = v_participant;
    END IF;
  END IF;

  -- Lock the row: two cashiers paying the same debt at once can't overshoot it.
  SELECT price, paid, contact_id INTO v_price, v_paid, v_client
  FROM public.event_participants WHERE id = v_participant FOR UPDATE;
  IF p_amount > v_price - v_paid THEN
    RAISE EXCEPTION 'amount_exceeds_debt (debt=%)', GREATEST(v_price - v_paid, 0);
  END IF;

  -- Cashback part first (checks the balance, writes the 'used' row, raises paid)
  IF v_cashback > 0 THEN
    PERFORM public.spend_cashback(v_participant, v_client, p_event_id, v_cashback);
  END IF;

  IF p_amount - v_cashback > 0 THEN
    INSERT INTO public.payments (participant_id, amount, method, paid_at, recorded_by, note, kind)
    VALUES (v_participant, p_amount - v_cashback, p_method, COALESCE(p_paid_at, now()), auth.uid(),
            NULLIF(btrim(COALESCE(p_note, '')), ''), 'payment')
    RETURNING id INTO v_payment;
  END IF;

  -- The old due date is settled once fully paid; a partial payment without a new
  -- date given keeps the existing one instead of silently wiping it.
  UPDATE public.event_participants
  SET next_due_date = CASE WHEN price > paid THEN COALESCE(p_next_due_date, next_due_date) ELSE NULL END
  WHERE id = v_participant;

  RETURN v_payment;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, timestamptz, uuid, text, text, uuid, uuid, numeric, date, text, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, timestamptz, uuid, text, text, uuid, uuid, numeric, date, text, numeric) TO authenticated, service_role;

COMMIT;
