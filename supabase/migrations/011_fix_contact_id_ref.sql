-- Change contact_id reference from crm_contacts to clients
ALTER TABLE event_participants
  DROP CONSTRAINT IF EXISTS event_participants_contact_id_fkey;

ALTER TABLE event_participants
  ADD CONSTRAINT event_participants_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES clients(id) ON DELETE SET NULL;
