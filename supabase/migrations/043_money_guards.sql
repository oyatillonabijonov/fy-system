-- Migration 043: Money-flow guards (financial audit fixes)
--
-- Closes the holes found by the money-math audit. Data repair for the 035
-- backfill double-count is deliberately NOT here — it belongs in a separate,
-- backed-up migration once these guards are live.
--
-- Fixes, in order:
--   1. Balance is recomputed from the ledger (was INSERT-only → UPDATE/DELETE desynced it)
--   2. paid is recomputed for BOTH participants when a payment is re-pointed
--   3. spend_cashback: reject amount <= 0, require staff, cap at the participant's debt
--   4. auto_award_cashback: cap clawback by cashback_earned, decrement by what was recovered
--   5. Participant delete: refund cashback_used (was silently burned)
--   6. close_crm_lead_won: require staff, reject non-+998 phones as an identity
--   7. crm_* tables: replace 007's "Allow all" RLS with staff-only
--   8. Reset stranded skip_cashback_award flags

-- ─── 1. CASHBACK BALANCE: recompute from the ledger ──────────────────────────
-- The ledger (cashback_transactions) is the source of truth — migration 040 says
-- so and repairs drift with exactly this sum. Recomputing on every row change
-- (instead of applying a per-type delta on INSERT only) makes the materialized
-- clients.cashback_balance correct for UPDATE and DELETE too, which staff RLS
-- (028) explicitly allows.

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
            WHEN t.type IN ('earned', 'manual_add')    THEN  t.amount
            WHEN t.type IN ('used', 'manual_subtract') THEN -t.amount
            WHEN t.type = 'clawback'                   THEN  t.amount  -- stored negative
            ELSE 0
          END
        )
        FROM public.cashback_transactions t
        WHERE t.client_id = p_client_id
      ), 0)),
      updated_at = now()
  WHERE c.id = p_client_id;
$$;

