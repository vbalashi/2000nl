-- Bound report-atom revision scans to the requested entry.
-- The revision wrapper remains per-entry and preserves its fail-closed
-- semantics; this index removes the full active Content Node scan from each
-- report_atom_source call.

BEGIN;

CREATE INDEX IF NOT EXISTS platform_v2_content_nodes_active_entry_order_idx
  ON private.platform_v2_content_nodes (
    entry_id,
    source_order,
    id
  ) INCLUDE (
    kind,
    parent_content_node_id,
    canonical_source_text
  )
  WHERE binding_state = 'active';

COMMIT;
