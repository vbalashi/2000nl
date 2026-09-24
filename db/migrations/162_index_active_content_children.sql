-- Resolve idiom explanations and examples by their owning Content Node.
-- The prior per-parent lookups scanned the entire content table once per
-- idiom because parent_content_node_id had no leading index.
BEGIN;

CREATE INDEX IF NOT EXISTS platform_v2_content_nodes_active_child_lookup_idx
  ON private.platform_v2_content_nodes (
    parent_content_node_id, kind, created_at, id
  )
  WHERE binding_state = 'active'
    AND parent_content_node_id IS NOT NULL;

COMMIT;
