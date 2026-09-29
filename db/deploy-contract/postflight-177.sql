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
