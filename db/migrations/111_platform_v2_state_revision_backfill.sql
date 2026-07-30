-- Backfill outside the column-add transaction so the table is not held behind
-- the earlier ACCESS EXCLUSIVE schema lock for the duration of this update.
-- Fail closed at a scale that requires an operator-managed batched backfill.

DO $$
DECLARE
    v_pending_rows bigint;
BEGIN
    SELECT count(*)
      INTO v_pending_rows
      FROM public.user_card_status
     WHERE state_revision IS NULL;

    IF v_pending_rows > 100000 THEN
        RAISE EXCEPTION
            'platform_v2_state_revision_backfill_requires_batches: % rows',
            v_pending_rows;
    END IF;
END;
$$;

UPDATE public.user_card_status
   SET state_revision = gen_random_uuid()
 WHERE state_revision IS NULL;
