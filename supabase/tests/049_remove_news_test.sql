-- Behavioural test for migration 049 (news removal).
-- THROWAWAY DB only (recipe: CLAUDE.md §5 "Tests"). Run:
--   docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql

DO $$
BEGIN
  IF to_regclass('public.news_posts') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: public.news_posts hali mavjud';
  END IF;

  -- Nested IF, not AND: plpgsql plans the whole condition, so a reference to
  -- storage.buckets fails on stands without the storage schema.
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'news-images') THEN
      RAISE EXCEPTION 'FAIL: news-images bucket qatori hali mavjud';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname = 'news-images all') THEN
    RAISE EXCEPTION 'FAIL: "news-images all" policy hali mavjud';
  END IF;

  RAISE NOTICE 'PASS: 049 — yangiliklar to''liq olib tashlangan';
END $$;
