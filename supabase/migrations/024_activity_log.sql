-- ============================================
-- ACTIVITY LOG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who did it
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_email text,
  actor_name text,
  actor_role text,

  -- What happened
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  entity_type text NOT NULL,           -- 'client', 'event', 'participant', 'profile', 'permission', 'kpi', 'cashback'
  entity_id text NOT NULL,             -- target row id (text to support uuid + bigint)
  entity_name text,                    -- human-readable name (client name, event name, etc.)

  -- Details
  changes jsonb,                       -- before/after for updates, full data for create/delete
  description text,                    -- human-readable summary in Uzbek

  -- Metadata
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON activity_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);

-- ============================================
-- RLS — Admin only
-- ============================================

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only read" ON activity_log
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "System insert" ON activity_log
  FOR INSERT WITH CHECK (true);

-- ============================================
-- HELPER: get actor info
-- ============================================

CREATE OR REPLACE FUNCTION public.get_current_actor()
RETURNS TABLE(
  actor_id uuid,
  actor_email text,
  actor_name text,
  actor_role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'system'::text, 'System'::text, 'system'::text;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.role::text
    FROM profiles p WHERE p.id = uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_current_actor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_actor() TO authenticated, service_role;

-- ============================================
-- GENERIC LOGGING TRIGGER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor record;
  v_entity_type text;
  v_entity_id text;
  v_entity_name text;
  v_action text;
  v_description text;
  v_changes jsonb;
BEGIN
  v_entity_type := TG_ARGV[0];

  SELECT * INTO actor FROM get_current_actor() LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_entity_id := NEW.id::text;
    v_changes := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'updated';
    v_entity_id := NEW.id::text;
    v_changes := jsonb_build_object(
      'before', to_jsonb(OLD),
      'after', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_entity_id := OLD.id::text;
    v_changes := to_jsonb(OLD);
  END IF;

  CASE v_entity_type
    WHEN 'client' THEN
      v_entity_name := COALESCE(
        (CASE WHEN TG_OP = 'DELETE' THEN OLD.full_name ELSE NEW.full_name END),
        'Noma''lum mijoz'
      );
      v_description := CASE v_action
        WHEN 'created' THEN 'Yangi mijoz qo''shildi: ' || v_entity_name
        WHEN 'updated' THEN 'Mijoz tahrirlandi: ' || v_entity_name
        WHEN 'deleted' THEN 'Mijoz o''chirildi: ' || v_entity_name
      END;

    WHEN 'event' THEN
      v_entity_name := COALESCE(
        (CASE WHEN TG_OP = 'DELETE' THEN OLD.name ELSE NEW.name END),
        'Noma''lum tadbir'
      );
      v_description := CASE v_action
        WHEN 'created' THEN 'Yangi tadbir yaratildi: ' || v_entity_name
        WHEN 'updated' THEN 'Tadbir tahrirlandi: ' || v_entity_name
        WHEN 'deleted' THEN 'Tadbir o''chirildi: ' || v_entity_name
      END;

    WHEN 'participant' THEN
      v_entity_name := COALESCE(
        (CASE WHEN TG_OP = 'DELETE' THEN OLD.full_name ELSE NEW.full_name END),
        'Noma''lum ishtirokchi'
      );
      v_description := CASE v_action
        WHEN 'created' THEN 'Tadbirga ishtirokchi qo''shildi: ' || v_entity_name
        WHEN 'updated' THEN 'Ishtirokchi yangilandi: ' || v_entity_name
        WHEN 'deleted' THEN 'Ishtirokchi olib tashlandi: ' || v_entity_name
      END;

    WHEN 'profile' THEN
      v_entity_name := COALESCE(
        (CASE WHEN TG_OP = 'DELETE' THEN OLD.full_name ELSE NEW.full_name END),
        'Noma''lum hodim'
      );
      v_description := CASE v_action
        WHEN 'created' THEN 'Yangi hodim qo''shildi: ' || v_entity_name
        WHEN 'updated' THEN 'Hodim profili yangilandi: ' || v_entity_name
        WHEN 'deleted' THEN 'Hodim o''chirildi: ' || v_entity_name
      END;

    WHEN 'permission' THEN
      v_entity_name := (CASE WHEN TG_OP = 'DELETE' THEN OLD.module ELSE NEW.module END);
      v_description := CASE v_action
        WHEN 'created' THEN 'Modul ruxsati berildi: ' || v_entity_name
        WHEN 'updated' THEN 'Modul ruxsati yangilandi: ' || v_entity_name
        WHEN 'deleted' THEN 'Modul ruxsati olib tashlandi: ' || v_entity_name
      END;

    WHEN 'kpi' THEN
      v_entity_name := 'KPI ' || (CASE WHEN TG_OP = 'DELETE' THEN OLD.period_year::text || '-' || OLD.period_month::text
                                       ELSE NEW.period_year::text || '-' || NEW.period_month::text END);
      v_description := CASE v_action
        WHEN 'created' THEN 'KPI maqsadi belgilandi: ' || v_entity_name
        WHEN 'updated' THEN 'KPI maqsadi yangilandi: ' || v_entity_name
        WHEN 'deleted' THEN 'KPI maqsadi o''chirildi: ' || v_entity_name
      END;

    WHEN 'cashback' THEN
      DECLARE
        amt numeric;
        ttype text;
      BEGIN
        amt := (CASE WHEN TG_OP = 'DELETE' THEN OLD.amount ELSE NEW.amount END);
        ttype := (CASE WHEN TG_OP = 'DELETE' THEN OLD.type ELSE NEW.type END);
        v_entity_name := ttype || ': ' || amt::text || ' so''m';
        v_description := CASE ttype
          WHEN 'earned' THEN 'Cashback berildi: ' || amt::text || ' so''m'
          WHEN 'used' THEN 'Cashback ishlatildi: ' || amt::text || ' so''m'
          WHEN 'manual_add' THEN 'Cashback qo''lda qo''shildi: ' || amt::text || ' so''m'
          WHEN 'manual_subtract' THEN 'Cashback qo''lda ayirildi: ' || amt::text || ' so''m'
          ELSE 'Cashback amaliyot: ' || amt::text
        END;
      END;
  END CASE;

  INSERT INTO activity_log(
    actor_id, actor_email, actor_name, actor_role,
    action, entity_type, entity_id, entity_name,
    changes, description
  ) VALUES (
    actor.actor_id, actor.actor_email, actor.actor_name, actor.actor_role,
    v_action, v_entity_type, v_entity_id, v_entity_name,
    v_changes, v_description
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_activity() TO service_role;

-- ============================================
-- ATTACH TRIGGERS TO TABLES
-- ============================================

DROP TRIGGER IF EXISTS log_clients_activity ON clients;
CREATE TRIGGER log_clients_activity
  AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION log_activity('client');

DROP TRIGGER IF EXISTS log_events_activity ON events;
CREATE TRIGGER log_events_activity
  AFTER INSERT OR UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION log_activity('event');

DROP TRIGGER IF EXISTS log_participants_activity ON event_participants;
CREATE TRIGGER log_participants_activity
  AFTER INSERT OR UPDATE OR DELETE ON event_participants
  FOR EACH ROW EXECUTE FUNCTION log_activity('participant');

DROP TRIGGER IF EXISTS log_profiles_activity ON profiles;
CREATE TRIGGER log_profiles_activity
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_activity('profile');

DROP TRIGGER IF EXISTS log_permissions_activity ON user_permissions;
CREATE TRIGGER log_permissions_activity
  AFTER INSERT OR UPDATE OR DELETE ON user_permissions
  FOR EACH ROW EXECUTE FUNCTION log_activity('permission');

DROP TRIGGER IF EXISTS log_kpi_activity ON employee_kpi_targets;
CREATE TRIGGER log_kpi_activity
  AFTER INSERT OR UPDATE OR DELETE ON employee_kpi_targets
  FOR EACH ROW EXECUTE FUNCTION log_activity('kpi');

DROP TRIGGER IF EXISTS log_cashback_activity ON cashback_transactions;
CREATE TRIGGER log_cashback_activity
  AFTER INSERT OR UPDATE OR DELETE ON cashback_transactions
  FOR EACH ROW EXECUTE FUNCTION log_activity('cashback');

-- ============================================
-- AUTO-CLEANUP: 1 year retention
-- ============================================

CREATE OR REPLACE FUNCTION public.cleanup_old_activity_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM activity_log WHERE created_at < now() - INTERVAL '1 year';
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_activity_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_activity_logs() TO service_role;
