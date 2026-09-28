-- 060: Telegram receipts — an outbox the amo-sync worker drains.
--
-- A row is queued, in the same transaction as the money change, for:
--   payment / refund  → a new payments row (kind),
--   void              → payments.voided_at set,
--   cashback          → a 'used' cashback_transactions row (debt paid with cashback).
-- pg_notify('telegram_outbox') wakes the worker at once; it renders a PNG receipt,
-- sends it to the group and stamps sent_at (retries up to 5 times, skips rows
-- older than a day so enabling the bot later doesn't flood the group).
-- Only the table owner (the worker's DB user) touches it: RLS on, no policies.

BEGIN;

CREATE TABLE IF NOT EXISTS public.telegram_outbox (
  id          bigserial   PRIMARY KEY,
  kind        text        NOT NULL CHECK (kind IN ('payment', 'refund', 'void', 'cashback')),
  payment_id  uuid        REFERENCES public.payments(id) ON DELETE CASCADE,
  cashback_id uuid        REFERENCES public.cashback_transactions(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,
  attempts    int         NOT NULL DEFAULT 0,
  last_error  text,
  CHECK ((payment_id IS NULL) <> (cashback_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_telegram_outbox_pending ON public.telegram_outbox (id) WHERE sent_at IS NULL;
ALTER TABLE public.telegram_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_outbox FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.telegram_enqueue_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.telegram_outbox (kind, payment_id) VALUES (NEW.kind, NEW.id);
  ELSIF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
    INSERT INTO public.telegram_outbox (kind, payment_id) VALUES ('void', NEW.id);
  ELSE
    RETURN NEW;
  END IF;
  PERFORM pg_notify('telegram_outbox', '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_enqueue_payment ON public.payments;
CREATE TRIGGER telegram_enqueue_payment
  AFTER INSERT OR UPDATE OF voided_at ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.telegram_enqueue_payment();

CREATE OR REPLACE FUNCTION public.telegram_enqueue_cashback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.telegram_outbox (kind, cashback_id) VALUES ('cashback', NEW.id);
  PERFORM pg_notify('telegram_outbox', '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_enqueue_cashback ON public.cashback_transactions;
CREATE TRIGGER telegram_enqueue_cashback
  AFTER INSERT ON public.cashback_transactions
  FOR EACH ROW WHEN (NEW.type = 'used' AND NEW.participant_id IS NOT NULL)
  EXECUTE FUNCTION public.telegram_enqueue_cashback();

COMMIT;
