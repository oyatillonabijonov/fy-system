ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;
