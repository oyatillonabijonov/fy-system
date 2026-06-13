-- ============================================
-- MEMBER RLS: replace allow-all policies on member-facing tables.
-- Staff (active profiles row) keep full access; members see only
-- their own data. Webhooks / cron / edge functions use the service
-- role and bypass RLS entirely.
-- ============================================

-- ── clients ──
DROP POLICY IF EXISTS "Allow all on clients" ON clients;

CREATE POLICY "clients select staff or own" ON clients
  FOR SELECT USING (is_staff(auth.uid()) OR auth_user_id = auth.uid());

CREATE POLICY "clients insert staff" ON clients
  FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "clients update staff" ON clients
  FOR UPDATE USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "clients delete staff" ON clients
  FOR DELETE USING (is_staff(auth.uid()));

-- ── events ──
DROP POLICY IF EXISTS "events_all" ON events;

CREATE POLICY "events select" ON events
  FOR SELECT USING (
    is_staff(auth.uid())
    OR (auth.role() = 'authenticated' AND is_active = true)
  );

CREATE POLICY "events insert staff" ON events
  FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "events update staff" ON events
  FOR UPDATE USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "events delete staff" ON events
  FOR DELETE USING (is_staff(auth.uid()));

-- ── event_participants ──
DROP POLICY IF EXISTS "event_participants_all" ON event_participants;

CREATE POLICY "participants select staff or own" ON event_participants
  FOR SELECT USING (is_staff(auth.uid()) OR contact_id = my_client_id());

CREATE POLICY "participants insert staff" ON event_participants
  FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "participants update staff" ON event_participants
  FOR UPDATE USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "participants delete staff" ON event_participants
  FOR DELETE USING (is_staff(auth.uid()));

-- ── cashback_transactions ──
DROP POLICY IF EXISTS "Allow all" ON cashback_transactions;

CREATE POLICY "cashback select staff or own" ON cashback_transactions
  FOR SELECT USING (is_staff(auth.uid()) OR client_id = my_client_id());

CREATE POLICY "cashback insert staff" ON cashback_transactions
  FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "cashback update staff" ON cashback_transactions
  FOR UPDATE USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "cashback delete staff" ON cashback_transactions
  FOR DELETE USING (is_staff(auth.uid()));

-- ── profiles ──
-- Was: any authenticated user can view all profiles. Members are
-- authenticated now, so restrict staff directory to staff.
DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;

CREATE POLICY "profiles select staff or self" ON profiles
  FOR SELECT USING (is_staff(auth.uid()) OR id = auth.uid());
