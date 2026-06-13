-- ============================================
-- NEWS: club news feed (read in mobile app, authored in dashboard)
-- ============================================

CREATE TABLE IF NOT EXISTS news_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  image_url text,
  is_published bool NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_posts_published
  ON news_posts (published_at DESC) WHERE is_published;

CREATE TRIGGER news_posts_updated_at
  BEFORE UPDATE ON news_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE news_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news select" ON news_posts
  FOR SELECT USING (
    is_staff(auth.uid())
    OR (auth.role() = 'authenticated' AND is_published)
  );

CREATE POLICY "news insert staff" ON news_posts
  FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "news update staff" ON news_posts
  FOR UPDATE USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "news delete staff" ON news_posts
  FOR DELETE USING (is_staff(auth.uid()));

-- ── news-images bucket (same pattern as event-covers + 025 upsert fix) ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('news-images', 'news-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "news-images all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'news-images')
  WITH CHECK (bucket_id = 'news-images');
