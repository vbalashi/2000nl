-- Backfill outside the column-add transaction so the table is not held behind
-- the earlier ACCESS EXCLUSIVE schema lock for the duration of this update.

UPDATE public.user_card_status
   SET state_revision = gen_random_uuid()
 WHERE state_revision IS NULL;
