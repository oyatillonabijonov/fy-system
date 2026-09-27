-- 055: optional receipts (chek) for payments and expenses.
-- Files live in a PRIVATE bucket (financial documents): read with the Moliya module,
-- upload with its edit right, no update/delete (a receipt is never replaced).
-- The money RPCs are untouched: the UI saves the payment/expense first, uploads to
-- '<kind>/<id>/<file>', then links it with attach_receipt.
BEGIN;

DO $$
BEGIN
  -- The throwaway test image has no storage schema; production and the local stack do.
  IF to_regclass('storage.objects') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('receipts', 'receipts', false, 10485760,
            ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    ON CONFLICT (id) DO NOTHING;

    CREATE POLICY "receipts read finance" ON storage.objects FOR SELECT
      USING (bucket_id = 'receipts' AND public.has_permission(auth.uid(), 'tadbirlar-moliya'));
    CREATE POLICY "receipts upload finance" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'receipts' AND public.can_edit_finance(auth.uid()));
  END IF;
END $$;

ALTER TABLE public.payments ADD COLUMN receipt_path text;
ALTER TABLE public.expenses ADD COLUMN receipt_path text;

CREATE OR REPLACE FUNCTION public.attach_receipt(p_kind text, p_id uuid, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current text;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF p_kind NOT IN ('payment', 'expense') OR p_path IS NULL
     OR p_path NOT LIKE p_kind || '/' || p_id::text || '/%' THEN
    RAISE EXCEPTION 'invalid_receipt_path';
  END IF;

  IF p_kind = 'payment' THEN
    SELECT receipt_path INTO v_current FROM public.payments WHERE id = p_id FOR UPDATE;
  ELSE
    SELECT receipt_path INTO v_current FROM public.expenses WHERE id = p_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'receipt_target_not_found';
  END IF;
  IF v_current IS NOT NULL THEN
    RAISE EXCEPTION 'receipt_exists';
  END IF;

  IF p_kind = 'payment' THEN
    UPDATE public.payments SET receipt_path = p_path WHERE id = p_id;
  ELSE
    UPDATE public.expenses SET receipt_path = p_path WHERE id = p_id;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.attach_receipt(text, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.attach_receipt(text, uuid, text) TO authenticated, service_role;

COMMIT;
