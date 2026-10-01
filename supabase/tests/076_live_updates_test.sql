-- 076: every live table is in the realtime publication (the web's LiveSync listens to these)
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['crm_leads', 'crm_stages', 'crm_calls', 'clients', 'profiles', 'crm_tasks', 'crm_notes', 'tasks',
    'task_comments', 'task_attachments', 'events', 'event_tariffs', 'event_participants', 'payments', 'expenses',
    'cashback_transactions']) t
  WHERE NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'TEST FAIL: not in supabase_realtime: %', missing; END IF;
  RAISE NOTICE 'TEST PASS: 076 live tables published';
END $$;
