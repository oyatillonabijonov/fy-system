-- Migration 047: split Tadbirlar into Boshqaruv + Moliya
--
-- 1) New permission module 'tadbirlar-moliya' guards the finance page
--    (/tadbirlar/moliya). 'tadbirlar' keeps guarding management
--    (/tadbirlar/boshqaruv). Module IDs must stay in sync with
--    ModuleName/MODULES (src/lib/supabase/queries/auth.ts) and VALID_MODULES
--    (supabase/functions/admin-create-user) — both updated in this change.
-- 2) Everyone who has 'tadbirlar' today is backfilled with 'tadbirlar-moliya'
--    so nobody silently loses access they already had. Admins can revoke it
--    per-user afterwards from Sozlamalar.
-- 3) event_finance_totals() feeds the three KPI cards on the finance page.

ALTER TABLE public.user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_module_check;

ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_module_check
  CHECK (module IN (
    'dashboard',
    'sotuv-crmn',
    'mijozlar',
    'tadbirlar',
    'tadbirlar-moliya',
    'sozlamalar'
  ));

-- Backfill: mirror each existing 'tadbirlar' grant onto 'tadbirlar-moliya'.
-- UNIQUE(user_id, module) from 018 makes this idempotent.
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete)
SELECT user_id, 'tadbirlar-moliya', can_view, can_edit, can_delete
FROM public.user_permissions
WHERE module = 'tadbirlar'
ON CONFLICT (user_id, module) DO NOTHING;

-- ─── Finance KPI totals ──────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose (no SECURITY DEFINER): RLS already limits members
-- to their own rows, so an invoker-rights function can never leak club-wide
-- money. A DEFINER function would bypass RLS and would need an is_staff() guard.
--
-- total_income reads payments.amount, NOT event_participants.paid: `paid`
-- includes cashback_used, which is not cash coming in (see migration 035).
CREATE OR REPLACE FUNCTION public.event_finance_totals()
RETURNS TABLE (
  total_income           numeric,
  total_debt             numeric,
  total_cashback_balance numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT COALESCE(SUM(amount), 0) FROM public.payments),
    -- GREATEST: an overpaid participant must contribute 0, never a negative
    -- that quietly cancels out someone else's real debt.
    (SELECT COALESCE(SUM(GREATEST(price - paid, 0)), 0) FROM public.event_participants),
    (SELECT COALESCE(SUM(cashback_balance), 0) FROM public.clients);
$$;

REVOKE EXECUTE ON FUNCTION public.event_finance_totals() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.event_finance_totals() TO authenticated, service_role;
