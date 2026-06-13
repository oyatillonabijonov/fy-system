-- payments table: each cash payment installment for an event participant.
-- event_participants.paid is kept in sync via trigger (paid = SUM(payments) + cashback_used).

-- ─── TABLE ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid         NOT NULL REFERENCES event_participants(id) ON DELETE CASCADE,
  amount        numeric(12,2) NOT NULL CHECK (amount <> 0),
  method        text          NOT NULL CHECK (method IN ('naqd', 'karta', 'transfer')),
  paid_at       timestamptz   NOT NULL DEFAULT now(),
  recorded_by   uuid,          -- auth.uid() of the staff who recorded it
  note          text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_participant ON payments (participant_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at    ON payments (paid_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Staff: full access
CREATE POLICY "payments select staff"
  ON payments FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "payments insert staff"
  ON payments FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "payments update staff"
  ON payments FOR UPDATE USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "payments delete staff"
  ON payments FOR DELETE USING (is_staff(auth.uid()));

-- Members: see their own payments (via contact_id → clients → auth_user_id)
CREATE POLICY "payments select own"
  ON payments FOR SELECT
  USING (
    participant_id IN (
      SELECT ep.id FROM event_participants ep
      WHERE ep.contact_id = my_client_id()
    )
  );

-- ─── SYNC TRIGGER ────────────────────────────────────────────────────────────
-- Recalculate event_participants.paid after any payment INSERT, UPDATE, or DELETE.
-- paid = SUM(cash payments) + cashback_used
-- This keeps the existing cashback trigger (which fires on paid changes) intact.

CREATE OR REPLACE FUNCTION public.sync_participant_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pid uuid;
BEGIN
  v_pid := COALESCE(NEW.participant_id, OLD.participant_id);

  UPDATE event_participants
  SET paid = COALESCE(
        (SELECT SUM(p.amount) FROM payments p WHERE p.participant_id = v_pid),
        0
      ) + COALESCE(cashback_used, 0)
  WHERE id = v_pid;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_participant_paid() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sync_participant_paid() TO service_role;

CREATE TRIGGER trigger_sync_participant_paid
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_participant_paid();

-- ─── SPEND_CASHBACK RPC ───────────────────────────────────────────────────────
-- Atomic cashback spend: locks client, checks balance, records transaction,
-- updates cashback_used and paid in a single DB transaction.
-- Replaces the two-step client-side flow in cashback.ts.

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
BEGIN
  -- Lock client row to prevent concurrent overspend
  SELECT cashback_balance INTO v_balance
  FROM clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'cashback_insufficient (balance=%, requested=%)',
      COALESCE(v_balance, 0), p_amount;
  END IF;

  -- Record the spend (trigger_update_cashback_balance decrements balance)
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

-- ─── BACKFILL ─────────────────────────────────────────────────────────────────
-- For each participant with paid > 0, create one historical payment record.
-- We write directly to the table (bypassing the trigger by using a session flag)
-- so paid stays the same and cashback is NOT double-awarded.
--
-- Strategy: temporarily disable the sync trigger, insert payments, re-enable.
-- paid is already correct; after re-enable the trigger will fire on next INSERT.

ALTER TABLE payments DISABLE TRIGGER trigger_sync_participant_paid;

INSERT INTO payments (participant_id, amount, method, paid_at, recorded_by, note)
SELECT
  ep.id,
  ep.paid,
  'naqd',
  ep.created_at,
  NULL,
  'backfill: pre-payments migration'
FROM event_participants ep
WHERE ep.paid > 0;

ALTER TABLE payments ENABLE TRIGGER trigger_sync_participant_paid;
