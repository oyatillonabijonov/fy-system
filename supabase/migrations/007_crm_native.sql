-- ============================================
-- CRM-N (Native CRM) Tables
-- ============================================

-- Pipelines (voronkalar)
CREATE TABLE IF NOT EXISTS crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text DEFAULT '#141414',
  sort_order int DEFAULT 0,
  is_active bool DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Stages (bosqichlar)
CREATE TABLE IF NOT EXISTS crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT '#141414',
  sort_order int DEFAULT 0,
  is_won bool DEFAULT false,
  is_lost bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Contacts (kontaktlar)
CREATE TABLE IF NOT EXISTS crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  company text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Leads (lidlar)
CREATE TABLE IF NOT EXISTS crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pipeline_id uuid REFERENCES crm_pipelines(id),
  stage_id uuid REFERENCES crm_stages(id),
  contact_id uuid REFERENCES crm_contacts(id),
  responsible_user_id bigint REFERENCES amocrm_users(id),
  price bigint DEFAULT 0,
  source text DEFAULT 'manual',
  tags jsonb DEFAULT '[]',
  is_won bool DEFAULT false,
  is_lost bool DEFAULT false,
  loss_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Notes (izohlar)
CREATE TABLE IF NOT EXISTS crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES crm_leads(id) ON DELETE CASCADE,
  text text NOT NULL,
  created_by bigint,
  created_at timestamptz DEFAULT now()
);

-- Tasks (vazifalar)
CREATE TABLE IF NOT EXISTS crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES crm_leads(id) ON DELETE CASCADE,
  text text NOT NULL,
  due_date timestamptz,
  is_done bool DEFAULT false,
  created_by bigint,
  created_at timestamptz DEFAULT now()
);

-- RLS: allow all (auth later)
ALTER TABLE crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON crm_pipelines FOR ALL USING (true);
CREATE POLICY "Allow all" ON crm_stages FOR ALL USING (true);
CREATE POLICY "Allow all" ON crm_contacts FOR ALL USING (true);
CREATE POLICY "Allow all" ON crm_leads FOR ALL USING (true);
CREATE POLICY "Allow all" ON crm_notes FOR ALL USING (true);
CREATE POLICY "Allow all" ON crm_tasks FOR ALL USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE crm_leads;
ALTER PUBLICATION supabase_realtime ADD TABLE crm_stages;

-- Seed: default pipeline with stages
INSERT INTO crm_pipelines (id, name, color, sort_order)
VALUES ('00000000-0000-0000-0000-000000000001', 'Asosiy voronka', '#141414', 0);

INSERT INTO crm_stages (pipeline_id, name, color, sort_order, is_won, is_lost) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Yangi lid', '#3B82F6', 0, false, false),
  ('00000000-0000-0000-0000-000000000001', 'Saralandi', '#F59E0B', 1, false, false),
  ('00000000-0000-0000-0000-000000000001', 'Qo''ng''iroq qilindi', '#8B5CF6', 2, false, false),
  ('00000000-0000-0000-0000-000000000001', 'Uchrashuv', '#EC4899', 3, false, false),
  ('00000000-0000-0000-0000-000000000001', 'Taklif yuborildi', '#06B6D4', 4, false, false),
  ('00000000-0000-0000-0000-000000000001', 'Yutildi', '#10B981', 5, true, false),
  ('00000000-0000-0000-0000-000000000001', 'Yutqazildi', '#EF4444', 6, false, true);
