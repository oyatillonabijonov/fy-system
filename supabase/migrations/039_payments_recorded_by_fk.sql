-- Migration 039: Add FK payments.recorded_by → profiles(id) ON DELETE SET NULL
-- Clears orphaned recorded_by values first so the FK can be added safely.

-- 1) Nullify recorded_by rows that don't exist in profiles (they are auth user UUIDs
--    stored as text — cast to uuid for comparison)
UPDATE public.payments
SET    recorded_by = NULL
WHERE  recorded_by IS NOT NULL
  AND  recorded_by::uuid NOT IN (SELECT id FROM public.profiles);

-- 2) Cast column to uuid (it may already be text; this is idempotent via IF NOT EXISTS)
--    If the column is already uuid this will fail gracefully — alter type only if needed.
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'payments'
        AND column_name  = 'recorded_by') = 'text' THEN
    ALTER TABLE public.payments
      ALTER COLUMN recorded_by TYPE uuid USING recorded_by::uuid;
  END IF;
END;
$$;

-- 3) Add the FK constraint
ALTER TABLE public.payments
  ADD CONSTRAINT payments_recorded_by_fkey
  FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
