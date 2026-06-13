-- Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  avatar_url text,
  role text NOT NULL DEFAULT 'xodim' CHECK (role IN ('admin', 'manager', 'xodim')),
  is_active bool DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Module permissions
CREATE TABLE IF NOT EXISTS user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN (
    'dashboard',
    'sotuv-amocrm',
    'sotuv-crmn',
    'mijozlar',
    'tadbirlar',
    'pbx',
    'sozlamalar'
  )),
  can_view bool DEFAULT true,
  can_edit bool DEFAULT false,
  can_delete bool DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_permissions_user ON user_permissions(user_id);

-- Auto-create profile when user signs up (trigger)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'xodim')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Helper function: check if user has permission
CREATE OR REPLACE FUNCTION has_permission(p_user_id uuid, p_module text)
RETURNS bool AS $$
DECLARE
  user_role text;
  has_perm bool;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = p_user_id;

  -- Admin has access to everything
  IF user_role = 'admin' THEN RETURN true; END IF;

  -- Check explicit permission
  SELECT can_view INTO has_perm
  FROM user_permissions
  WHERE user_id = p_user_id AND module = p_module;

  RETURN COALESCE(has_perm, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper to check admin status WITHOUT triggering RLS recursion (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION is_admin(p_user_id uuid)
RETURNS bool AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND role = 'admin')
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Users can read all profiles, only admins can edit
CREATE POLICY "Anyone can view profiles" ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage profiles" ON profiles
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Permissions: only admins manage, users can view their own
CREATE POLICY "Users view own permissions" ON user_permissions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins manage all permissions" ON user_permissions
  FOR ALL USING (is_admin(auth.uid()));

-- Create first admin manually after signup
-- Run after first user registers:
-- UPDATE profiles SET role = 'admin' WHERE email = 'sizning_email@example.com';