REVOKE EXECUTE ON FUNCTION public.recalc_client_cashback_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.recalc_client_cashback_balance(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.update_client_cashback_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recalc_client_cashback_balance(NEW.client_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.client_id IS DISTINCT FROM NEW.client_id THEN
      PERFORM public.recalc_client_cashback_balance(OLD.client_id);
    END IF;
    PERFORM public.recalc_client_cashback_balance(NEW.client_id);
    RETURN NEW;
  ELSE
    PERFORM public.recalc_client_cashback_balance(OLD.client_id);
    RETURN OLD;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_client_cashback_balance() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_client_cashback_balance() TO service_role;

DROP TRIGGER IF EXISTS trigger_update_cashback_balance ON public.cashback_transactions;
CREATE TRIGGER trigger_update_cashback_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.cashback_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_cashback_balance();

-- ─── 2. PARTICIPANT paid: recompute both sides on re-point ───────────────────
-- 035 resolved v_pid to NEW.participant_id on UPDATE, so moving a payment from
-- participant A to B left A.paid inflated with no backing payment rows.

CREATE OR REPLACE FUNCTION public.recalc_participant_paid(p_participant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.event_participants ep
  SET paid = COALESCE(
        (SELECT SUM(p.amount) FROM public.payments p WHERE p.participant_id = p_participant_id),
        0
      ) + COALESCE(ep.cashback_used, 0)
  WHERE ep.id = p_participant_id;
$$;

REVOKE EXECUTE ON FUNCTION public.recalc_participant_paid(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.recalc_participant_paid(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_participant_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_participant_paid(OLD.participant_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.participant_id IS DISTINCT FROM NEW.participant_id THEN
      PERFORM public.recalc_participant_paid(OLD.participant_id);
    END IF;
  END IF;

  PERFORM public.recalc_participant_paid(NEW.participant_id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_participant_paid() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sync_participant_paid() TO service_role;

-- ─── 3. spend_cashback: amount, caller and debt guards ───────────────────────
-- Was: `IF v_balance IS NULL OR v_balance < p_amount` — the ONLY check, which
-- passes for any p_amount <= 0. A negative amount minted balance (the 'used'
-- row's negative amount raised it); a zero amount left paid unchanged, so the
-- BEFORE UPDATE trigger never fired to reset skip_cashback_award and the flag
-- stranded, cancelling the next genuine award. The RPC is reachable by any
-- authenticated caller (members included) with free p_client_id/p_participant_id,
-- so every guard must live here, not in the UI.

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
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: cashback_spend_staff_only';
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

-- ─── 4. auto_award_cashback: cap the clawback by what was actually earned ────
-- Identical to 038 except the two clawback lines:
--   * cap by NEW.cashback_earned (038 capped by the client's balance only, so a
--     percent raised after the award clawed back cashback earned on OTHER events)
--   * decrement cashback_earned by actual_clawback, not the uncapped amount, so
--     the tracker keeps matching this participant's ledger entries
--
-- ponytail: cashback already spent before a refund stays unrecovered (balance
-- floors at 0) — recovering it needs a negative-balance/debt policy, which is a
-- business decision, not a trigger fix.

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

  -- ── paid DECREASE → clawback ───────────────────────────────────────────────
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

    SELECT cashback_balance INTO current_balance
    FROM   public.clients WHERE id = NEW.contact_id;

    -- Cap: never claw back more than this participant earned, and never push
    -- the client's balance below 0.
    actual_clawback := LEAST(
      clawback_amount,
      COALESCE(NEW.cashback_earned, 0),
      GREATEST(COALESCE(current_balance, 0), 0)
    );

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

    -- Track only what was actually recovered, so cashback_earned stays equal to
    -- the sum of this participant's ledger entries.
    NEW.cashback_earned := GREATEST(COALESCE(NEW.cashback_earned, 0) - actual_clawback, 0);

    RETURN NEW;
  END IF;

  -- ── paid INCREASE → award ──────────────────────────────────────────────────
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

-- ─── 5. Participant delete: refund cashback_used ─────────────────────────────
-- 038 clawed back cashback_earned but never returned cashback_used, so a client
-- who paid with cashback for an enrollment that is later deleted lost it.
-- Refund first, then claw back — the refund is part of the balance the clawback
-- may draw from.

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
  IF OLD.contact_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Return cashback the client paid with
  IF COALESCE(OLD.cashback_used, 0) > 0 THEN
    INSERT INTO public.cashback_transactions(
      client_id, event_id, participant_id, type, amount, description, created_by
    ) VALUES (
      OLD.contact_id, OLD.event_id, OLD.id,
      'manual_add', OLD.cashback_used,
      format('Ishtirokchi o''chirildi: %s so''m ishlatilgan cashback qaytarildi', OLD.cashback_used),
      'system'
    );
  END IF;

  -- Take back cashback this participation earned
  IF COALESCE(OLD.cashback_earned, 0) > 0 THEN
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
  END IF;

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clawback_on_participant_delete() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.clawback_on_participant_delete() TO service_role;

-- ─── 6. close_crm_lead_won: staff only, real phones only ─────────────────────
-- Was GRANTed to every authenticated caller with no is_staff check, so a club
-- member could mark any lead won (inflating KPI revenue) and spawn clients.
-- normalize_phone is best-effort: it returns '' for '-' / 'yo''q' and passes any
-- junk through, and '' IS NOT NULL, so contacts with no real number were glued
-- onto one shared client — later payments and cashback then land on a stranger.

CREATE OR REPLACE FUNCTION public.close_crm_lead_won(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_id  uuid;
  v_phone       text;
  v_name        text;
  v_client_id   uuid;
  v_created     bool := false;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: close_lead_staff_only';
  END IF;

  -- Fetch lead's contact info (lead must exist)
  SELECT l.contact_id, c.phone, c.name
  INTO   v_contact_id, v_phone, v_name
  FROM   public.crm_leads l
  LEFT JOIN public.crm_contacts c ON c.id = l.contact_id
  WHERE  l.id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead topilmadi: %', p_lead_id;
  END IF;

  -- Mark lead won
  UPDATE public.crm_leads
  SET    is_won = true, is_lost = false, updated_at = now()
  WHERE  id = p_lead_id;

  -- Link client only when a contact exists
  IF v_contact_id IS NOT NULL THEN
    v_phone := public.normalize_phone(v_phone);

    -- Only a full +998XXXXXXXXX number identifies a person; anything else
    -- (empty, partial, junk) must NOT be used to match or create a client.
    IF v_phone IS NULL OR v_phone !~ '^\+998\d{9}$' THEN
      v_phone := NULL;
    END IF;

    -- 1) Try to find existing client by normalized phone
    IF v_phone IS NOT NULL THEN
      SELECT id INTO v_client_id
      FROM   public.clients
      WHERE  phone = v_phone
      LIMIT  1;
    END IF;

    -- 2) If no match → create (phone stays NULL when there is no real number)
    IF v_client_id IS NULL THEN
      INSERT INTO public.clients (full_name, phone, source, status)
      VALUES (v_name, v_phone, 'crm', 'Faol')
      RETURNING id INTO v_client_id;
      v_created := true;
    END IF;

    -- 3) Link contact → client
    UPDATE public.crm_contacts
    SET    client_id = v_client_id, updated_at = now()
    WHERE  id = v_contact_id;
  END IF;

  RETURN jsonb_build_object('client_id', v_client_id, 'created', v_created);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_crm_lead_won(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.close_crm_lead_won(uuid) TO authenticated;

-- ─── 7. CRM RLS: staff only ──────────────────────────────────────────────────
-- 007 shipped "Allow all USING (true)" back when every authenticated user was
-- staff. 026/028 gave club members auth accounts but left these policies alone,
-- so any member could write crm_leads.price / is_won directly.
-- Webhooks and SECURITY DEFINER RPCs use service_role / definer rights and are
-- unaffected; all CRM UI is staff-only already.

DROP POLICY IF EXISTS "Allow all" ON public.crm_pipelines;
DROP POLICY IF EXISTS "Allow all" ON public.crm_stages;
DROP POLICY IF EXISTS "Allow all" ON public.crm_contacts;
DROP POLICY IF EXISTS "Allow all" ON public.crm_leads;
DROP POLICY IF EXISTS "Allow all" ON public.crm_notes;
DROP POLICY IF EXISTS "Allow all" ON public.crm_tasks;

-- Re-runnable: this file is applied by hand on production (see CLAUDE.md), so a
-- retry after a partial failure must not trip over policies it already created.
DROP POLICY IF EXISTS "crm_pipelines staff" ON public.crm_pipelines;
DROP POLICY IF EXISTS "crm_stages staff"    ON public.crm_stages;
DROP POLICY IF EXISTS "crm_contacts staff"  ON public.crm_contacts;
DROP POLICY IF EXISTS "crm_leads staff"     ON public.crm_leads;
DROP POLICY IF EXISTS "crm_notes staff"     ON public.crm_notes;
DROP POLICY IF EXISTS "crm_tasks staff"     ON public.crm_tasks;

CREATE POLICY "crm_pipelines staff" ON public.crm_pipelines
  FOR ALL USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "crm_stages staff" ON public.crm_stages
  FOR ALL USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "crm_contacts staff" ON public.crm_contacts
  FOR ALL USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "crm_leads staff" ON public.crm_leads
  FOR ALL USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "crm_notes staff" ON public.crm_notes
  FOR ALL USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "crm_tasks staff" ON public.crm_tasks
  FOR ALL USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ─── 8. Reset stranded skip_cashback_award flags ─────────────────────────────
-- The flag is set and cleared inside one statement (spend_cashback's UPDATE →
-- BEFORE UPDATE trigger), so at rest it is always false. Any row still holding
-- true was stranded by a zero-amount spend and would swallow the next award.

UPDATE public.event_participants
SET    skip_cashback_award = false
WHERE  skip_cashback_award = true;
