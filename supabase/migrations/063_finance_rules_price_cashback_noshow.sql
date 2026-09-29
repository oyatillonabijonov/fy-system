-- 063: four money rules (decided 2026-09-29).
--
-- 1. The event's cashback % (events.cashback_percent) is a money setting: changing
--    it — or creating an event with anything but the default 5 — needs the Moliya
--    edit right (can_edit_finance). Before, anyone with the Tadbirlar module could.
-- 2. "Individual kelishuv" (enrolment without a tariff, typed price) needs the
--    Moliya edit right; plain staff enrol only by tariff. A direct API INSERT into
--    event_participants (bypassing enroll_participant) is refused for non-editors,
--    otherwise the RPC check could be skipped with any price, 0 included.
-- 3. settle_no_show gives the client back the cashback they spent on this event
--    (a 'manual_add' ledger row on the participant; cashback_used → 0), instead of
--    counting it as money kept.
-- 4. A no-show's agreed price follows what's paid (recalc_participant_paid), so a
--    later refund / void never shows a phantom debt; void_payment's overpay check
--    doesn't apply to them for the same reason.

BEGIN;

-- ─── 1. event cashback % ────────────────────────────────────────────────────
-- SECURITY INVOKER: current_user is 'authenticated'/'anon' only for a direct API
-- write (same idea as 062).
CREATE OR REPLACE FUNCTION public.guard_event_cashback_percent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND ((TG_OP = 'INSERT' AND NEW.cashback_percent IS DISTINCT FROM 5)
          OR (TG_OP = 'UPDATE' AND NEW.cashback_percent IS DISTINCT FROM OLD.cashback_percent))
     AND NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_guard_event_cashback_percent ON public.events;
CREATE TRIGGER trigger_guard_event_cashback_percent
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.guard_event_cashback_percent();

-- ─── 2. individual price only for finance editors ───────────────────────────
-- 062's guard + a direct INSERT needs the Moliya edit right.
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
    IF NOT public.can_edit_finance(auth.uid()) THEN
      RAISE EXCEPTION 'forbidden: enroll_via_rpc';
    END IF;
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

-- Body as in 058; only the individual-price branch gains the finance check.
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
    -- only for finance editors (063), and then the agreed price must be given.
    IF EXISTS (SELECT 1 FROM public.event_tariffs WHERE event_id = p_event_id) THEN
      RAISE EXCEPTION 'tariff_required';
    END IF;
    IF NOT public.can_edit_finance(auth.uid()) THEN
      RAISE EXCEPTION 'forbidden: individual_price';
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

-- ─── 4. a no-show's price follows what's paid ───────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_participant_paid(p_participant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH v AS (
    SELECT COALESCE(
             (SELECT SUM(p.amount) FROM public.payments p
              WHERE p.participant_id = p_participant_id AND p.voided_at IS NULL),
             0) AS cash
  )
  UPDATE public.event_participants ep
  SET paid  = v.cash + COALESCE(ep.cashback_used, 0),
      -- No-show (061/063): nothing more is owed, so the deal is what's paid
      price = CASE WHEN ep.no_show_at IS NOT NULL THEN v.cash + COALESCE(ep.cashback_used, 0) ELSE ep.price END
  FROM v
  WHERE ep.id = p_participant_id;
$$;

-- Body as in 053; the refund-void overpay check skips no-shows (price follows paid).
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
  v_ns     timestamptz;
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
  SELECT price, paid, cashback_used, no_show_at INTO v_price, v_paid, v_used, v_ns
  FROM public.event_participants WHERE id = r.participant_id FOR UPDATE;

  IF r.kind = 'refund' THEN
    -- Voiding a refund puts the money back on the participant: never past the price.
    IF v_ns IS NULL AND v_paid - r.amount > v_price THEN
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

-- ─── 3 + 4. no-show settlement ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.settle_no_show(
  p_participant_id uuid,
  p_keep           numeric,
  p_method         text,
  p_note           text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      public.event_participants%ROWTYPE;
  v_cash   numeric(12,2);
  v_refund numeric(12,2);
  v_id     uuid;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;

  SELECT * INTO v_p FROM public.event_participants WHERE id = p_participant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'participant_not_found'; END IF;
  IF v_p.no_show_at IS NOT NULL THEN RAISE EXCEPTION 'already_no_show'; END IF;

  v_cash := COALESCE(v_p.paid, 0) - COALESCE(v_p.cashback_used, 0);
  IF p_keep IS NULL OR p_keep < 0 OR p_keep > v_cash THEN
    RAISE EXCEPTION 'invalid_keep (cash=%)', v_cash;
  END IF;
  v_refund := v_cash - p_keep;

  -- Mark first: from here recalc_participant_paid keeps price = paid (no debt)
  UPDATE public.event_participants
  SET no_show_at = now(), attended = false, next_due_date = NULL
  WHERE id = p_participant_id;

  IF v_refund > 0 THEN
    INSERT INTO public.payments (participant_id, amount, method, paid_at, recorded_by, note, kind)
    VALUES (p_participant_id, -v_refund, p_method, now(), auth.uid(),
            'Qatnashmadi' || COALESCE(': ' || NULLIF(btrim(p_note), ''), ''), 'refund')
    RETURNING id INTO v_id;
  END IF;

  -- Cashback they paid with goes back to their balance
  IF COALESCE(v_p.cashback_used, 0) > 0 AND v_p.contact_id IS NOT NULL THEN
    INSERT INTO public.cashback_transactions (client_id, event_id, participant_id, type, amount, description, created_by)
    VALUES (v_p.contact_id, v_p.event_id, p_participant_id, 'manual_add', v_p.cashback_used,
            'Qatnashmadi: ishlatilgan keshbek qaytarildi', 'system');
    UPDATE public.event_participants SET cashback_used = 0 WHERE id = p_participant_id;
  END IF;

  PERFORM public.recalc_participant_paid(p_participant_id);  -- paid = price = kept cash
  PERFORM public.settle_event_cashback(p_participant_id);
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.settle_no_show(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.settle_no_show(uuid, numeric, text, text) TO authenticated;

-- Existing no-shows (none on 2026-09-29): bring the price in line
UPDATE public.event_participants SET price = paid WHERE no_show_at IS NOT NULL AND price <> paid;

COMMIT;
