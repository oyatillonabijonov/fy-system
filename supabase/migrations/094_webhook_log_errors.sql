-- 094: no site application may vanish. A request the webhook refuses or fails on (wrong token, a body
-- that isn't JSON, a database error) is now kept in webhook_logs with the reason, so a lead can be
-- restored by hand; before this only requests that passed the token check were logged, and a failure
-- inside intake_lead() rolled its own log row back. Plus an index for spotting a retried request by
-- the form's event_id (093's crm_leads.capi).
BEGIN;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS error text;
CREATE INDEX IF NOT EXISTS idx_webhook_logs_errors ON public.webhook_logs (created_at) WHERE error IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_leads_capi_event ON public.crm_leads ((capi->>'event_id')) WHERE capi IS NOT NULL;
COMMIT;
