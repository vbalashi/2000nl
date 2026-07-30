-- New scheduler rows receive revisions while the existing-row backfill runs.

ALTER TABLE public.user_card_status
    ALTER COLUMN state_revision SET DEFAULT gen_random_uuid();
