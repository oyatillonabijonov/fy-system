-- ============================================
-- COMMUNITY CHAT: community_approved + channels + messages
-- ============================================

-- 1. community_approved flag on clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS community_approved boolean NOT NULL DEFAULT false;

-- 2. channels table (admin-created group channels)
CREATE TABLE IF NOT EXISTS public.channels (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  description text,
  created_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channels select" ON public.channels
  FOR SELECT USING (
    is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.clients
      WHERE auth_user_id = auth.uid() AND community_approved = true
    )
  );

CREATE POLICY "channels insert staff" ON public.channels
  FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "channels update staff" ON public.channels
  FOR UPDATE USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "channels delete staff" ON public.channels
  FOR DELETE USING (is_staff(auth.uid()));

-- 3. messages table (channel messages + DMs)
CREATE TABLE IF NOT EXISTS public.messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   uuid        REFERENCES public.channels(id) ON DELETE CASCADE,
  sender_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  content      text,
  image_url    text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT messages_target_check CHECK (
    (channel_id IS NOT NULL AND recipient_id IS NULL)
    OR (channel_id IS NULL AND recipient_id IS NOT NULL)
  ),
  CONSTRAINT messages_content_check CHECK (
    content IS NOT NULL OR image_url IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS messages_channel_id_idx  ON public.messages (channel_id, created_at);
CREATE INDEX IF NOT EXISTS messages_dm_idx
  ON public.messages (sender_id, recipient_id, created_at)
  WHERE channel_id IS NULL;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

CREATE POLICY "messages select" ON public.messages
  FOR SELECT USING (
    is_staff(auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.clients
        WHERE auth_user_id = auth.uid() AND community_approved = true
      )
      AND (
        channel_id IS NOT NULL
        OR sender_id    = auth.uid()
        OR recipient_id = auth.uid()
      )
    )
  );

CREATE POLICY "messages insert" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND (
      is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.clients
        WHERE auth_user_id = auth.uid() AND community_approved = true
      )
    )
  );

CREATE POLICY "messages delete own" ON public.messages
  FOR DELETE USING (sender_id = auth.uid());
