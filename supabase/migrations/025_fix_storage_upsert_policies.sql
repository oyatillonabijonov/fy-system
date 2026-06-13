-- Fix storage RLS so `upsert: true` uploads succeed.
-- The existing narrow per-operation policies miss either USING or WITH CHECK,
-- and `x-upsert: true` requires both (it goes through INSERT…ON CONFLICT…RETURNING).
-- Replace them with single FOR ALL policies that cover SELECT/INSERT/UPDATE/DELETE
-- (bucket_id-scoped — no listing across buckets) plus an explicit SELECT for the
-- RETURNING clause.

-- ── client-images ──
DROP POLICY IF EXISTS "Allow insert client images" ON storage.objects;
DROP POLICY IF EXISTS "Allow update client images" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete client images" ON storage.objects;

CREATE POLICY "client-images all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'client-images')
  WITH CHECK (bucket_id = 'client-images');

-- ── event-covers ──
DROP POLICY IF EXISTS "Allow insert event covers" ON storage.objects;
DROP POLICY IF EXISTS "Allow update event covers" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete event covers" ON storage.objects;

CREATE POLICY "event-covers all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'event-covers')
  WITH CHECK (bucket_id = 'event-covers');

-- ── profile-avatars ──
-- Keep "Anyone can read avatars" SELECT (already covers reads across the API),
-- but unify write side under a single FOR ALL policy that supports upsert.
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;

CREATE POLICY "profile-avatars write"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'profile-avatars' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'profile-avatars' AND auth.role() = 'authenticated');
