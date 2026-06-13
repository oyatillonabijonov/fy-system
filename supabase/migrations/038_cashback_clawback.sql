-- Migration 038: Cashback clawback on payment decrease and participant delete
-- Extends auto_award_cashback with DECREASE branch.
-- Adds trigger_clawback_on_participant_delete for participant DELETE.
-- EXISTING award logic is untouched — only new branches are added.

-- ─── ADD 'clawback' TO TYPE CONSTRAINT ───────────────────────────────────────

ALTER TABLE public.cashback_transactions
  DROP CONSTRAINT IF EXISTS cashback_transactions_type_check;

ALTER TABLE public.cashback_transactions
  ADD CONSTRAINT cashback_transactions_type_check
  CHECK (type IN ('earned', 'used', 'manual_add', 'manual_subtract', 'clawback'));

-- ─── EXTEND auto_award_cashback (BEFORE UPDATE) ───────────────────────────────
-- Adds: paid DECREASE → negative clawback transaction.
-- Original paid INCREASE logic is preserved unchanged.

CREATE OR REPLACE FUNCTION public.auto_award_cashback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  effective_percent  numeric(5,2);
  cashback_amount    numeric(12,2);
  new_paid           numeric(12,2);
  old_paid           numeric(12,2);
  clawback_amount    numeric(12,2);
  current_balance    numeric(12,2);
  actual_clawback    numeric(12,2);
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  -- Spend-cashback path: caller set the flag → reset it and skip award
  IF COALESCE(NEW.skip_cashback_award, false) THEN
    NEW.skip_cashback_award := false;
    RETURN NEW;
  END IF;

  new_paid := COALESCE(NEW.paid, 0);
  old_paid := COALESCE(OLD.paid, 0);

  -- ── NEW: paid DECREASE → clawback ──────────────────────────────────────────
  IF new_paid < old_paid THEN
    IF NEW.contact_id IS NULL OR COALESCE(NEW.cashback_earned, 0) <= 0 THEN
      RETURN NEW;
    END IF;

    IF NEW.cashback_percent IS NOT NULL THEN
      effective_percent := NEW.cashback_percent;
    ELSE
      SELECT cashback_percent INTO effective_percent
      FROM   public.events WHERE id = NEW.event_id;
    END IF;

    IF effective_percent IS NULL OR effective_percent <= 0 THEN RETURN NEW; END IF;

    clawback_amount := ROUND(((old_paid - new_paid) * effective_percent) / 100);
    IF clawback_amount <= 0 THEN RETURN NEW; END IF;

    -- Cap: never push balance below 0
    SELECT cashback_balance INTO current_balance
    FROM   public.clients WHERE id = NEW.contact_id;

    actual_clawback := LEAST(clawback_amount, GREATEST(COALESCE(current_balance, 0), 0));

    IF actual_clawback > 0 THEN
      INSERT INTO public.cashback_transactions(
        client_id, event_id, participant_id, type, amount, description, created_by
      ) VALUES (
        NEW.contact_id, NEW.event_id, NEW.id,
        'clawback', -actual_clawback,
        format('To''lov qaytarildi: -%s so''m (%s%% clawback)', actual_clawback, effective_percent),
        'system'
      );
    END IF;

    -- Reduce cashback_earned tracker (don't go negative)
    NEW.cashback_earned := GREATEST(COALESCE(NEW.cashback_earned, 0) - clawback_amount, 0);

    RETURN NEW;
  END IF;

  -- ── ORIGINAL: paid INCREASE → award ────────────────────────────────────────
  IF new_paid <= old_paid THEN RETURN NEW; END IF;

  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.cashback_percent IS NOT NULL THEN
    effective_percent := NEW.cashback_percent;
  ELSE
    SELECT cashback_percent INTO effective_percent
    FROM   public.events WHERE id = NEW.event_id;
  END IF;

  IF effective_percent IS NULL OR effective_percent <= 0 THEN
    RETURN NEW;
  END IF;

  cashback_amount := ROUND(((new_paid - old_paid) * effective_percent) / 100);

  IF cashback_amount <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.cashback_transactions(
    client_id, event_id, participant_id, type, amount, description, created_by
  ) VALUES (
    NEW.contact_id,
    NEW.event_id,
    NEW.id,
    'earned',
    cashback_amount,
    format('Avtomatik: %s%% cashback', effective_percent),
    'system'
  );

  NEW.cashback_earned := COALESCE(NEW.cashback_earned, 0) + cashback_amount;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_award_cashback() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auto_award_cashback() TO service_role;

-- Trigger unchanged (already BEFORE UPDATE WHEN paid changes)
DROP TRIGGER IF EXISTS trigger_auto_award_cashback ON public.event_participants;
CREATE TRIGGER trigger_auto_award_cashback
  BEFORE UPDATE ON public.event_participants
  FOR EACH ROW
  WHEN (OLD.paid IS DISTINCT FROM NEW.paid)
  EXECUTE FUNCTION public.auto_award_cashback();

-- ─── NEW: participant DELETE → full clawback ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.clawback_on_participant_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_balance numeric(12,2);
  actual_clawback numeric(12,2);
BEGIN
  IF OLD.contact_id IS NULL OR COALESCE(OLD.cashback_earned, 0) <= 0 THEN
    RETURN OLD;
  END IF;

  SELECT cashback_balance INTO current_balance
  FROM   public.clients WHERE id = OLD.contact_id;

  actual_clawback := LEAST(COALESCE(OLD.cashback_earned, 0), GREATEST(COALESCE(current_balance, 0), 0));

  IF actual_clawback > 0 THEN
    INSERT INTO public.cashback_transactions(
      client_id, event_id, participant_id, type, amount, description, created_by
    ) VALUES (
      OLD.contact_id, OLD.event_id, OLD.id,
      'clawback', -actual_clawback,
      format('Ishtirokchi o''chirildi: -%s so''m qaytarildi', actual_clawback),
      'system'
    );
  END IF;

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clawback_on_participant_delete() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.clawback_on_participant_delete() TO service_role;

DROP TRIGGER IF EXISTS trigger_clawback_on_participant_delete ON public.event_participants;
CREATE TRIGGER trigger_clawback_on_participant_delete
  BEFORE DELETE ON public.event_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.clawback_on_participant_delete();
