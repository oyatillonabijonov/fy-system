-- Behavioural tests for migration 096 (a lost bitim says why). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('96000000-0000-0000-0000-00000000000a', 'a96@fy.uz', '{"full_name":"Admin96","role":"admin"}'::jsonb),
  ('96000000-0000-0000-0000-000000000001', 's96@fy.uz', '{"full_name":"Sotuvchi96","role":"xodim"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '96000000-0000-0000-0000-00000000000a';
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES ('96000000-0000-0000-0000-000000000001', 'sotuv-crmn', true);

INSERT INTO public.crm_pipelines (id, name) VALUES ('a9600000-0000-0000-0000-000000000001', 'Voronka96');
INSERT INTO public.crm_stages (id, pipeline_id, name, sort_order, is_won, is_lost) VALUES
  ('b9600000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', 'Yangi', 0, false, false),
  ('b9600000-0000-0000-0000-000000000002', 'a9600000-0000-0000-0000-000000000001', 'Yutildi', 1, true, false),
  ('b9600000-0000-0000-0000-000000000003', 'a9600000-0000-0000-0000-000000000001', 'Yutqazildi', 2, false, true);
INSERT INTO public.crm_leads (id, pipeline_id, stage_id, name) VALUES
  ('d9600000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', 'b9600000-0000-0000-0000-000000000001', 'Bir'),
  ('d9600000-0000-0000-0000-000000000002', 'a9600000-0000-0000-0000-000000000001', 'b9600000-0000-0000-0000-000000000001', 'Ikki'),
  ('d9600000-0000-0000-0000-000000000003', 'a9600000-0000-0000-0000-000000000001', 'b9600000-0000-0000-0000-000000000001', 'Uch');
-- a bitim lost before 096: no reason (the trigger is off for this one row)
ALTER TABLE public.crm_leads DISABLE TRIGGER trigger_crm_lead_loss_reason;
INSERT INTO public.crm_leads (id, pipeline_id, stage_id, name) VALUES
  ('d9600000-0000-0000-0000-000000000004', 'a9600000-0000-0000-0000-000000000001', 'b9600000-0000-0000-0000-000000000003', 'Eski');
ALTER TABLE public.crm_leads ENABLE TRIGGER trigger_crm_lead_loss_reason;

DO $$
DECLARE lost uuid := 'b9600000-0000-0000-0000-000000000003'; fresh uuid := 'b9600000-0000-0000-0000-000000000001';
  l1 uuid := 'd9600000-0000-0000-0000-000000000001'; ok boolean;
BEGIN
  -- 1: to the lost stage without a reason, or with one outside the list — refused
  ok := false;
  BEGIN UPDATE public.crm_leads SET stage_id = lost WHERE id = l1; EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'TEST 1 FAILED: lost without a reason was accepted'; END IF;
  ok := false;
  BEGIN UPDATE public.crm_leads SET stage_id = lost, loss_reason = 'qimmat ekan' WHERE id = l1; EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'TEST 1 FAILED: a free-text reason was accepted'; END IF;
  ok := false;
  BEGIN INSERT INTO public.crm_leads (pipeline_id, stage_id, name) VALUES ('a9600000-0000-0000-0000-000000000001', lost, 'Yangi yutqazilgan');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'TEST 1 FAILED: a bitim was created lost without a reason'; END IF;

  -- 2: with a reason from the list it goes through, every reason of the list
  UPDATE public.crm_leads SET stage_id = lost, loss_reason = 'Narx' WHERE id = l1;
  IF NOT (SELECT is_lost AND loss_reason = 'Narx' FROM public.crm_leads WHERE id = l1) THEN RAISE EXCEPTION 'TEST 2 FAILED: not lost with Narx'; END IF;
  IF array_length(public.crm_loss_reasons(), 1) <> 7 THEN RAISE EXCEPTION 'TEST 2 FAILED: the list is not seven'; END IF;

  -- 3: while lost the reason can be changed to another of the list, not cleared or freed
  UPDATE public.crm_leads SET loss_reason = 'Javob bermadi' WHERE id = l1;
  ok := false;
  BEGIN UPDATE public.crm_leads SET loss_reason = NULL WHERE id = l1; EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'TEST 3 FAILED: the reason was cleared while lost'; END IF;
  UPDATE public.crm_leads SET price = 5 WHERE id = l1;   -- an unrelated edit is fine

  -- 4: leaving the lost stage clears the reason; a reason on an open bitim does not stick
  UPDATE public.crm_leads SET stage_id = fresh WHERE id = l1;
  IF (SELECT loss_reason FROM public.crm_leads WHERE id = l1) IS NOT NULL THEN RAISE EXCEPTION 'TEST 4 FAILED: reason kept after reopening'; END IF;
  UPDATE public.crm_leads SET loss_reason = 'Narx' WHERE id = l1;
  IF (SELECT loss_reason FROM public.crm_leads WHERE id = l1) IS NOT NULL THEN RAISE EXCEPTION 'TEST 4 FAILED: reason on an open bitim'; END IF;
  UPDATE public.crm_leads SET stage_id = 'b9600000-0000-0000-0000-000000000002' WHERE id = l1;   -- won needs no reason

  -- 5: a bitim lost before 096 can still be edited, and reopened, without a reason
  UPDATE public.crm_leads SET price = 7 WHERE id = 'd9600000-0000-0000-0000-000000000004';
  IF NOT (SELECT is_lost AND loss_reason IS NULL FROM public.crm_leads WHERE id = 'd9600000-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'TEST 5 FAILED: the old lost bitim changed'; END IF;

  UPDATE public.crm_leads SET stage_id = lost, loss_reason = 'Narx' WHERE id = 'd9600000-0000-0000-0000-000000000002';
  UPDATE public.crm_leads SET stage_id = lost, loss_reason = 'Tadbirkor emas' WHERE id = 'd9600000-0000-0000-0000-000000000003';
END $$;

-- 6: lost_reasons counts the period's lost bitimlar by reason for a dashboard user, refuses others
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-00000000000a', false);
DO $$
DECLARE r jsonb := public.lost_reasons(current_date - 1, current_date + 1, 'a9600000-0000-0000-0000-000000000001');
BEGIN
  IF r <> '[{"count":1,"reason":"Ko''rsatilmagan"},{"count":1,"reason":"Narx"},{"count":1,"reason":"Tadbirkor emas"}]'::jsonb THEN
    RAISE EXCEPTION 'TEST 6 FAILED: %', r; END IF;
  IF public.lost_reasons(current_date - 30, current_date - 20, 'a9600000-0000-0000-0000-000000000001') <> '[]'::jsonb THEN
    RAISE EXCEPTION 'TEST 6 FAILED: another period is not empty'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000001', false);
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.lost_reasons(current_date, current_date); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'TEST 6 FAILED: a user without the dashboard module got the reasons'; END IF;
  -- 7: the rule holds for a seller through the API role too
  ok := false;
  BEGIN UPDATE public.crm_leads SET stage_id = 'b9600000-0000-0000-0000-000000000003' WHERE id = 'd9600000-0000-0000-0000-000000000001';
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'TEST 7 FAILED: a seller lost a bitim without a reason'; END IF;
END $$;
RESET ROLE;

\echo '096 loss reason: all tests passed'
