-- ============================================
-- GOOGLE MEMBER SETUP RPC
-- Called after Google OAuth to convert an auto-created profiles row
-- into a proper clients/member row.
-- ============================================

CREATE OR REPLACE FUNCTION public.setup_google_member(
  p_full_name text,
  p_phone     text,
  p_company   text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id  uuid;
  v_client_id uuid;
  v_email    text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Avtorizatsiya talab qilinadi';
  END IF;

  -- Already a member — just return the existing client id
  SELECT id INTO v_client_id
  FROM public.clients
  WHERE auth_user_id = v_user_id;

  IF FOUND THEN
    RETURN v_client_id;
  END IF;

  -- Google OAuth fires handle_new_user which creates a profiles row.
  -- Delete it so the user is not treated as staff.
  DELETE FROM public.profiles WHERE id = v_user_id;

  -- Grab the email from auth.users
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  -- Create the clients row
  INSERT INTO public.clients (
    full_name, phone, company, email,
    auth_user_id, community_approved
  )
  VALUES (
    trim(p_full_name),
    trim(p_phone),
    trim(p_company),
    v_email,
    v_user_id,
    false
  )
  RETURNING id INTO v_client_id;

  RETURN v_client_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.setup_google_member(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.setup_google_member(text, text, text) TO authenticated, service_role;
