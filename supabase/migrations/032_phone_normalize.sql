-- Phone normalization: strip whitespace/dashes/parens, enforce +998XXXXXXXXX format
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cleaned text;
BEGIN
  -- Strip everything except digits and leading +
  cleaned := regexp_replace(p, '[^+\d]', '', 'g');

  -- Already +998XXXXXXXXX (13 chars)
  IF cleaned ~ '^\+998\d{9}$' THEN RETURN cleaned; END IF;

  -- 998XXXXXXXXX without + (12 digits)
  IF cleaned ~ '^998\d{9}$' THEN RETURN '+' || cleaned; END IF;

  -- 9-digit local number
  IF cleaned ~ '^\d{9}$' THEN RETURN '+998' || cleaned; END IF;

  -- Best-effort: return cleaned
  RETURN cleaned;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated, service_role;

-- Normalize all existing phones
UPDATE clients
SET phone = normalize_phone(phone)
WHERE phone IS NOT NULL
  AND phone <> normalize_phone(phone);
