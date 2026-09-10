-- Retire the compatibility scheduler entry points after every active caller
-- has moved to the explicit practice-aware contract from migration 132.
-- Historical migration files retain their definitions as provenance; this
-- forward migration removes the live public functions and their bypass names.

BEGIN;

DROP FUNCTION IF EXISTS public.get_next_card(
  uuid, text[], uuid[], uuid, text, text, text, text[]
);
DROP FUNCTION IF EXISTS public.get_next_filtered_card(
  uuid, text[], uuid[], uuid, text, text, text, text[], jsonb
);
DROP FUNCTION IF EXISTS public.get_next_card_without_known(
  uuid, text[], uuid[], uuid, text, text, text, text[]
);
DROP FUNCTION IF EXISTS public.get_next_filtered_card_without_known(
  uuid, text[], uuid[], uuid, text, text, text, text[], jsonb
);

COMMIT;
