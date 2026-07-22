-- Restore storage bucket rows that were missing on the production DB.
-- The RLS policies from 013/016/021/025/029 were applied, but the matching
-- `storage.buckets` rows were not — so every upload failed with
-- "Bucket not found" and images never appeared. This backfills the rows.
-- Additive and idempotent (ON CONFLICT DO NOTHING) — never deletes or
-- overwrites existing buckets or objects.

INSERT INTO storage.buckets (id, name, public) VALUES
  ('event-covers', 'event-covers', true),
  ('client-images', 'client-images', true),
  ('news-images', 'news-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-avatars', 'profile-avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
