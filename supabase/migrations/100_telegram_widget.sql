-- 100: Telegram widget (docs/superpowers/specs/2026-11-17-telegram-widget-design.md).
-- A company Telegram account (MTProto, held by amo-sync) talks to leads from the bitim page.
-- Rules live here, in worker-only functions; amo-sync does the Telegram I/O; the browser reads with RLS.
--   telegram_accounts — connected accounts (profile_id NULL = shared, else that seller's work account)
--   tg_chats          — one per (account, Telegram user), tied to a client and the bitim it shows on
--   tg_messages       — both directions; files in the private bucket telegram-files
--   tg_templates      — admin-written texts + files sellers send in one click
-- Lead source `telegram` (ON): a stranger who writes first gets a client + bitim in its voronka.
BEGIN;

CREATE TABLE public.telegram_accounts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  title        text        NOT NULL,
  phone        text,
  tg_user_id   bigint,
  status       text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'logged_out')),
  connected_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tg_templates (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text        NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 80),
  body       text        NOT NULL DEFAULT '' CHECK (length(body) <= 4000),
  files      jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(files) = 'array' AND jsonb_array_length(files) <= 5),
  sort       integer     NOT NULL DEFAULT 0,
  created_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tg_chats (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid        NOT NULL REFERENCES public.telegram_accounts(id) ON DELETE CASCADE,
  tg_user_id      bigint      NOT NULL,
  access_hash     text        NOT NULL,
  username        text,
  title           text        NOT NULL DEFAULT '',
  phone           text,
  client_id       uuid        REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id         uuid        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  unread          integer     NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  first_out_at    timestamptz,                 -- we wrote first (counts toward the daily cap)
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, tg_user_id)
);
CREATE INDEX tg_chats_lead_idx   ON public.tg_chats (lead_id);
CREATE INDEX tg_chats_client_idx ON public.tg_chats (client_id);
CREATE INDEX tg_chats_first_out_idx ON public.tg_chats (account_id, first_out_at) WHERE first_out_at IS NOT NULL;

CREATE TABLE public.tg_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     uuid        NOT NULL REFERENCES public.tg_chats(id) ON DELETE CASCADE,
  tg_msg_id   bigint      NOT NULL,
  direction   text        NOT NULL CHECK (direction IN ('in', 'out')),
  text        text        NOT NULL DEFAULT '',
  files       jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- [{path, name, mime, size}]
  sent_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,   -- out from the ERP; NULL = typed in the app
  template_id uuid        REFERENCES public.tg_templates(id) ON DELETE SET NULL,
  read_at     timestamptz,                                -- out: the lead read it
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id, tg_msg_id)
);
CREATE INDEX tg_messages_chat_idx ON public.tg_messages (chat_id, created_at);

ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tg_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tg_chats          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tg_messages       ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telegram_accounts admin read" ON public.telegram_accounts FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "tg_templates sotuv read" ON public.tg_templates FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'sotuv-crmn') OR public.is_admin(auth.uid()));
CREATE POLICY "tg_templates admin write" ON public.tg_templates FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "tg_chats sotuv read" ON public.tg_chats FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY "tg_messages sotuv read" ON public.tg_messages FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'sotuv-crmn'));
REVOKE ALL ON public.telegram_accounts, public.tg_chats, public.tg_messages, public.tg_templates FROM anon, authenticated;
GRANT SELECT ON public.telegram_accounts, public.tg_chats, public.tg_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tg_templates TO authenticated;

-- ─── Worker-only functions ───────────────────────────────────────────────────

