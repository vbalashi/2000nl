-- The six-argument planning endpoint was routed to the canonical v2 candidate
-- relation in migration 143. The private count-only helper is therefore no
-- longer a runtime compatibility surface and must not remain as a second
-- scheduler implementation.

BEGIN;

DROP FUNCTION IF EXISTS private.default_training_session_plan_counts_v1(
  uuid, text[], text, text, jsonb
);

COMMIT;
