-- 1. Default cashback per event
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS cashback_percent numeric(5,2) DEFAULT 5.00;

-- 2. Per-participant cashback override + tracking
ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS cashback_percent numeric(5,2),  -- null = use event default
  ADD COLUMN IF NOT EXISTS cashback_earned numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashback_used numeric(12,2) DEFAULT 0;

-- 3. Client cashback balance
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS cashback_balance numeric(12,2) DEFAULT 0;

-- 4. Transaction history
CREATE TABLE IF NOT EXISTS cashback_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  participant_id uuid REFERENCES event_participants(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('earned', 'used', 'manual_add', 'manual_subtract')),
  amount numeric(12,2) NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  created_by text  -- admin/system
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_cashback_client ON cashback_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_cashback_event ON cashback_transactions(event_id);

-- RLS
ALTER TABLE cashback_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON cashback_transactions FOR ALL USING (true);

-- Function: update client balance after transaction
CREATE OR REPLACE FUNCTION update_client_cashback_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.type IN ('earned', 'manual_add') THEN
      UPDATE clients
      SET cashback_balance = cashback_balance + NEW.amount,
          updated_at = now()
      WHERE id = NEW.client_id;
    ELSIF NEW.type IN ('used', 'manual_subtract') THEN
      UPDATE clients
      SET cashback_balance = cashback_balance - NEW.amount,
          updated_at = now()
      WHERE id = NEW.client_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cashback_balance
  AFTER INSERT ON cashback_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_client_cashback_balance();
