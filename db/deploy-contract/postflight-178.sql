\i db/deploy-contract/postflight-177.sql

BEGIN;
DO $staged_import_contract$
DECLARE
  v_dictionary uuid;
  v_run uuid := gen_random_uuid();
  v_first uuid := gen_random_uuid();
  v_second uuid := gen_random_uuid();
  v_saved_node uuid;
  v_result jsonb;
  v_source jsonb;
  v_definition jsonb := jsonb_build_object(
    'inputKey', 'definition', 'kind', 'definition',
    'sourcePath', 'raw.meanings[0].definition',
    'sourceTextFingerprint', repeat('a', 64), 'sourceText', 'definition'
  );
  v_proc regprocedure;
BEGIN
  FOREACH v_proc IN ARRAY ARRAY[
    'private.begin_staged_source_import_v1()'::regprocedure,
    'private.apply_staged_source_import_v1()'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', v_proc, 'EXECUTE')
       OR has_function_privilege('authenticated', v_proc, 'EXECUTE')
       OR has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION 'db-contract-gate: staged import privilege widened';
    END IF;
  END LOOP;
  SELECT id INTO v_dictionary FROM public.dictionaries WHERE slug = 'nl-vandale';
  INSERT INTO private.dictionary_import_runs (
    id, dictionary_id, identity_scheme_version, artifact_format_version,
    manifest_checksum, input_checksum, source_record_count, artifact_count, status
  ) VALUES (v_run, v_dictionary, 'postflight-178', 'v1',
            repeat('a', 64), repeat('b', 64), 2, 2, 'running');
  INSERT INTO public.word_entries (
    id, dictionary_id, language_code, headword, meaning_id, raw
  ) VALUES (v_first, v_dictionary, 'nl', 'postflight-178', 1, '{}'::jsonb),
           (v_second, v_dictionary, 'nl', 'postflight-178', 2, '{}'::jsonb);
  v_source := jsonb_build_object(
    'dictionary_id', v_dictionary, 'identity_scheme_version', 'postflight-178',
    'source_group_key', 'postflight-178', 'run_id', v_run,
    'manifest_checksum', repeat('a', 64),
    'content_fingerprint_version', 'v1', 'content_fingerprint', repeat('b', 64),
    'identity_evidence', '{}'::jsonb, 'reconciliation_decision', '{}'::jsonb,
    'nodes', jsonb_build_array(v_definition)
  );
  PERFORM private.begin_staged_source_import_v1();
  INSERT INTO pg_temp.platform_v2_source_stage (payload) VALUES
    (v_source || jsonb_build_object('word_entry_id', v_first,
       'source_entry_key', 'postflight-178:1', 'sense_ordinal', 1)),
    (v_source || jsonb_build_object('word_entry_id', v_second,
       'source_entry_key', 'postflight-178:2', 'sense_ordinal', 2));
  v_result := private.apply_staged_source_import_v1();
  IF (v_result->>'fresh_entries')::integer <> 2
     OR (v_result->>'reconciled_entries')::integer <> 0
     OR (v_result->>'refreshed_entries')::integer <> 2
     OR NOT EXISTS (SELECT 1 FROM private.unrenderable_ordinary_direct_entries_v1
                    WHERE entry_id = v_second)
     OR EXISTS (SELECT 1 FROM private.unrenderable_ordinary_direct_entries_v1
                WHERE entry_id = v_first) THEN
    RAISE EXCEPTION 'db-contract-gate: staged fresh/projection semantics changed';
  END IF;
  SELECT id INTO v_saved_node FROM private.platform_v2_content_nodes
  WHERE entry_id = v_second AND binding_state = 'active';
  PERFORM private.begin_staged_source_import_v1();
  INSERT INTO pg_temp.platform_v2_source_stage (payload) VALUES
    (v_source || jsonb_build_object('word_entry_id', v_first,
       'source_entry_key', 'postflight-178:1', 'sense_ordinal', 1,
       'nodes', jsonb_build_array(v_definition || jsonb_build_object(
         'sourceTextFingerprint', repeat('c', 64), 'sourceText', 'changed'
       )))),
    (v_source || jsonb_build_object('word_entry_id', v_second,
       'source_entry_key', 'postflight-178:2', 'sense_ordinal', 2));
  v_result := private.apply_staged_source_import_v1();
  IF (v_result->>'reconciled_entries')::integer <> 1
     OR NOT EXISTS (SELECT 1 FROM private.platform_v2_content_nodes
                    WHERE id = v_saved_node AND binding_state = 'active')
     OR to_regclass('pg_temp.platform_v2_source_stage') IS NOT NULL
     OR to_regclass('pg_temp.platform_v2_import_refresh_entries') IS NOT NULL THEN
    RAISE EXCEPTION 'db-contract-gate: staged update identity/cleanup changed';
  END IF;
  DELETE FROM private.platform_v2_content_nodes
  WHERE entry_id IN (v_first, v_second);
  DELETE FROM private.source_entry_bindings WHERE first_seen_run_id = v_run;
  DELETE FROM public.word_entries WHERE id IN (v_first, v_second);
  DELETE FROM private.dictionary_import_runs WHERE id = v_run;
END;
$staged_import_contract$;
COMMIT;
