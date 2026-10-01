-- 076: live updates. The web keeps one realtime channel (src/components/layout/LiveSync.tsx) and refetches
-- what a change touches, so another user's edit (a new lead, a profile photo, a task, a payment)
-- shows up without reloading. Realtime applies each subscriber's RLS, so a row only reaches
-- those who can read it (payments → Moliya only).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients', 'profiles', 'crm_tasks', 'crm_notes', 'tasks', 'task_comments',
    'task_attachments', 'events', 'event_tariffs', 'event_participants', 'payments', 'expenses', 'cashback_transactions']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
