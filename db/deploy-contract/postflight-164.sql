-- Preserve every prior contract and require the entry-scoped report-atom
-- lookup used by the presentation identity wrapper.
\i db/deploy-contract/postflight-163.sql

BEGIN;
DO $postflight_report_atom_entry_lookup$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS idx
    WHERE idx.indexrelid =
      'private.platform_v2_content_nodes_active_entry_order_idx'::regclass
      AND idx.indisvalid
      AND idx.indisready
      AND pg_get_indexdef(idx.indexrelid)
        ILIKE '%(entry_id, source_order, id)%'
      AND pg_get_indexdef(idx.indexrelid)
        ILIKE '%INCLUDE (kind, parent_content_node_id, canonical_source_text)%'
      AND pg_get_expr(idx.indpred, idx.indrelid)
        ILIKE '%binding_state%active%'
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed report-atom-entry-lookup';
  END IF;
END
$postflight_report_atom_entry_lookup$;
COMMIT;
