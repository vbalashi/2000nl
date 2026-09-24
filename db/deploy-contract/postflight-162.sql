-- Keep every DB 161 contract and require the indexed child lookup used by
-- idiom explanation cardinality, explanation text, and owned examples.
\i db/deploy-contract/postflight-161.sql

BEGIN;
DO $postflight_content_child_lookup$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS idx
    WHERE idx.indexrelid =
      'private.platform_v2_content_nodes_active_child_lookup_idx'::regclass
      AND idx.indisvalid AND idx.indisready
      AND pg_get_indexdef(idx.indexrelid)
        ILIKE '%(parent_content_node_id, kind, created_at, id)%'
      AND pg_get_expr(idx.indpred, idx.indrelid)
        ILIKE '%binding_state%active%'
      AND pg_get_expr(idx.indpred, idx.indrelid)
        ILIKE '%parent_content_node_id IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed content-child-lookup';
  END IF;
END
$postflight_content_child_lookup$;
COMMIT;
