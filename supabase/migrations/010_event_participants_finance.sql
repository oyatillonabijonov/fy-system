-- Add contact linking and financial tracking to event_participants
ALTER TABLE event_participants
  ADD COLUMN contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  ADD COLUMN price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN attended BOOLEAN NOT NULL DEFAULT false;

-- Index for contact lookups
CREATE INDEX idx_event_participants_contact ON event_participants(contact_id);
