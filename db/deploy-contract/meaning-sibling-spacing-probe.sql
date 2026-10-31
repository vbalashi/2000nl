-- Read-only metadata and synthetic ordering checks; no learner/corpus reads.
DO $probe$
DECLARE role_name text; actual uuid[];
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_proc
    WHERE oid='private.space_meaning_training_candidates_v1(jsonb,integer,integer,uuid[])'::regprocedure
      AND NOT prosecdef AND provolatile='i'
      AND proconfig @> ARRAY['search_path=pg_catalog, private']) THEN
    RAISE EXCEPTION 'meaning_spacing_helper_boundary';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_function_privilege(role_name,'private.space_meaning_training_candidates_v1(jsonb,integer,integer,uuid[])','EXECUTE')
      OR has_function_privilege(role_name,'private.training_session_members_v1(uuid,text[],uuid,text,text,jsonb,text,integer,text[],uuid[])','EXECUTE') THEN
      RAISE EXCEPTION 'meaning_spacing_private_function_exposed: %',role_name;
    END IF;
  END LOOP;
  IF position('v_recent' IN pg_get_functiondef('private.replan_training_session_remainder_v1(uuid,uuid)'::regprocedure))=0
    OR position('space_meaning_training_candidates_v1' IN pg_get_functiondef('private.training_session_members_v1(uuid,text[],uuid,text,text,jsonb,text,integer,text[],uuid[])'::regprocedure))=0 THEN
    RAISE EXCEPTION 'meaning_spacing_planner_binding';
  END IF;
  SELECT array_agg(entry_id ORDER BY session_ordinal) INTO actual
  FROM private.space_meaning_training_candidates_v1(
    '[{"entry_id":"00000000-0000-0000-0000-000000000001","card_type_id":"word-to-definition","queue_source":"review"},
      {"entry_id":"00000000-0000-0000-0000-000000000001","card_type_id":"definition-to-word","queue_source":"review"},
      {"entry_id":"00000000-0000-0000-0000-000000000002","card_type_id":"word-to-definition","queue_source":"review"},
      {"entry_id":"00000000-0000-0000-0000-000000000003","card_type_id":"word-to-definition","queue_source":"review"},
      {"entry_id":"00000000-0000-0000-0000-000000000004","card_type_id":"word-to-definition","queue_source":"review"}]'::jsonb,4,2);
  IF actual IS DISTINCT FROM ARRAY[
    '00000000-0000-0000-0000-000000000001'::uuid,'00000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid,'00000000-0000-0000-0000-000000000004'::uuid] THEN
    RAISE EXCEPTION 'meaning_spacing_session_tail_order';
  END IF;
END;
$probe$;
