-- COPY into transaction-local staging, bulk-create nodes without history,
-- and use the established identity reconciler only for changed existing nodes.
BEGIN;

CREATE OR REPLACE FUNCTION private.begin_staged_source_import_v1()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
BEGIN
  PERFORM private.begin_platform_v2_source_import_v1();
  CREATE TEMP TABLE pg_temp.platform_v2_source_stage (
    payload jsonb NOT NULL
  ) ON COMMIT DROP;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.apply_staged_source_import_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  v_row record;
  v_started timestamptz := clock_timestamp();
  v_bindings_seconds double precision;
  v_nodes_seconds double precision;
  v_projection_seconds double precision;
  v_new_entries integer;
  v_reconciled_entries integer := 0;
  v_refreshed_entries integer;
BEGIN
  IF to_regclass('pg_temp.platform_v2_source_stage') IS NULL
     OR to_regclass('pg_temp.platform_v2_import_refresh_entries') IS NULL THEN
    RAISE EXCEPTION 'platform_v2_source_import_not_started';
  END IF;

  CREATE TEMP TABLE pg_temp.platform_v2_staged_rows ON COMMIT DROP AS
  SELECT source.* FROM pg_temp.platform_v2_source_stage AS stage
  CROSS JOIN LATERAL jsonb_to_record(stage.payload) AS source (
    dictionary_id uuid, identity_scheme_version text, source_entry_key text,
    source_group_key text, sense_ordinal integer, word_entry_id uuid,
    run_id uuid, manifest_checksum text, content_fingerprint_version text,
    content_fingerprint text, identity_evidence jsonb,
    reconciliation_decision jsonb, nodes jsonb
  );
  CREATE UNIQUE INDEX ON pg_temp.platform_v2_staged_rows (word_entry_id);
  CREATE UNIQUE INDEX ON pg_temp.platform_v2_staged_rows (
    dictionary_id, identity_scheme_version, source_entry_key
  );
  IF EXISTS (
    SELECT 1 FROM pg_temp.platform_v2_staged_rows
    WHERE jsonb_typeof(nodes) IS DISTINCT FROM 'array'
       OR NULLIF(trim(manifest_checksum), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'platform_v2_invalid_content_nodes';
  END IF;

  INSERT INTO private.source_entry_bindings (
    dictionary_id, identity_scheme_version, source_entry_key,
    source_group_key, sense_ordinal, word_entry_id, binding_state,
    first_seen_run_id, last_seen_run_id, manifest_checksum,
    content_fingerprint_version, content_fingerprint, identity_evidence,
    reconciliation_decision
  )
  SELECT dictionary_id, identity_scheme_version, source_entry_key,
         source_group_key, sense_ordinal, word_entry_id, 'active',
         run_id, run_id, manifest_checksum, content_fingerprint_version,
         content_fingerprint, identity_evidence, reconciliation_decision
  FROM pg_temp.platform_v2_staged_rows
  ON CONFLICT (dictionary_id, identity_scheme_version, source_entry_key)
  DO UPDATE SET
    last_seen_run_id = excluded.last_seen_run_id,
    manifest_checksum = excluded.manifest_checksum,
    content_fingerprint_version = excluded.content_fingerprint_version,
    content_fingerprint = excluded.content_fingerprint,
    identity_evidence = excluded.identity_evidence,
    reconciliation_decision = excluded.reconciliation_decision,
    updated_at = now();

  -- Release metadata alone does not change training eligibility. Touch the
  -- trigger's structural columns only if the actual binding changed.
  UPDATE private.source_entry_bindings AS target
  SET source_group_key = source.source_group_key,
      sense_ordinal = source.sense_ordinal,
      word_entry_id = source.word_entry_id,
      binding_state = 'active'
  FROM pg_temp.platform_v2_staged_rows AS source
  WHERE target.dictionary_id = source.dictionary_id
    AND target.identity_scheme_version = source.identity_scheme_version
    AND target.source_entry_key = source.source_entry_key
    AND ROW(target.source_group_key, target.sense_ordinal,
            target.word_entry_id, target.binding_state) IS DISTINCT FROM
        ROW(source.source_group_key, source.sense_ordinal,
            source.word_entry_id, 'active'::text);
  v_bindings_seconds := extract(epoch FROM clock_timestamp() - v_started);
  v_started := clock_timestamp();

  CREATE TEMP TABLE pg_temp.platform_v2_staged_nodes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    entry_id uuid NOT NULL,
    source_revision text NOT NULL,
    source_order integer NOT NULL,
    input_key text NOT NULL,
    kind text NOT NULL,
    source_path text NOT NULL,
    source_native_key text,
    fingerprint text NOT NULL,
    parent_input_key text,
    source_text text,
    PRIMARY KEY (entry_id, input_key)
  ) ON COMMIT DROP;
  IF EXISTS (
    SELECT 1 FROM pg_temp.platform_v2_staged_rows AS source
    CROSS JOIN LATERAL jsonb_array_elements(source.nodes) AS node(value)
    WHERE node.value ? 'sourceText' AND (
      jsonb_typeof(node.value->'sourceText') IS DISTINCT FROM 'string'
      OR NULLIF(trim(node.value->>'sourceText'), '') IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'platform_v2_invalid_content_node_text';
  END IF;
  INSERT INTO pg_temp.platform_v2_staged_nodes (
    entry_id, source_revision, source_order, input_key, kind, source_path,
    source_native_key, fingerprint, parent_input_key, source_text
  )
  SELECT source.word_entry_id, source.manifest_checksum, node.ordinality,
         NULLIF(trim(node.value->>'inputKey'), ''),
         NULLIF(trim(node.value->>'kind'), ''),
         NULLIF(trim(node.value->>'sourcePath'), ''),
         NULLIF(trim(node.value->>'sourceNativeKey'), ''),
         NULLIF(trim(node.value->>'sourceTextFingerprint'), ''),
         NULLIF(trim(node.value->>'parentInputKey'), ''),
         CASE WHEN node.value ? 'sourceText'
              THEN normalize(trim(node.value->>'sourceText'), NFC) END
  FROM pg_temp.platform_v2_staged_rows AS source
  CROSS JOIN LATERAL jsonb_array_elements(source.nodes)
    WITH ORDINALITY AS node(value, ordinality);
  IF EXISTS (
    SELECT 1 FROM pg_temp.platform_v2_staged_nodes
    WHERE kind NOT IN ('definition', 'usage-pattern', 'example', 'idiom',
                      'idiom-explanation', 'usage-note')
  ) THEN
    RAISE EXCEPTION 'platform_v2_invalid_content_node';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.platform_v2_staged_nodes
    WHERE source_native_key IS NOT NULL
    GROUP BY entry_id, kind, source_native_key HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'platform_v2_duplicate_native_content_identity';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.platform_v2_staged_nodes AS child
    LEFT JOIN pg_temp.platform_v2_staged_nodes AS parent
      ON parent.entry_id = child.entry_id
     AND parent.input_key = child.parent_input_key
    WHERE child.parent_input_key IS NOT NULL
      AND (parent.id IS NULL OR parent.id = child.id)
  ) THEN
    RAISE EXCEPTION 'platform_v2_content_node_parent_not_found';
  END IF;

  -- Presence includes retired nodes: never use the fresh path to replace history.
  CREATE TEMP TABLE pg_temp.platform_v2_fresh_entries ON COMMIT DROP AS
  SELECT source.word_entry_id AS entry_id
  FROM pg_temp.platform_v2_staged_rows AS source
  WHERE NOT EXISTS (
    SELECT 1 FROM private.platform_v2_content_nodes AS node
    WHERE node.entry_id = source.word_entry_id
  );
  CREATE UNIQUE INDEX ON pg_temp.platform_v2_fresh_entries (entry_id);
  SELECT count(*) INTO v_new_entries FROM pg_temp.platform_v2_fresh_entries;
  ANALYZE pg_temp.platform_v2_staged_nodes;

  -- Insert all nodes with no parent first, then link them after every parent
  -- exists. This retains the existing parent validation trigger for both writes.
  INSERT INTO private.platform_v2_content_nodes (
    id, entry_id, kind, binding_state, first_source_revision,
    last_source_revision, source_native_key, source_text_fingerprint,
    diagnostic_locator, identity_evidence, reconciliation_decision,
    canonical_source_text, source_order
  )
  SELECT node.id, node.entry_id, node.kind, 'active', node.source_revision,
         node.source_revision, node.source_native_key, node.fingerprint,
         node.source_path,
         jsonb_strip_nulls(jsonb_build_object(
           'sourceNativeKey', node.source_native_key,
           'sourceTextFingerprint', node.fingerprint
         )),
         jsonb_build_object('decision', CASE
           WHEN node.source_native_key IS NOT NULL THEN 'new-native'
           WHEN count(*) OVER (
             PARTITION BY node.entry_id, node.kind, node.fingerprint,
                          node.source_native_key
           ) > 1 THEN 'new-ambiguous-duplicate'
           ELSE 'new-unmatched' END),
         node.source_text, node.source_order
  FROM pg_temp.platform_v2_staged_nodes AS node
  JOIN pg_temp.platform_v2_fresh_entries AS fresh USING (entry_id);

  UPDATE private.platform_v2_content_nodes AS target
  SET parent_content_node_id = parent.id
  FROM pg_temp.platform_v2_staged_nodes AS child
  JOIN pg_temp.platform_v2_fresh_entries AS fresh USING (entry_id)
  JOIN pg_temp.platform_v2_staged_nodes AS parent
    ON parent.entry_id = child.entry_id
   AND parent.input_key = child.parent_input_key
  WHERE target.id = child.id;

  -- Compare actual stored content rather than trusting just the release hash:
  -- repair missing/altered nodes and ordering when applying a changed manifest.
  FOR v_row IN
    SELECT source.word_entry_id, source.manifest_checksum, source.nodes
    FROM pg_temp.platform_v2_staged_rows AS source
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_temp.platform_v2_fresh_entries AS fresh
      WHERE fresh.entry_id = source.word_entry_id
    ) AND (
      jsonb_array_length(source.nodes) <> (
        SELECT count(*) FROM private.platform_v2_content_nodes AS stored
        WHERE stored.entry_id = source.word_entry_id
          AND stored.binding_state = 'active'
      ) OR EXISTS (
        SELECT 1 FROM pg_temp.platform_v2_staged_nodes AS incoming
        LEFT JOIN pg_temp.platform_v2_staged_nodes AS incoming_parent
          ON incoming_parent.entry_id = incoming.entry_id
         AND incoming_parent.input_key = incoming.parent_input_key
        LEFT JOIN private.platform_v2_content_nodes AS stored
          ON stored.entry_id = incoming.entry_id
         AND stored.source_order = incoming.source_order
         AND stored.binding_state = 'active'
        LEFT JOIN private.platform_v2_content_nodes AS stored_parent
          ON stored_parent.id = stored.parent_content_node_id
        WHERE incoming.entry_id = source.word_entry_id
          AND (stored.id IS NULL OR
            ROW(stored.kind, stored.diagnostic_locator,
                stored.source_native_key, stored.source_text_fingerprint,
                stored.canonical_source_text, stored_parent.diagnostic_locator)
            IS DISTINCT FROM
            ROW(incoming.kind, incoming.source_path,
                incoming.source_native_key, incoming.fingerprint,
                incoming.source_text, incoming_parent.source_path)
          )
      )
    )
  LOOP
    PERFORM private.reconcile_platform_v2_content_nodes(
      v_row.word_entry_id, v_row.manifest_checksum, v_row.nodes
    );
    v_reconciled_entries := v_reconciled_entries + 1;
  END LOOP;

  UPDATE private.platform_v2_content_nodes AS node
  SET last_source_revision = source.manifest_checksum
  FROM pg_temp.platform_v2_staged_rows AS source
  WHERE node.entry_id = source.word_entry_id
    AND node.binding_state = 'active'
    AND node.last_source_revision IS DISTINCT FROM source.manifest_checksum;
  v_nodes_seconds := extract(epoch FROM clock_timestamp() - v_started);
  v_started := clock_timestamp();
  v_refreshed_entries := private.finish_platform_v2_source_import_v1();
  v_projection_seconds := extract(epoch FROM clock_timestamp() - v_started);

  DROP TABLE pg_temp.platform_v2_staged_nodes;
  DROP TABLE pg_temp.platform_v2_fresh_entries;
  DROP TABLE pg_temp.platform_v2_staged_rows;
  DROP TABLE pg_temp.platform_v2_source_stage;
  RETURN jsonb_build_object(
    'fresh_entries', v_new_entries,
    'reconciled_entries', v_reconciled_entries,
    'refreshed_entries', v_refreshed_entries,
    'binding_seconds', v_bindings_seconds,
    'node_seconds', v_nodes_seconds,
    'projection_seconds', v_projection_seconds
  );
END;
$fn$;

-- A group has a predecessor definition iff its minimum ordinary ordinal is
-- smaller. Aggregate root content once rather than joining each node to every
-- predecessor, then rebuild all queued entries in one set operation.
CREATE OR REPLACE FUNCTION private.drain_platform_v2_source_import_v1()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE v_count integer;
BEGIN
  IF to_regclass('pg_temp.platform_v2_import_refresh_entries') IS NULL THEN
    RETURN 0;
  END IF;
  INSERT INTO pg_temp.platform_v2_import_refresh_entries (entry_id)
  SELECT binding.word_entry_id
  FROM private.source_entry_bindings AS binding
  JOIN pg_temp.platform_v2_import_refresh_groups AS queued
    USING (dictionary_id, identity_scheme_version, source_group_key)
  WHERE binding.binding_state = 'active'
  ON CONFLICT DO NOTHING;
  SELECT count(*) INTO v_count FROM pg_temp.platform_v2_import_refresh_entries;
  IF v_count = 0 THEN RETURN 0; END IF;
  ANALYZE pg_temp.platform_v2_import_refresh_entries;
  DELETE FROM private.unrenderable_ordinary_direct_entries_v1 AS target
  USING pg_temp.platform_v2_import_refresh_entries AS affected
  WHERE target.entry_id = affected.entry_id;
  WITH root_content AS MATERIALIZED (
    SELECT node.entry_id, bool_or(node.kind = 'definition') AS has_definition,
           bool_or(node.kind = 'example') AS has_example
    FROM private.platform_v2_content_nodes AS node
    WHERE node.binding_state = 'active'
      AND node.parent_content_node_id IS NULL
      AND node.kind IN ('definition', 'example')
    GROUP BY node.entry_id
  ), first_ordinary AS MATERIALIZED (
    SELECT binding.dictionary_id, binding.identity_scheme_version,
           binding.source_group_key, min(binding.sense_ordinal) AS ordinal
    FROM private.source_entry_bindings AS binding
    JOIN root_content ON root_content.entry_id = binding.word_entry_id
    WHERE binding.binding_state = 'active' AND root_content.has_definition
    GROUP BY binding.dictionary_id, binding.identity_scheme_version,
             binding.source_group_key
  )
  INSERT INTO private.unrenderable_ordinary_direct_entries_v1 (entry_id)
  SELECT entry.id
  FROM pg_temp.platform_v2_import_refresh_entries AS affected
  JOIN public.word_entries AS entry ON entry.id = affected.entry_id
  JOIN root_content ON root_content.entry_id = entry.id
  LEFT JOIN private.source_entry_bindings AS binding
    ON binding.word_entry_id = entry.id AND binding.binding_state = 'active'
  LEFT JOIN first_ordinary
    ON first_ordinary.dictionary_id = binding.dictionary_id
   AND first_ordinary.identity_scheme_version = binding.identity_scheme_version
   AND first_ordinary.source_group_key = binding.source_group_key
  WHERE root_content.has_definition AND NOT root_content.has_example
    AND (first_ordinary.ordinal < binding.sense_ordinal OR
         (binding.word_entry_id IS NULL AND COALESCE(entry.meaning_id, 1) > 1));
  TRUNCATE pg_temp.platform_v2_import_refresh_entries;
  TRUNCATE pg_temp.platform_v2_import_refresh_groups;
  RETURN v_count;
END;
$fn$;

ALTER FUNCTION private.begin_staged_source_import_v1() OWNER TO postgres;
ALTER FUNCTION private.apply_staged_source_import_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.begin_staged_source_import_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.apply_staged_source_import_v1()
  FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
