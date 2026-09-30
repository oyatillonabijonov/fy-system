-- 072: Sotuv bo'limi — the native sales CRM that replaces AmoCRM (crm_* tables from 007,
-- empty in production). A deal (crm_leads) now belongs to one of OUR clients (one client
-- per phone, 057) instead of the unused crm_contacts; tasks are AmoCRM-style (type, owner,
-- due date + time, result); crm_notes becomes the deal's feed (notes + system rows for
-- "created" and stage moves, written by triggers). Access = the sotuv-crmn module
-- (label "Sotuv bo'limi"); voronka/bosqich setup is admin-only.

BEGIN;

-- ── Deals ────────────────────────────────────────────────────────────────────
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS client_id        uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS closed_at        timestamptz;
ALTER TABLE public.crm_leads ALTER COLUMN responsible_user_id SET DEFAULT auth.uid();
ALTER TABLE public.crm_leads ALTER COLUMN pipeline_id SET NOT NULL;
ALTER TABLE public.crm_leads ALTER COLUMN stage_id SET NOT NULL;
ALTER TABLE public.crm_leads ALTER COLUMN price SET NOT NULL;
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_price_nonneg CHECK (price >= 0);
CREATE INDEX IF NOT EXISTS idx_crm_leads_board  ON public.crm_leads (pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_client ON public.crm_leads (client_id);

-- ── Tasks (AmoCRM-style: every task has a type, an owner and a deadline) ────
ALTER TABLE public.crm_tasks ALTER COLUMN created_by TYPE uuid USING NULL;   -- legacy bigint, no rows
ALTER TABLE public.crm_tasks
  ALTER COLUMN created_by SET DEFAULT auth.uid(),
  ADD CONSTRAINT crm_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind        text NOT NULL DEFAULT 'call' CHECK (kind IN ('call', 'meeting', 'email', 'other')),
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS done_at     timestamptz,
  ADD COLUMN IF NOT EXISTS result      text;
ALTER TABLE public.crm_tasks ALTER COLUMN lead_id SET NOT NULL;
ALTER TABLE public.crm_tasks ALTER COLUMN due_date SET NOT NULL;
ALTER TABLE public.crm_tasks ALTER COLUMN is_done SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_tasks_open ON public.crm_tasks (assignee_id, due_date) WHERE NOT is_done;
CREATE INDEX IF NOT EXISTS idx_crm_tasks_lead ON public.crm_tasks (lead_id);

-- ── Feed (notes + system rows) ───────────────────────────────────────────────
ALTER TABLE public.crm_notes ALTER COLUMN created_by TYPE uuid USING NULL;   -- legacy bigint, no rows
ALTER TABLE public.crm_notes
  ALTER COLUMN created_by SET DEFAULT auth.uid(),
  ADD CONSTRAINT crm_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind text  NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'created', 'stage')),
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.crm_notes ALTER COLUMN lead_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_notes_lead ON public.crm_notes (lead_id, created_at);

-- ── Stage rules: the stage belongs to the deal's voronka; won/lost + closed_at follow it
CREATE OR REPLACE FUNCTION public.crm_lead_stage_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE s record;
BEGIN
  SELECT pipeline_id, is_won, is_lost INTO s FROM public.crm_stages WHERE id = NEW.stage_id;
  IF s.pipeline_id IS DISTINCT FROM NEW.pipeline_id THEN
    RAISE EXCEPTION 'Bosqich bu voronkaga tegishli emas' USING ERRCODE = 'check_violation';
  END IF;
  NEW.is_won := s.is_won;
  NEW.is_lost := s.is_lost;
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    NEW.stage_changed_at := now();
  END IF;
  NEW.closed_at := CASE WHEN s.is_won OR s.is_lost
                        THEN COALESCE(CASE WHEN TG_OP = 'UPDATE' AND OLD.stage_id = NEW.stage_id THEN OLD.closed_at END, now())
                   END;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trigger_crm_lead_stage_rules ON public.crm_leads;
CREATE TRIGGER trigger_crm_lead_stage_rules BEFORE INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_lead_stage_rules();

-- Feed rows for "created" and every stage move (SECURITY DEFINER: users may only write notes)
CREATE OR REPLACE FUNCTION public.crm_lead_feed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_notes (lead_id, kind, text, created_by)
    VALUES (NEW.id, 'created', 'Sdelka yaratildi', auth.uid());
  ELSIF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.crm_notes (lead_id, kind, text, meta, created_by)
    SELECT NEW.id, 'stage', f.name || ' → ' || t.name,
           jsonb_build_object('from', OLD.stage_id, 'to', NEW.stage_id), auth.uid()
    FROM public.crm_stages f, public.crm_stages t WHERE f.id = OLD.stage_id AND t.id = NEW.stage_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trigger_crm_lead_feed ON public.crm_leads;
CREATE TRIGGER trigger_crm_lead_feed AFTER INSERT OR UPDATE OF stage_id ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_lead_feed();

