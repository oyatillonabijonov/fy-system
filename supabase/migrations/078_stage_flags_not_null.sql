-- Voronkas created in the web got NULL is_won/is_lost on every stage: a bulk insert with
-- uneven keys sends NULL (not the DEFAULT) for the missing ones. NOT NULL is NULL, so
-- intake_lead found no open stage and every site lead failed with "Bosqich bu voronkaga
-- tegishli emas". Backfill and forbid NULL.
UPDATE public.crm_stages SET is_won = COALESCE(is_won, false), is_lost = COALESCE(is_lost, false)
WHERE is_won IS NULL OR is_lost IS NULL;
ALTER TABLE public.crm_stages ALTER COLUMN is_won SET NOT NULL, ALTER COLUMN is_lost SET NOT NULL;
