ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS department text,           -- bo'lim
  ADD COLUMN IF NOT EXISTS position text,             -- lavozim
  ADD COLUMN IF NOT EXISTS hire_date date,            -- ish boshlangan sana
  ADD COLUMN IF NOT EXISTS birth_date date,           -- tug'ilgan sana
  ADD COLUMN IF NOT EXISTS address text,              -- manzil
  ADD COLUMN IF NOT EXISTS bio text,                  -- haqida
  ADD COLUMN IF NOT EXISTS telegram text,             -- telegram username
  ADD COLUMN IF NOT EXISTS emergency_contact text,    -- favqulodda kontakt
  ADD COLUMN IF NOT EXISTS notes text;                -- admin yozuvlari

-- Index for department filtering
CREATE INDEX IF NOT EXISTS idx_profiles_department ON profiles(department) WHERE department IS NOT NULL;
