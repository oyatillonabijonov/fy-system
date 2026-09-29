-- 070: one bot, many groups — Sozlamalar → Integratsiyalar.
-- telegram_groups lists every chat the bot serves and what it does there; each
-- message kind goes only to the groups that have its switch on:
--   payments        payment / refund / void / cashback receipts (060)
--   expenses        new and voided expenses (new here — queued like payments)
--   task_digest     the 9:00 Vazifalar report (066)
--   task_reminders  deadline reminders (069)
--   task_bot        "@bot …" / "/vazifa@bot …" turns chat messages into tasks
-- The bot adds a group itself when it's added to one (all switches off), and
-- marks bot_status when it's removed. Managed by the new 'integratsiyalar'
-- module (admins always). amo-sync (table owner) reads it.

BEGIN;

-- New module id (also in auth.ts ModuleName/MODULES and admin-create-user VALID_MODULES)
ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS user_permissions_module_check;
ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_module_check
  CHECK (module IN ('dashboard', 'sotuv-crmn', 'mijozlar', 'tadbirlar', 'tadbirlar-moliya', 'sozlamalar', 'integratsiyalar'));

CREATE TABLE IF NOT EXISTS public.telegram_groups (
  chat_id        bigint      PRIMARY KEY,
  title          text        NOT NULL DEFAULT '',
  note           text        NOT NULL DEFAULT '',
  payments       boolean     NOT NULL DEFAULT false,
  expenses       boolean     NOT NULL DEFAULT false,
  task_digest    boolean     NOT NULL DEFAULT false,
  task_reminders boolean     NOT NULL DEFAULT false,
  task_bot       boolean     NOT NULL DEFAULT false,
  bot_status     text,       -- Telegram's member status ('member', 'administrator', 'left', 'kicked'); NULL = added by hand
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (chat_id < 0)        -- groups and channels only
);

ALTER TABLE public.telegram_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS telegram_groups_manage ON public.telegram_groups;
CREATE POLICY telegram_groups_manage ON public.telegram_groups FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'integratsiyalar'))
  WITH CHECK (public.has_permission(auth.uid(), 'integratsiyalar'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_groups TO authenticated;

-- Expenses join the receipt queue; sent_chats makes a retry skip groups already done
ALTER TABLE public.telegram_outbox ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE CASCADE;
ALTER TABLE public.telegram_outbox ADD COLUMN IF NOT EXISTS sent_chats bigint[] NOT NULL DEFAULT '{}';
ALTER TABLE public.telegram_outbox DROP CONSTRAINT IF EXISTS telegram_outbox_kind_check;
ALTER TABLE public.telegram_outbox ADD CONSTRAINT telegram_outbox_kind_check
  CHECK (kind IN ('payment', 'refund', 'void', 'cashback', 'expense', 'expense_void'));
ALTER TABLE public.telegram_outbox DROP CONSTRAINT IF EXISTS telegram_outbox_check;
ALTER TABLE public.telegram_outbox ADD CONSTRAINT telegram_outbox_one_source
  CHECK (num_nonnulls(payment_id, cashback_id, expense_id) = 1);

CREATE OR REPLACE FUNCTION public.telegram_enqueue_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.telegram_outbox (kind, expense_id) VALUES ('expense', NEW.id);
  ELSIF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
    INSERT INTO public.telegram_outbox (kind, expense_id) VALUES ('expense_void', NEW.id);
  ELSE
    RETURN NEW;
  END IF;
  PERFORM pg_notify('telegram_outbox', '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_enqueue_expense ON public.expenses;
CREATE TRIGGER telegram_enqueue_expense
  AFTER INSERT OR UPDATE OF voided_at ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.telegram_enqueue_expense();

COMMIT;
