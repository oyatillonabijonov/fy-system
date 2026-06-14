-- Sprint A: extra event-create form fields + participant tariff label.
-- The payment/cashback foundation already exists (035 payments table +
-- sync_participant_paid + auto_award_cashback); this migration only adds the
-- NEW columns the rebuilt event form (Sprint B) needs. Purely additive.
--
-- Type notes (deviating from the original spec to match existing conventions):
--   * money columns in this DB are numeric(12,2) (events.price, participant.paid),
--     so total_value is numeric(12,2), NOT bigint.
--   * events.date is timestamptz, so end_date is timestamptz for consistency.
--   * events.location already exists (do NOT re-add).

-- ─── events: new form fields ──────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS end_date    timestamptz,
  ADD COLUMN IF NOT EXISTS total_value numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manager_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS has_tariffs boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_events_manager ON public.events (manager_id);

-- ─── event_participants: tariff label (no price logic, label only) ─────────────
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS tariff text;

-- contact_id never had an FK to clients, so PostgREST couldn't embed the client
-- on payment/participant queries. Safe to add now (0 rows, 0 orphans); enables
-- getEventPayments / getRecentPayments to join client_name/client_phone.
-- (contact_id already has idx_event_participants_contact, so no new index needed.)
ALTER TABLE public.event_participants
  ADD CONSTRAINT event_participants_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES public.clients(id) ON DELETE SET NULL;
