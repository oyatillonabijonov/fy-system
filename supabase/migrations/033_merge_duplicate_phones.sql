-- Merge clients that share the same normalized phone.
-- Survivor = oldest (MIN created_at). Logged to activity_log.
-- Same-event conflict: duplicate's event_participant.contact_id set to NULL
-- (preserves the row's paid/price data, unlinks it from the deleted client).

DO $$
DECLARE
  rec         record;
  survivor_id uuid;
  dup_id      uuid;
  dup_ids     uuid[];
BEGIN
  -- Find phones with more than one client (after normalization already ran in 032)
  FOR rec IN
    SELECT phone, array_agg(id ORDER BY created_at ASC) AS ids
    FROM clients
    WHERE phone IS NOT NULL
    GROUP BY phone
    HAVING COUNT(*) > 1
  LOOP
    survivor_id := rec.ids[1];
    dup_ids     := rec.ids[2:]; -- everything except first

    FOREACH dup_id IN ARRAY dup_ids LOOP
      -- 1. Cashback transactions: re-point to survivor
      UPDATE cashback_transactions
      SET client_id = survivor_id
      WHERE client_id = dup_id;

      -- 2. event_participants: for rows that would conflict with survivor on same event,
      --    set contact_id = NULL to preserve payment/attendance data without FK clash.
      UPDATE event_participants
      SET contact_id = NULL
      WHERE contact_id = dup_id
        AND event_id IN (
          SELECT event_id FROM event_participants WHERE contact_id = survivor_id
        );

      -- 3. Remaining event_participants: re-point to survivor
      UPDATE event_participants
      SET contact_id = survivor_id
      WHERE contact_id = dup_id;

      -- 4. Accumulate cashback_balance into survivor
      UPDATE clients
      SET cashback_balance = cashback_balance +
            (SELECT COALESCE(cashback_balance, 0) FROM clients WHERE id = dup_id)
      WHERE id = survivor_id;

      -- 5. Log the merge
      INSERT INTO activity_log (entity_type, entity_id, action, actor_name, changes)
      VALUES (
        'clients',
        survivor_id::text,
        'updated',
        'system',
        jsonb_build_object(
          'event',          'phone_dedup_merge',
          'duplicate_id',   dup_id,
          'phone',          rec.phone,
          'reason',         'duplicate phone after 032_phone_normalize'
        )
      );

      -- 6. Delete the duplicate
      DELETE FROM clients WHERE id = dup_id;
    END LOOP;
  END LOOP;
END;
$$;
