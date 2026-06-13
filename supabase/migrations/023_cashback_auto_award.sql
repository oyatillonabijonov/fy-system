-- Add flag to skip auto-award (used when paid increases due to cashback spend)
ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS skip_cashback_award bool DEFAULT false;

-- Function: award cashback automatically when participant pays
CREATE OR REPLACE FUNCTION public.auto_award_cashback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  effective_percent numeric(5,2);
  cashback_amount numeric(12,2);
  new_paid numeric(12,2);
  old_paid numeric(12,2);
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  -- Spend-cashback path: caller set the flag → reset it and skip award
  IF COALESCE(NEW.skip_cashback_award, false) THEN
    NEW.skip_cashback_award := false;
    RETURN NEW;
  END IF;

  new_paid := COALESCE(NEW.paid, 0);
  old_paid := COALESCE(OLD.paid, 0);

  -- Only act on payment increases
  IF new_paid <= old_paid THEN RETURN NEW; END IF;

  -- No linked client → cannot credit anyone
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;

  -- Resolve effective percent: participant override → event default
  IF NEW.cashback_percent IS NOT NULL THEN
    effective_percent := NEW.cashback_percent;
  ELSE
    SELECT cashback_percent INTO effective_percent
    FROM events WHERE id = NEW.event_id;
  END IF;

  IF effective_percent IS NULL OR effective_percent <= 0 THEN
    RETURN NEW;
  END IF;

  -- Award only on the new delta
  cashback_amount := ROUND(((new_paid - old_paid) * effective_percent) / 100);

  IF cashback_amount <= 0 THEN RETURN NEW; END IF;

  INSERT INTO cashback_transactions(
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

  -- Track on participant row (BEFORE UPDATE so we can mutate NEW directly)
  NEW.cashback_earned := COALESCE(NEW.cashback_earned, 0) + cashback_amount;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_award_cashback() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_award_cashback() TO service_role;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_award_cashback ON event_participants;

-- Attach BEFORE UPDATE trigger (so we can modify NEW.cashback_earned and NEW.skip_cashback_award)
CREATE TRIGGER trigger_auto_award_cashback
  BEFORE UPDATE ON event_participants
  FOR EACH ROW
  WHEN (OLD.paid IS DISTINCT FROM NEW.paid)
  EXECUTE FUNCTION public.auto_award_cashback();
