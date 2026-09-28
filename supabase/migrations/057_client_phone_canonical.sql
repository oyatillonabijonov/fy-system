-- 057: one canonical phone per client, enforced in the database.
--
-- clients_phone_unique (UNIQUE (phone) WHERE phone IS NOT NULL) compares raw
-- strings, and only the web normalized phones before writing — so
-- "998 90 123 45 67" from a webhook/mobile/RPC and "+998901234567" from the web
-- were two different values and the same person could be added twice. Now a
-- BEFORE trigger normalizes every insert/update (normalize_phone(), migration
-- 032) and turns junk ("", "+998", a lone prefix) into NULL, so the unique index
-- sees one form. Existing rows are rewritten only where the value changes.

CREATE OR REPLACE FUNCTION public.clean_client_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p IS NULL OR length(regexp_replace(p, '\D', '', 'g')) <= 3 THEN NULL
    ELSE public.normalize_phone(p)
  END;
$$;

CREATE OR REPLACE FUNCTION public.clients_normalize_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.phone := public.clean_client_phone(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_normalize_phone ON public.clients;
CREATE TRIGGER clients_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_normalize_phone();

-- Fails loudly (unique violation) if two existing rows collapse to one number —
-- merge them first; on 2026-09-28 prod had none.
UPDATE public.clients
SET phone = public.clean_client_phone(phone)
WHERE phone IS DISTINCT FROM public.clean_client_phone(phone);
