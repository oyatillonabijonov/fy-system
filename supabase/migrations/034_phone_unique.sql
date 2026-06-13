-- Add UNIQUE constraint on clients.phone (partial: NULL phones are excluded)
CREATE UNIQUE INDEX IF NOT EXISTS clients_phone_unique
  ON clients (phone)
  WHERE phone IS NOT NULL;
