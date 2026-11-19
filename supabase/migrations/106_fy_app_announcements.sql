-- 106: history of the announcements sent to every FY app member (the Ilova page lists them).
-- amo-sync (/hooks/fy/announce) writes a row after the app answered; nobody else writes.
BEGIN;

CREATE TABLE public.fy_app_announcements (
  id         bigserial   PRIMARY KEY,
  text       text        NOT NULL,
  href       text        NOT NULL DEFAULT '/',
  sent       integer     NOT NULL,            -- members the app notified
  created_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fy_app_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fy app announcements read" ON public.fy_app_announcements FOR SELECT USING (public.has_permission(auth.uid(), 'tadbirlar'));
GRANT SELECT ON public.fy_app_announcements TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fy_app_announcements FROM anon, authenticated;

COMMIT;
