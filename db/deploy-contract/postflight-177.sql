\i db/deploy-contract/postflight-176.sql

BEGIN;
DO $batch_source_reconciliation_contract$
DECLARE
  batch_definition text;
  content_trigger_definition text;
  binding_trigger_definition text;
BEGIN
  IF to_regprocedure(
       'private.reconcile_platform_v2_source_batch_v1(jsonb,boolean)'
     ) IS NULL
     OR to_regprocedure(
       'private.begin_platform_v2_source_import_v1()'
     ) IS NULL
     OR to_regprocedure(
       'private.finish_platform_v2_source_import_v1()'
     ) IS NULL
     OR to_regprocedure(
       'private.refresh_unrenderable_ordinary_direct_entries_v1(uuid[])'
     ) IS NULL THEN
    RAISE EXCEPTION
      'db-contract-gate: batch source reconciliation functions missing';
  END IF;

  SELECT pg_get_functiondef(
    'private.reconcile_platform_v2_source_batch_v1(jsonb,boolean)'::regprocedure
  ) INTO batch_definition;
  SELECT pg_get_functiondef(
    'private.sync_unrenderable_ordinary_direct_entry_v1()'::regprocedure
  ) INTO content_trigger_definition;
  SELECT pg_get_functiondef(
    'private.sync_unrenderable_ordinary_direct_binding_v1()'::regprocedure
  ) INTO binding_trigger_definition;

  IF position('jsonb_array_length(p_rows) > 500' IN batch_definition) = 0
     OR position(
       'finish_platform_v2_source_import_v1'
       IN batch_definition
     ) = 0
     OR position(
       'drain_platform_v2_source_import_v1'
       IN batch_definition
     ) = 0
     OR position(
       'platform_v2_import_refresh_entries'
       IN content_trigger_definition
     ) = 0
     OR position(
       'platform_v2_import_refresh_groups'
       IN binding_trigger_definition
     ) = 0
     OR position(
       'refresh_unrenderable_ordinary_direct_group_v1'
       IN content_trigger_definition
     ) = 0
     OR position(
       'refresh_unrenderable_ordinary_direct_entry_v1'
       IN content_trigger_definition
     ) = 0
     OR position('TG_OP <> ''INSERT''' IN binding_trigger_definition) = 0
     OR position('TG_OP <> ''DELETE''' IN binding_trigger_definition) = 0
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_state
       WHERE trigger_state.tgrelid =
             'private.platform_v2_content_nodes'::regclass
         AND trigger_state.tgname =
             'ensure_platform_v2_content_import_flushed_v1'
         AND trigger_state.tgdeferrable
         AND trigger_state.tginitdeferred
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_state
       WHERE trigger_state.tgrelid =
             'private.source_entry_bindings'::regclass
         AND trigger_state.tgname =
             'ensure_platform_v2_binding_import_flushed_v1'
         AND trigger_state.tgdeferrable
         AND trigger_state.tginitdeferred
     ) THEN
    RAISE EXCEPTION
      'db-contract-gate: batch source reconciliation boundary changed';
  END IF;

  IF has_function_privilege(
       'anon',
       'private.reconcile_platform_v2_source_batch_v1(jsonb,boolean)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'private.reconcile_platform_v2_source_batch_v1(jsonb,boolean)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'private.reconcile_platform_v2_source_batch_v1(jsonb,boolean)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'db-contract-gate: batch source reconciliation privilege widened';
  END IF;
END
$batch_source_reconciliation_contract$;
COMMIT;

-- Migration 177 replaces two established row-trigger functions. Exercise the
-- ordinary (non-import) path behaviorally so a deployment cannot pass merely
-- because the replacement body still contains familiar function names.
BEGIN;
DO $ordinary_projection_trigger_contract$
DECLARE
  v_dictionary_id uuid;
  v_run_id uuid := gen_random_uuid();
  v_first_entry_id uuid := gen_random_uuid();
  v_old_group_entry_id uuid := gen_random_uuid();
  v_new_group_entry_id uuid := gen_random_uuid();
  v_example_node_id uuid;
BEGIN
  SELECT id INTO v_dictionary_id
  FROM public.dictionaries
  WHERE slug = 'nl-vandale';

  INSERT INTO private.dictionary_import_runs (
    id, dictionary_id, identity_scheme_version, artifact_format_version,
    manifest_checksum, input_checksum, source_record_count, artifact_count,
    status, actor, reason
  ) VALUES (
    v_run_id, v_dictionary_id, 'postflight-177-v1', 'postflight-v1',
    repeat('a', 64), repeat('b', 64), 3, 3, 'running',
    'postflight-177', 'ordinary trigger characterization'
  );

  INSERT INTO public.word_entries (
    id, dictionary_id, language_code, headword, meaning_id,
    part_of_speech, raw
  ) VALUES
    (v_first_entry_id, v_dictionary_id, 'nl', 'postflight-177-first', 1,
     'zn', '{}'::jsonb),
    (v_old_group_entry_id, v_dictionary_id, 'nl', 'postflight-177-old', 2,
     'zn', '{}'::jsonb),
    (v_new_group_entry_id, v_dictionary_id, 'nl', 'postflight-177-new', 2,
     'zn', '{}'::jsonb);

  INSERT INTO private.source_entry_bindings (
    dictionary_id, identity_scheme_version, source_entry_key,
    source_group_key, sense_ordinal, word_entry_id, binding_state,
    first_seen_run_id, last_seen_run_id, manifest_checksum,
    content_fingerprint_version, content_fingerprint,
    identity_evidence, reconciliation_decision
  ) VALUES
    (v_dictionary_id, 'postflight-177-v1', 'postflight-177:a:1',
     'postflight-177:a', 1, v_first_entry_id, 'active', v_run_id, v_run_id,
     repeat('a', 64), 'v1', repeat('1', 64), '{}'::jsonb, '{}'::jsonb),
    (v_dictionary_id, 'postflight-177-v1', 'postflight-177:a:2',
     'postflight-177:a', 2, v_old_group_entry_id, 'active', v_run_id, v_run_id,
     repeat('a', 64), 'v1', repeat('2', 64), '{}'::jsonb, '{}'::jsonb),
    (v_dictionary_id, 'postflight-177-v1', 'postflight-177:b:2',
     'postflight-177:b', 2, v_new_group_entry_id, 'active', v_run_id, v_run_id,
     repeat('a', 64), 'v1', repeat('3', 64), '{}'::jsonb, '{}'::jsonb);

  INSERT INTO private.platform_v2_content_nodes (
    entry_id, kind, binding_state, first_source_revision,
    last_source_revision, source_text_fingerprint, diagnostic_locator,
    identity_evidence, reconciliation_decision, canonical_source_text,
    source_order
  ) VALUES
    (v_first_entry_id, 'definition', 'active', 'postflight', 'postflight',
     repeat('1', 64), 'postflight:first:def', '{}'::jsonb, '{}'::jsonb,
     'first definition', 1),
    (v_first_entry_id, 'example', 'active', 'postflight', 'postflight',
     repeat('2', 64), 'postflight:first:example', '{}'::jsonb, '{}'::jsonb,
     'first example', 2),
    (v_old_group_entry_id, 'definition', 'active', 'postflight', 'postflight',
     repeat('3', 64), 'postflight:old:def', '{}'::jsonb, '{}'::jsonb,
     'old definition', 1),
    (v_new_group_entry_id, 'definition', 'active', 'postflight', 'postflight',
     repeat('4', 64), 'postflight:new:def', '{}'::jsonb, '{}'::jsonb,
     'new definition', 1),
    (v_new_group_entry_id, 'example', 'active', 'postflight', 'postflight',
     repeat('5', 64), 'postflight:new:example', '{}'::jsonb, '{}'::jsonb,
     'new example', 2);

  IF NOT EXISTS (
    SELECT 1 FROM private.unrenderable_ordinary_direct_entries_v1
    WHERE entry_id = v_old_group_entry_id
  ) THEN
    RAISE EXCEPTION
      'db-contract-gate: ordinary content insert did not refresh projection';
  END IF;

  INSERT INTO private.platform_v2_content_nodes (
    entry_id, kind, binding_state, first_source_revision,
    last_source_revision, source_text_fingerprint, diagnostic_locator,
    identity_evidence, reconciliation_decision, canonical_source_text,
    source_order
  ) VALUES (
    v_old_group_entry_id, 'example', 'active', 'postflight', 'postflight',
    repeat('6', 64), 'postflight:old:example', '{}'::jsonb, '{}'::jsonb,
    'old example', 2
  ) RETURNING id INTO v_example_node_id;

  IF EXISTS (
    SELECT 1 FROM private.unrenderable_ordinary_direct_entries_v1
    WHERE entry_id = v_old_group_entry_id
  ) THEN
    RAISE EXCEPTION
      'db-contract-gate: ordinary content insert left stale projection';
  END IF;

  DELETE FROM private.platform_v2_content_nodes WHERE id = v_example_node_id;
  IF NOT EXISTS (
    SELECT 1 FROM private.unrenderable_ordinary_direct_entries_v1
    WHERE entry_id = v_old_group_entry_id
  ) THEN
    RAISE EXCEPTION
      'db-contract-gate: ordinary content delete did not refresh projection';
  END IF;

  IF to_regclass('pg_temp.platform_v2_import_refresh_entries') IS NOT NULL THEN
    RAISE EXCEPTION
      'db-contract-gate: import marker leaked into ordinary-write postflight';
  END IF;

  UPDATE private.source_entry_bindings
  SET source_group_key = 'postflight-177:b'
  WHERE dictionary_id = v_dictionary_id
    AND identity_scheme_version = 'postflight-177-v1'
    AND source_entry_key = 'postflight-177:a:1';

  IF EXISTS (
    SELECT 1 FROM private.unrenderable_ordinary_direct_entries_v1
    WHERE entry_id = v_old_group_entry_id
  ) THEN
    RAISE EXCEPTION
      'db-contract-gate: ordinary binding move left stale old-group projection';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.unrenderable_ordinary_direct_entries_v1
    WHERE entry_id = v_new_group_entry_id
  ) THEN
    RAISE EXCEPTION
      'db-contract-gate: ordinary binding move changed new-group projection';
  END IF;
END
$ordinary_projection_trigger_contract$;
ROLLBACK;
