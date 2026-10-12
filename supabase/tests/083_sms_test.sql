-- Behavioural tests for migration 083 (send_sms). THROWAWAY DB only (CLAUDE.md §5 "Tests").
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('83000000-0000-0000-0000-000000000001', 'sms83@fy.uz',   '{"full_name":"SMS","role":"xodim"}'::jsonb),
  ('83000000-0000-0000-0000-000000000002', 'nosms83@fy.uz', '{"full_name":"No SMS","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES ('83000000-0000-0000-0000-000000000001', 'sms', true);
INSERT INTO public.clients (id, full_name, phone, sms_opt_out) VALUES
  ('c8300000-0000-0000-0000-000000000001', 'Ali Valiyev', '+998901110001', false),
  ('c8300000-0000-0000-0000-000000000002', 'Rad Etgan',   '+998901110002', true),
  ('c8300000-0000-0000-0000-000000000003', 'Raqamsiz',    NULL,            false);

CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS
  $$ SELECT set_config('request.jwt.claim.sub', p::text, false)::void $$;
CREATE OR REPLACE FUNCTION pg_temp.open_now() RETURNS boolean LANGUAGE sql AS
  $$ SELECT extract(hour FROM now() AT TIME ZONE 'Asia/Tashkent') BETWEEN 9 AND 20 $$;

DO $$
DECLARE r jsonb; ids uuid[] := ARRAY['c8300000-0000-0000-0000-000000000001', 'c8300000-0000-0000-0000-000000000002', 'c8300000-0000-0000-0000-000000000003']::uuid[];
BEGIN
  -- T1: no 'sms' module → refused
  PERFORM pg_temp.as_user('83000000-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.send_sms('promo', 'x', ids);
    RAISE EXCEPTION 'T1 FAILED: ruxsatsiz yuborildi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden' THEN RAISE; END IF;
  END;

  PERFORM pg_temp.as_user('83000000-0000-0000-0000-000000000001');
  IF NOT pg_temp.open_now() THEN
    -- T2 (night run): quiet hours refuse
    BEGIN
      PERFORM public.send_sms('reminder', 'x', ids);
      RAISE EXCEPTION 'T2 FAILED: kechasi yuborildi';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'quiet_hours' THEN RAISE; END IF;
    END;
    RAISE NOTICE 'T3/T4 skipped: test 9:00–21:00 dan tashqarida ishga tushdi';
    RETURN;
  END IF;

  -- T3: promo skips no-phone and opt-out; {ism} = first name
  r := public.send_sms('promo', 'Salom, {ism}!', ids);
  IF (r->>'queued')::int <> 1 OR (r->>'skipped')::int <> 2 THEN RAISE EXCEPTION 'T3 FAILED: %', r; END IF;
  IF (SELECT text FROM public.sms_messages WHERE campaign_id = (r->>'campaign_id')::uuid) <> 'Salom, Ali!' THEN
    RAISE EXCEPTION 'T3 FAILED: {ism} to''ldirilmadi';
  END IF;

  -- T4: a reminder reaches the opt-out client too
  r := public.send_sms('reminder', 'Ertaga tadbir', ids);
  IF (r->>'queued')::int <> 2 THEN RAISE EXCEPTION 'T4 FAILED: %', r; END IF;
  IF (SELECT total FROM public.sms_campaign_stats WHERE id = (r->>'campaign_id')::uuid) <> 2 THEN RAISE EXCEPTION 'T4 FAILED: stats'; END IF;
END $$;

SELECT '083: hamma testlar o''tdi ✓' AS natija;