-- done_at follows is_done
CREATE OR REPLACE FUNCTION public.crm_task_done_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.done_at := CASE WHEN NOT NEW.is_done THEN NULL
                      WHEN TG_OP = 'UPDATE' AND OLD.is_done THEN OLD.done_at
                      ELSE now() END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trigger_crm_task_done_at ON public.crm_tasks;
CREATE TRIGGER trigger_crm_task_done_at BEFORE INSERT OR UPDATE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_task_done_at();

-- ── New deal: an existing client, or find-or-create one by phone (one client per phone)
CREATE OR REPLACE FUNCTION public.create_crm_lead(
  p_pipeline uuid, p_stage uuid, p_name text,
  p_client_id uuid DEFAULT NULL, p_client_name text DEFAULT NULL, p_phone text DEFAULT NULL,
  p_price bigint DEFAULT 0, p_source text DEFAULT 'manual', p_responsible uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_client uuid := p_client_id;
  v_phone  text := public.clean_client_phone(p_phone);
  v_name   text := NULLIF(btrim(COALESCE(p_client_name, '')), '');
  v_id     uuid;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'sotuv-crmn') THEN
    RAISE EXCEPTION 'Sotuv bo''limiga ruxsat yo''q' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_client IS NULL AND v_phone IS NOT NULL THEN
    SELECT id INTO v_client FROM public.clients WHERE phone = v_phone;
    IF v_client IS NULL THEN
      INSERT INTO public.clients (full_name, phone, source)
      VALUES (COALESCE(v_name, NULLIF(btrim(p_name), ''), v_phone), v_phone, 'sotuv')
      RETURNING id INTO v_client;
    END IF;
  ELSIF v_client IS NULL AND v_name IS NOT NULL THEN
    INSERT INTO public.clients (full_name, source) VALUES (v_name, 'sotuv') RETURNING id INTO v_client;
  END IF;

  INSERT INTO public.crm_leads (name, pipeline_id, stage_id, client_id, price, source, responsible_user_id)
  VALUES (COALESCE(NULLIF(btrim(p_name), ''), (SELECT full_name FROM public.clients WHERE id = v_client), 'Yangi sdelka'),
          p_pipeline, p_stage, v_client, GREATEST(COALESCE(p_price, 0), 0), COALESCE(p_source, 'manual'), p_responsible)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_crm_lead(uuid, uuid, text, uuid, text, text, bigint, text, uuid) TO authenticated;

-- ── Access: the Sotuv bo'limi module (was: any staff) ──────────────────────
DROP POLICY IF EXISTS "crm_pipelines staff" ON public.crm_pipelines;
DROP POLICY IF EXISTS "crm_stages staff"    ON public.crm_stages;
DROP POLICY IF EXISTS "crm_contacts staff"  ON public.crm_contacts;
DROP POLICY IF EXISTS "crm_leads staff"     ON public.crm_leads;
DROP POLICY IF EXISTS "crm_notes staff"     ON public.crm_notes;
DROP POLICY IF EXISTS "crm_tasks staff"     ON public.crm_tasks;

CREATE POLICY "crm_pipelines read" ON public.crm_pipelines FOR SELECT USING (public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY "crm_pipelines admin" ON public.crm_pipelines FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "crm_stages read" ON public.crm_stages FOR SELECT USING (public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY "crm_stages admin" ON public.crm_stages FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "crm_contacts sotuv" ON public.crm_contacts FOR ALL
  USING (public.has_permission(auth.uid(), 'sotuv-crmn')) WITH CHECK (public.has_permission(auth.uid(), 'sotuv-crmn'));

CREATE POLICY "crm_leads read"   ON public.crm_leads FOR SELECT USING (public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY "crm_leads insert" ON public.crm_leads FOR INSERT WITH CHECK (public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY "crm_leads update" ON public.crm_leads FOR UPDATE
  USING (public.has_permission(auth.uid(), 'sotuv-crmn')) WITH CHECK (public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY "crm_leads delete admin" ON public.crm_leads FOR DELETE USING (public.is_admin(auth.uid()));

CREATE POLICY "crm_tasks read"   ON public.crm_tasks FOR SELECT USING (public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY "crm_tasks insert" ON public.crm_tasks FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'sotuv-crmn') AND created_by = auth.uid());
CREATE POLICY "crm_tasks update" ON public.crm_tasks FOR UPDATE
  USING (public.has_permission(auth.uid(), 'sotuv-crmn')) WITH CHECK (public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY "crm_tasks delete own or admin" ON public.crm_tasks FOR DELETE
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

-- Users write only plain notes signed as themselves; system rows come from the trigger
CREATE POLICY "crm_notes read"   ON public.crm_notes FOR SELECT USING (public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY "crm_notes insert" ON public.crm_notes FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'sotuv-crmn') AND kind = 'note' AND created_by = auth.uid());
CREATE POLICY "crm_notes delete own or admin" ON public.crm_notes FOR DELETE
  USING ((kind = 'note' AND created_by = auth.uid()) OR public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipelines, public.crm_stages, public.crm_contacts,
  public.crm_leads, public.crm_tasks TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.crm_notes TO authenticated;
REVOKE UPDATE ON public.crm_notes FROM authenticated;

COMMIT;
