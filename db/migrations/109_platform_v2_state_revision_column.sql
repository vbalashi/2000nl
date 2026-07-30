-- Expand user_card_status without rewriting existing scheduler rows.
-- The volatile UUID default and non-null constraint are added in later
-- migrations so this ACCESS EXCLUSIVE lock remains metadata-only and brief.

ALTER TABLE public.user_card_status
    ADD COLUMN IF NOT EXISTS state_revision uuid;
