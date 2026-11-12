-- 099: client-images was open to everyone holding the public anon key (025, "client-images all", TO public):
-- anyone could list the bucket and upload over any client's photo (<client id>.jpg, upsert). Now:
--  · signed-in staff (is_staff) — everything, as before (Mijozlar photo upload is an upsert);
--  · anon — only INSERT a new file under the folder of an open anketa link (097): anketa/<link id>/<name>.jpg.
--    No listing, no overwrite, no delete.
-- Reading photos is unaffected: the bucket is public, /object/public/ URLs don't go through these policies.
BEGIN;

CREATE OR REPLACE FUNCTION public.anketa_photo_path_ok(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_name ~ '^anketa/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'
    THEN EXISTS (SELECT 1 FROM public.client_profile_links
                  WHERE id = split_part(p_name, '/', 2)::uuid AND closed_at IS NULL AND (expires_at IS NULL OR expires_at > now()))
    ELSE false END
$$;
REVOKE ALL ON FUNCTION public.anketa_photo_path_ok(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anketa_photo_path_ok(text) TO anon, authenticated;

DROP POLICY "client-images all" ON storage.objects;
CREATE POLICY "client-images staff" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'client-images' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'client-images' AND public.is_staff(auth.uid()));
CREATE POLICY "client-images anketa upload" ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'client-images' AND public.anketa_photo_path_ok(name));

COMMIT;
