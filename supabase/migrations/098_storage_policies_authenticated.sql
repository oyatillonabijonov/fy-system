-- 098: the receipts (055) and task-files (071) storage policies were written for PUBLIC and call functions the
-- anon role may not execute (can_edit_finance, has_permission). Postgres checks every permissive policy on an
-- anon INSERT into storage.objects, so ANY anon upload — the anketa photo of 097 — failed with "permission
-- denied for function can_edit_finance". These four policies only ever mean signed-in staff: scope them to
-- `authenticated`. Staff behaviour is unchanged.
BEGIN;
ALTER POLICY "receipts read finance"   ON storage.objects TO authenticated;
ALTER POLICY "receipts upload finance" ON storage.objects TO authenticated;
ALTER POLICY "task files read staff"   ON storage.objects TO authenticated;
ALTER POLICY "task files upload staff" ON storage.objects TO authenticated;
COMMIT;
