-- 061: "Qatnashmadi" (no-show) settlement + cashback only after the event.
--
-- 1. Cashback is no longer credited when money comes in. settle_event_cashback()
--    reconciles every participant to a target:
--        target = round(cash paid × percent / 100)  when the event is over
--                                                    (the day after COALESCE(end_date, date),
--                                                    Tashkent) and the participant isn't a no-show
--        target = 0                                  otherwise
--    and writes the difference to the ledger ('earned' up, 'clawback' down — never
--    below the client's balance). Idempotent; the amo-sync worker runs it every pass
--    (~10 min), so cashback appears the day after an event and follows later
--    payments / refunds. Cash = paid − cashback_used (cashback spent earns nothing,
--    as before). auto_award_cashback() keeps only its job of resetting the
--    skip_cashback_award flag that spend_cashback sets.
--    On 2026-09-28 no ended event had cash paid, so switching rules awarded or
--    took back nothing.
-- 2. settle_no_show(participant, keep, method, note): the client didn't come; keep
--    `keep` of the cash they paid, refund the rest, and in the same transaction set
--    the agreed price to what's kept (+ any cashback they spent), so no phantom debt
--    is left. Marks event_participants.no_show_at; their cashback goes to 0.

BEGIN;

ALTER TABLE public.event_participants ADD COLUMN IF NOT EXISTS no_show_at timestamptz;

-- ─── 1. awarding moves out of the payment trigger ───────────────────────────
CREATE OR REPLACE FUNCTION public.auto_award_cashback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- spend_cashback sets this so its paid increase isn't treated as a payment;
  -- reset it. Awards/clawbacks now come from settle_event_cashback() (061).
  IF COALESCE(NEW.skip_cashback_award, false) THEN
    NEW.skip_cashback_award := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_event_cashback(p_participant uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r        record;
  v_target numeric(12,2);
  v_bal    numeric(12,2);
  v_take   numeric(12,2);
  n        int := 0;
BEGIN
  FOR r IN
    SELECT ep.id, ep.contact_id, ep.event_id, COALESCE(ep.cashback_earned, 0) AS earned,
           ep.no_show_at,
           GREATEST(COALESCE(ep.paid, 0) - COALESCE(ep.cashback_used, 0), 0) AS cash,
           COALESCE(ep.cashback_percent, e.cashback_percent, 0) AS pct,
           (COALESCE(e.end_date, e.date) AT TIME ZONE 'Asia/Tashkent')::date
             < (now() AT TIME ZONE 'Asia/Tashkent')::date AS ended
    FROM public.event_participants ep
    JOIN public.events e ON e.id = ep.event_id
    WHERE ep.contact_id IS NOT NULL
      AND (p_participant IS NULL OR ep.id = p_participant)
    FOR UPDATE OF ep
  LOOP
    v_target := CASE WHEN r.ended AND r.no_show_at IS NULL AND r.pct > 0
                     THEN ROUND(r.cash * r.pct / 100) ELSE 0 END;

    IF v_target > r.earned THEN
      INSERT INTO public.cashback_transactions (client_id, event_id, participant_id, type, amount, description, created_by)
      VALUES (r.contact_id, r.event_id, r.id, 'earned', v_target - r.earned,
              format('Tadbirdan so''ng: %s%% keshbek', r.pct), 'system');
      UPDATE public.event_participants SET cashback_earned = v_target WHERE id = r.id;
      n := n + 1;
    ELSIF v_target < r.earned THEN
      SELECT cashback_balance INTO v_bal FROM public.clients WHERE id = r.contact_id FOR UPDATE;
      v_take := LEAST(r.earned - v_target, GREATEST(COALESCE(v_bal, 0), 0));
      IF v_take > 0 THEN
        INSERT INTO public.cashback_transactions (client_id, event_id, participant_id, type, amount, description, created_by)
        VALUES (r.contact_id, r.event_id, r.id, 'clawback', -v_take,
                CASE WHEN r.no_show_at IS NOT NULL THEN 'Qatnashmadi: keshbek olib tashlandi'
                     ELSE 'To''lov kamaydi: keshbek tuzatildi' END, 'system');
        -- Only what was actually recovered, so cashback_earned = sum of this participant's ledger
        UPDATE public.event_participants SET cashback_earned = r.earned - v_take WHERE id = r.id;
        n := n + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.settle_event_cashback(uuid) FROM PUBLIC, anon, authenticated;

-- ─── 2. no-show settlement ──────────────────────────────────────────────────
-- p_keep = cash kept (0 … cash paid); the rest of the cash is refunded.
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

  -- Refund first (the payments trigger lowers paid), then the price can drop to it.
  IF v_refund > 0 THEN
    INSERT INTO public.payments (participant_id, amount, method, paid_at, recorded_by, note, kind)
    VALUES (p_participant_id, -v_refund, p_method, now(), auth.uid(),
            'Qatnashmadi' || COALESCE(': ' || NULLIF(btrim(p_note), ''), ''), 'refund')
    RETURNING id INTO v_id;
  END IF;

  UPDATE public.event_participants
  SET price         = p_keep + COALESCE(cashback_used, 0),
      no_show_at    = now(),
      attended      = false,
      next_due_date = NULL
  WHERE id = p_participant_id;

  PERFORM public.settle_event_cashback(p_participant_id);
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.settle_no_show(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.settle_no_show(uuid, numeric, text, text) TO authenticated;

-- Bring every participant to the new rule now
SELECT public.settle_event_cashback();

COMMIT;
