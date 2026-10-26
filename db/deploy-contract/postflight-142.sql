-- Retain all active scheduler guarantees, then verify the renderability gate.
\i db/deploy-contract/postflight-141.sql

DO $postflight_renderable_ordinary_candidates$
DECLARE
  renderability_gate regprocedure := to_regprocedure(
    'private.training_ordinary_direct_recall_renderable_v1(uuid,integer,text)'
  );
  refresh_unrenderable_gate regprocedure := to_regprocedure(
    'private.refresh_unrenderable_ordinary_direct_entry_v1(uuid)'
  );
  sync_unrenderable_gate regprocedure := to_regprocedure(
    'private.sync_unrenderable_ordinary_direct_entry_v1()'
  );
  unavailable_gate regprocedure := to_regprocedure(
    'private.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)'
  );
  legacy_unavailable_gate regprocedure := to_regprocedure(
    'private.mark_training_session_member_unavailable_base_v1(uuid,uuid,uuid,text,text)'
  );
  selector_definition text;
BEGIN
  IF renderability_gate IS NULL
     OR refresh_unrenderable_gate IS NULL
     OR sync_unrenderable_gate IS NULL
     OR unavailable_gate IS NULL
     OR legacy_unavailable_gate IS NULL
     OR to_regclass('private.unrenderable_ordinary_direct_entries_v1') IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed renderable-ordinary-signatures';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_state
    JOIN pg_class index_relation ON index_relation.oid = index_state.indexrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_relation.relnamespace
    WHERE index_namespace.nspname = 'private'
      AND index_relation.relname = 'platform_v2_content_nodes_active_root_kind_entry_idx'
      AND index_state.indisvalid
      AND index_state.indisready
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed renderable-ordinary-index';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc procedure_state
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure_state.proacl, acldefault('f', procedure_state.proowner))
    ) access_control
    WHERE procedure_state.oid IN (
      renderability_gate::oid,
      refresh_unrenderable_gate::oid,
      sync_unrenderable_gate::oid,
      unavailable_gate::oid,
      legacy_unavailable_gate::oid
    )
      AND access_control.privilege_type = 'EXECUTE'
      AND access_control.grantee IN (
        0,
        (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
        (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'),
        (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
      )
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed renderable-ordinary-security';
  END IF;

  selector_definition := upper(pg_get_functiondef(
    'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure
  ));
  IF position('UNRENDERABLE_DIRECT_ENTRIES AS MATERIALIZED' IN selector_definition) = 0
     OR position('UNRENDERABLE_ORDINARY_DIRECT_ENTRIES_V1' IN selector_definition) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed renderable-ordinary-routing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger trigger_state
    WHERE trigger_state.tgrelid = 'private.platform_v2_content_nodes'::regclass
      AND trigger_state.tgfoid = sync_unrenderable_gate::oid
      AND NOT trigger_state.tgisinternal
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed renderable-ordinary-refresh';
  END IF;
END
$postflight_renderable_ordinary_candidates$;
