-- 051: remove the news feature (web page + mobile tab removed in the same release).
-- ⚠️ Apply to production ONLY after the mobile build without the News tab is
-- live — older installed builds still query news_posts.
-- Image files stay on the storage container's disk (/var/lib/storage/stub/news-images/);
-- delete them by hand if wanted.

BEGIN;

DROP TABLE IF EXISTS public.news_posts;

-- storage.* is absent on the throwaway test stand, so guard it.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    -- Newer storage images block direct DELETE unless this is set; a no-op
    -- custom GUC where no such trigger exists.
    PERFORM set_config('storage.allow_delete_query', 'true', true);
    DROP POLICY IF EXISTS "news-images all" ON storage.objects;
    DELETE FROM storage.objects WHERE bucket_id = 'news-images';
    DELETE FROM storage.buckets WHERE id = 'news-images';
  END IF;
END $$;

COMMIT;
