INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policies (narrow — no listing)
CREATE POLICY "Anyone can read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-avatars');

CREATE POLICY "Authenticated users can upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profile-avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'profile-avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete avatars"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'profile-avatars' AND auth.role() = 'authenticated');
