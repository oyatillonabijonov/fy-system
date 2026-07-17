-- Migration 044: Remove the AmoCRM integration
--
-- The integration was already dormant: the sync cron job was not scheduled, every
-- amocrm_users.email was empty (so KPI revenue always resolved to 0), and 11 of
-- 12 crm_leads had no responsible user. CRM-N is the only sales pipeline now.
--
-- The amocrm_* tables were a one-way CACHE of AmoCRM (populated by GET requests).
-- Dropping them touches only our copy — AmoCRM's own data is unaffected, and the
-- code that could write to AmoCRM (PATCH via src/lib/amocrm/mutations.ts) is
-- deleted in this same change.
--
-- Order matters: unschedule → re-point crm_leads → rewrite KPI → drop tables.

-- ─── 1. Unschedule the sync cron job ─────────────────────────────────────────
-- Defined in 004. Not present on production today, so this is a no-op there —
-- but a DB rebuilt from migrations would otherwise keep calling a dead function.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    EXECUTE $q$ SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'amocrm-sync-every-3-min' $q$;
  END IF;
END $$;

-- ─── 2. crm_leads.responsible_user_id: amocrm_users(bigint) → profiles(uuid) ──
-- The native CRM's owner column pointed at the AmoCRM user cache. It becomes a
-- real staff reference.
--
-- Data note: the old values are AmoCRM user ids and cannot be mapped to staff
-- (those users had no email to match a profile by), so they are dropped. On
-- production this affects exactly ONE lead — the other 11 were already NULL.

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_responsible_user_id_fkey;

ALTER TABLE public.crm_leads
  ALTER COLUMN responsible_user_id TYPE uuid USING NULL::uuid;

ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_responsible_user_id_fkey
  FOREIGN KEY (responsible_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 3. KPI: count crm_leads only, keyed by the staff profile directly ───────
-- Was: profiles.email → amocrm_users.id → SUM over amocrm_leads + crm_leads.
-- That hop never resolved (emails were never synced), so revenue_actual was
-- always 0 for everyone. Now the profile id IS the owner key.
--
-- Deliberately unchanged from 022: the UTC month boundary (business runs in
-- Asia/Tashkent) and the use of updated_at instead of a close date. Both are
-- known defects, but fixing them here would silently move revenue between
-- months inside a migration whose job is removing AmoCRM.

CREATE OR REPLACE FUNCTION public.calculate_employee_kpi_actual(
  p_user_id uuid,
  p_year int,
  p_month int
)
RETURNS TABLE(
  revenue_actual numeric,
  leads_closed int,
  events_managed int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  period_start timestamptz;
  period_end timestamptz;
BEGIN
  period_start := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'UTC');
  period_end := period_start + INTERVAL '1 month';

  SELECT
    COALESCE((
      SELECT SUM(price)
      FROM crm_leads
      WHERE responsible_user_id = p_user_id
        AND is_won = true
        AND updated_at >= period_start
        AND updated_at < period_end
    ), 0),

    COALESCE((
      SELECT COUNT(*)::int
      FROM crm_leads
      WHERE responsible_user_id = p_user_id
        AND is_won = true
        AND updated_at >= period_start
        AND updated_at < period_end
    ), 0),

    -- Events managed: still a placeholder (events has no responsible_user_id)
    0
  INTO revenue_actual, leads_closed, events_managed;

  RETURN NEXT;
END;
$$;

-- ─── 4. Drop the 'sotuv-amocrm' permission module ────────────────────────────
-- Must stay in sync with ModuleName (src/lib/supabase/queries/auth.ts) and
-- VALID_MODULES (supabase/functions/admin-create-user).

DELETE FROM public.user_permissions WHERE module = 'sotuv-amocrm';

ALTER TABLE public.user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_module_check;

ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_module_check
  CHECK (module IN (
    'dashboard',
    'sotuv-crmn',
    'mijozlar',
    'tadbirlar',
    'pbx',
    'sozlamalar'
  ));

-- ─── 5. Drop the AmoCRM cache tables ─────────────────────────────────────────
-- No CASCADE: the only FK into these was dropped in step 2, so anything still
-- depending on them should surface as an error rather than vanish silently.

DROP TABLE IF EXISTS public.amocrm_leads;
DROP TABLE IF EXISTS public.amocrm_pipelines;
DROP TABLE IF EXISTS public.amocrm_sync_log;
DROP TABLE IF EXISTS public.amocrm_users;
DROP TABLE IF EXISTS public.amocrm_tokens;
