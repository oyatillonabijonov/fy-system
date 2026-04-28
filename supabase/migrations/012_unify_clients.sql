-- Add missing fields to clients table
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS revenue text;

-- Add missing fields to event_participants
ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS activity text,
  ADD COLUMN IF NOT EXISTS status text;
