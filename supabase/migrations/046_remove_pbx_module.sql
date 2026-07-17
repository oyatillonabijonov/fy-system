-- Migration 046: Drop the 'pbx' permission module
--
-- The IP Telefoniya page was a 9-line "coming soon" placeholder with no PBX
-- integration behind it. Page, route and module are removed; this keeps the
-- CHECK in sync with ModuleName (src/lib/supabase/queries/auth.ts) and
-- VALID_MODULES (supabase/functions/admin-create-user).
--
-- The sidebar also carried five dead entries with no route at all (Vazifalar,
-- Analitika, Podkast, Cash Flow, To'lovlar) — those were frontend-only and need
-- no migration. Note "To'lovlar"/"Cash Flow" were placeholders: the real payment
-- ledger lives in the Events page, untouched.

DELETE FROM public.user_permissions WHERE module = 'pbx';

ALTER TABLE public.user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_module_check;

ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_module_check
  CHECK (module IN (
    'dashboard',
    'sotuv-crmn',
    'mijozlar',
    'tadbirlar',
    'sozlamalar'
  ));
