-- Shared test helpers. A test pulls them in with `\ir _helpers.sql` — a path relative to the test file,
-- so nothing depends on where the stand keeps its files.
--
-- make_staff: a staff login made the way admin-create-user makes it. Since 112 the auth trigger creates
-- every new profile as an inactive 'xodim' (it no longer trusts the metadata's role), so the role and
-- is_active = true are written here explicitly, as the function's step 6 does.
-- Member logins (user_type = 'member') are still inserted into auth.users directly: they get no profile.
CREATE OR REPLACE FUNCTION pg_temp.make_staff(p_id uuid, p_email text, p_full_name text, p_role text DEFAULT 'xodim')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (p_id, p_email, jsonb_build_object('full_name', p_full_name, 'role', p_role));
  -- as the service role: no JWT, so guard_profile_self_update lets the role through even when a test has
  -- already set a staff member's claims for the session (is_local: back as it was after this statement's transaction)
  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  UPDATE public.profiles SET role = p_role, full_name = p_full_name, is_active = true WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'make_staff: no profile for % (is the handle_new_user trigger missing?)', p_email;
  END IF;
END $$;
