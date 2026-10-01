-- 077: Mijozlar lists customers, not leads. Every bitim needs a client row (072), so a person
-- who only came in as a lead (Sotuv "+ Bitim" = source 'sotuv', a form or a call = a lead
-- source id) is a lead until a bitim of theirs is won or they join an event. Everyone added
-- elsewhere (Mijozlar, imports, events) is a customer as before.
-- PostgREST computed field: GET /clients?is_customer=is.true. SECURITY DEFINER so the answer
-- doesn't depend on the caller's Sotuv/admin rights (crm_leads and crm_lead_sources have RLS);
-- it only tells about a row the caller can already read.

CREATE OR REPLACE FUNCTION public.is_customer(c public.clients)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NOT (COALESCE(c.source, '') = 'sotuv' OR EXISTS (SELECT 1 FROM public.crm_lead_sources s WHERE s.id = c.source))
      OR EXISTS (SELECT 1 FROM public.crm_leads l WHERE l.client_id = c.id AND l.is_won)
      OR EXISTS (SELECT 1 FROM public.event_participants p WHERE p.contact_id = c.id)
$$;
GRANT EXECUTE ON FUNCTION public.is_customer(public.clients) TO authenticated;
