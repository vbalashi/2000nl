-- Exercise the current selector and the public adapter kept for cached browser
-- bundles. Both reads remain inside the deployment gate's read-only transaction.
\i db/deploy-contract/pre-switch-read-probe-140.sql

DO $pre_switch_cached_client_scheduler$
DECLARE
  qa_user_id uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.get_next_card(
    qa_user_id,
    ARRAY['word-to-definition']::text[],
    ARRAY[]::uuid[],
    NULL,
    'curated',
    'both',
    'auto',
    ARRAY[]::text[]
  );

  PERFORM public.get_next_filtered_card(
    qa_user_id,
    ARRAY['word-to-definition']::text[],
    ARRAY[]::uuid[],
    NULL,
    'curated',
    'both',
    'auto',
    ARRAY[]::text[],
    '{}'::jsonb
  );
END
$pre_switch_cached_client_scheduler$;