-- The client's bitim a chat shows on: newest open one, else the newest.
CREATE FUNCTION public.tg_client_lead(p_client uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM public.crm_leads WHERE client_id = p_client
  ORDER BY (NOT is_won AND NOT is_lost) DESC, created_at DESC LIMIT 1
$$;

-- New chats we opened today (Tashkent) on an account.
CREATE FUNCTION public.tg_today_new(p_account uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::int FROM public.tg_chats WHERE account_id = p_account
    AND first_out_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent')
$$;

-- A private message arrived (or was typed in the app): the chat it belongs to, or NULL to ignore it.
CREATE FUNCTION public.tg_link_chat(p_account uuid, p_tg_user bigint, p_access_hash text, p_username text, p_title text, p_phone text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_chat   uuid;
  v_client uuid;
  v_lead   uuid;
  v_phone  text := public.clean_client_phone(p_phone);
  v_user   text := NULLIF(lower(ltrim(btrim(COALESCE(p_username, '')), '@')), '');
  v_title  text := NULLIF(btrim(COALESCE(p_title, '')), '');
  src      public.crm_lead_sources;
BEGIN
  -- one Telegram user at a time: an album or two quick messages from a stranger must not open two clients
  PERFORM pg_advisory_xact_lock(hashtextextended('tg_link_chat:' || p_account || ':' || p_tg_user, 0));
  SELECT id INTO v_chat FROM public.tg_chats WHERE account_id = p_account AND tg_user_id = p_tg_user;
  IF v_chat IS NOT NULL THEN
    UPDATE public.tg_chats SET username = COALESCE(username, v_user), phone = COALESCE(phone, v_phone),
      access_hash = COALESCE(NULLIF(p_access_hash, ''), access_hash), title = COALESCE(v_title, title)
    WHERE id = v_chat;
    RETURN v_chat;
  END IF;

  -- a colleague writing to the company account never opens a bitim
  IF v_user IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE lower(ltrim(btrim(telegram), '@')) = v_user) THEN
    RETURN NULL;
  END IF;

  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_client FROM public.clients WHERE phone = v_phone;
    IF v_client IS NOT NULL THEN v_lead := public.tg_client_lead(v_client); END IF;
  END IF;

  IF v_lead IS NULL THEN
    SELECT * INTO src FROM public.crm_lead_sources WHERE id = 'telegram';
    IF src.id IS NOT NULL AND src.enabled THEN
      v_lead := (public.intake_lead('telegram', src.token, v_title, v_phone, NULL,
                  jsonb_build_object('tg_user_id', p_tg_user, 'username', v_user), '[]'::jsonb, NULL, '{}'::jsonb)->>'lead_id')::uuid;
      SELECT client_id INTO v_client FROM public.crm_leads WHERE id = v_lead;
    END IF;
    IF v_client IS NULL THEN RETURN NULL; END IF;   -- source off and nobody we know: not stored at all
  END IF;

  INSERT INTO public.tg_chats (account_id, tg_user_id, access_hash, username, title, phone, client_id, lead_id)
  VALUES (p_account, p_tg_user, COALESCE(p_access_hash, ''), v_user, COALESCE(v_title, ''), v_phone, v_client, v_lead)
  ON CONFLICT (account_id, tg_user_id) DO UPDATE SET title = EXCLUDED.title
  RETURNING id INTO v_chat;
  RETURN v_chat;
END $$;

-- Store one message (idempotent). An incoming one bumps unread and, if the chat's bitim is closed or gone,
-- moves the chat to the client's open bitim when there is one.
CREATE FUNCTION public.tg_log_message(p_chat uuid, p_msg bigint, p_dir text, p_text text, p_files jsonb,
                                      p_sent_by uuid, p_template uuid, p_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.tg_messages (chat_id, tg_msg_id, direction, text, files, sent_by, template_id, created_at)
  VALUES (p_chat, p_msg, p_dir, COALESCE(p_text, ''), COALESCE(p_files, '[]'::jsonb), p_sent_by, p_template, COALESCE(p_at, now()))
  ON CONFLICT (chat_id, tg_msg_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.tg_messages WHERE chat_id = p_chat AND tg_msg_id = p_msg;
    RETURN v_id;
  END IF;

  UPDATE public.tg_chats c SET
    unread = c.unread + CASE WHEN p_dir = 'in' THEN 1 ELSE 0 END,
    last_message_at = GREATEST(COALESCE(c.last_message_at, p_at), COALESCE(p_at, now())),
    lead_id = CASE
      WHEN p_dir = 'in' AND (c.lead_id IS NULL OR EXISTS (SELECT 1 FROM public.crm_leads l WHERE l.id = c.lead_id AND (l.is_won OR l.is_lost)))
      THEN COALESCE((SELECT l.id FROM public.crm_leads l WHERE l.client_id = c.client_id AND NOT l.is_won AND NOT l.is_lost
                     ORDER BY l.created_at DESC LIMIT 1), c.lead_id)
      ELSE c.lead_id END
  WHERE c.id = p_chat;
  RETURN v_id;
END $$;

-- Where a send to a bitim goes. chat_id NULL = a new chat (phone to resolve, then tg_create_chat).
-- Account: the client's existing chat on an active account; else the bitim owner's own account; else the
-- oldest active shared one. Raises tg_not_found / tg_no_account / tg_cap.
CREATE FUNCTION public.tg_send_target(p_lead uuid)
RETURNS TABLE (account_id uuid, chat_id uuid, tg_user_id bigint, access_hash text, phone text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_client uuid;
  v_owner  uuid;
  v_phone  text;
  v_acc    uuid;
  ch       public.tg_chats;
BEGIN
  SELECT l.client_id, l.responsible_user_id, c.phone INTO v_client, v_owner, v_phone
  FROM public.crm_leads l LEFT JOIN public.clients c ON c.id = l.client_id WHERE l.id = p_lead;
  IF NOT FOUND THEN RAISE EXCEPTION 'tg_not_found'; END IF;

  SELECT t.* INTO ch FROM public.tg_chats t JOIN public.telegram_accounts a ON a.id = t.account_id AND a.status = 'active'
  WHERE t.client_id = v_client ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC LIMIT 1;
  IF ch.id IS NOT NULL THEN
    -- written from this bitim: the chat (and so its feed) follows it
    UPDATE public.tg_chats SET lead_id = p_lead WHERE id = ch.id AND lead_id IS DISTINCT FROM p_lead;
    RETURN QUERY SELECT ch.account_id, ch.id, ch.tg_user_id, ch.access_hash, v_phone;
    RETURN;
  END IF;

  IF v_phone IS NULL THEN RAISE EXCEPTION 'tg_not_found'; END IF;
  SELECT a.id INTO v_acc FROM public.telegram_accounts a WHERE a.status = 'active' AND a.profile_id = v_owner ORDER BY a.created_at LIMIT 1;
  IF v_acc IS NULL THEN
    SELECT a.id INTO v_acc FROM public.telegram_accounts a WHERE a.status = 'active' AND a.profile_id IS NULL ORDER BY a.created_at LIMIT 1;
  END IF;
  IF v_acc IS NULL THEN RAISE EXCEPTION 'tg_no_account'; END IF;
  IF public.tg_today_new(v_acc) >= 30 THEN RAISE EXCEPTION 'tg_cap'; END IF;
  RETURN QUERY SELECT v_acc, NULL::uuid, NULL::bigint, NULL::text, v_phone;
END $$;

-- The phone resolved to a Telegram user: open the chat (cap re-checked under a lock on the account, so two
-- sends can't both take the 30th place). An existing (account, user) chat is returned and costs nothing.
CREATE FUNCTION public.tg_create_chat(p_account uuid, p_lead uuid, p_tg_user bigint, p_access_hash text, p_username text, p_title text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_chat uuid; v_client uuid;
BEGIN
  PERFORM 1 FROM public.telegram_accounts WHERE id = p_account FOR UPDATE;
  SELECT client_id INTO v_client FROM public.crm_leads WHERE id = p_lead;
  SELECT id INTO v_chat FROM public.tg_chats WHERE account_id = p_account AND tg_user_id = p_tg_user;
  IF v_chat IS NOT NULL THEN
    UPDATE public.tg_chats SET lead_id = p_lead, client_id = v_client WHERE id = v_chat;
    RETURN v_chat;
  END IF;
  IF public.tg_today_new(p_account) >= 30 THEN RAISE EXCEPTION 'tg_cap'; END IF;
  INSERT INTO public.tg_chats (account_id, tg_user_id, access_hash, username, title, phone, client_id, lead_id, first_out_at)
  VALUES (p_account, p_tg_user, COALESCE(p_access_hash, ''), NULLIF(lower(ltrim(btrim(COALESCE(p_username, '')), '@')), ''),
          COALESCE(NULLIF(btrim(p_title), ''), ''), (SELECT phone FROM public.clients WHERE id = v_client), v_client, p_lead, now())
  RETURNING id INTO v_chat;
  RETURN v_chat;
END $$;

CREATE FUNCTION public.tg_read(p_lead uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.tg_chats SET unread = 0 WHERE lead_id = p_lead AND unread > 0
$$;

CREATE FUNCTION public.tg_read_outbox(p_chat uuid, p_max_msg bigint, p_at timestamptz) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.tg_messages SET read_at = COALESCE(p_at, now())
  WHERE chat_id = p_chat AND direction = 'out' AND tg_msg_id <= p_max_msg AND read_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.tg_client_lead(uuid), public.tg_today_new(uuid),
  public.tg_link_chat(uuid, bigint, text, text, text, text),
  public.tg_log_message(uuid, bigint, text, text, jsonb, uuid, uuid, timestamptz),
  public.tg_send_target(uuid), public.tg_create_chat(uuid, uuid, bigint, text, text, text),
  public.tg_read(uuid), public.tg_read_outbox(uuid, bigint, timestamptz)
FROM PUBLIC, anon, authenticated;

-- ─── Lead source, files, live updates ───────────────────────────────────────

INSERT INTO public.crm_lead_sources (id, label, pipeline_id, enabled)
VALUES ('telegram', 'Telegram', (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy'), true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  -- The throwaway test image has no storage schema; production and the local stack do.
  IF to_regclass('storage.objects') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('telegram-files', 'telegram-files', false, 20971520)
    ON CONFLICT (id) DO NOTHING;
    CREATE POLICY "telegram files read sotuv" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'telegram-files' AND public.has_permission(auth.uid(), 'sotuv-crmn'));
    CREATE POLICY "telegram files upload sotuv" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'telegram-files' AND (public.has_permission(auth.uid(), 'sotuv-crmn') OR public.is_admin(auth.uid())));
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['tg_chats', 'tg_messages'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

COMMIT;
