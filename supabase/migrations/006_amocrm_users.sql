CREATE TABLE IF NOT EXISTS amocrm_users (
  id bigint PRIMARY KEY,
  name text,
  email text,
  synced_at timestamptz DEFAULT now()
);

ALTER TABLE amocrm_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON amocrm_users FOR ALL USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE amocrm_users;
