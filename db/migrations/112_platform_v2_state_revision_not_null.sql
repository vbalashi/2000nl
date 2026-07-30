-- Finalize non-null with a validated check so SET NOT NULL does not rescan the
-- scheduler table while holding its short ACCESS EXCLUSIVE lock.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.user_card_status'::regclass
           AND conname = 'user_card_status_state_revision_not_null'
    ) THEN
        ALTER TABLE public.user_card_status
            ADD CONSTRAINT user_card_status_state_revision_not_null
            CHECK (state_revision IS NOT NULL) NOT VALID;
    END IF;
END;
$$;

ALTER TABLE public.user_card_status
    VALIDATE CONSTRAINT user_card_status_state_revision_not_null;

ALTER TABLE public.user_card_status
    ALTER COLUMN state_revision SET NOT NULL;

ALTER TABLE public.user_card_status
    DROP CONSTRAINT user_card_status_state_revision_not_null;
