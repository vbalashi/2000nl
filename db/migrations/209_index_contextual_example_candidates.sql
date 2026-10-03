-- Index the exact authoritative contextual example predicate (migration174).
-- No eligibility, scheduling, or stored learning-state changes.
BEGIN;
CREATE INDEX platform_v2_content_nodes_active_raw_example_entry_idx
ON private.platform_v2_content_nodes (entry_id)
WHERE kind = 'example'
  AND binding_state = 'active'
  AND NULLIF(btrim(diagnostic_locator), '') IS NOT NULL
  AND diagnostic_locator ~ '^raw\.meanings\[[0-9]+\]\.examples\[[0-9]+\]$';
COMMIT;
