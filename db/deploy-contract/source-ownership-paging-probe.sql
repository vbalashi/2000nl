-- Read-only ABI, privilege, cursor and authority boundary for source-kind pages.
DO $source_ownership$
DECLARE routine regprocedure; definition text;
BEGIN
 FOREACH routine IN ARRAY ARRAY[
  'public.read_personal_collection_catalog_v2(text,text,text,uuid,text,jsonb,integer,text)'::regprocedure,
  'public.read_training_collection_catalog_v2(text,text,jsonb,integer,text)'::regprocedure] LOOP
  IF NOT (SELECT prosecdef AND provolatile='s' AND proconfig @> ARRAY['search_path=pg_catalog, public, private, pg_temp'] FROM pg_proc WHERE oid=routine)
   OR NOT has_function_privilege('authenticated',routine,'EXECUTE') OR has_function_privilege('anon',routine,'EXECUTE') OR has_function_privilege('service_role',routine,'EXECUTE') THEN
   RAISE EXCEPTION 'db-contract-gate: source ownership RPC boundary changed: %',routine; END IF;
  definition:=pg_get_functiondef(routine);
  IF strpos(definition,'p_ownership NOT IN(''all'',''owned'',''received'')')=0
   OR strpos(definition,'''ownership-v2''')=0 OR strpos(definition,',p_ownership)')=0 THEN
   RAISE EXCEPTION 'db-contract-gate: source ownership validation/cursor changed: %',routine; END IF;
 END LOOP;
 routine:='private.training_collection_catalog_cohort_v2(uuid,text,text,uuid,text,integer,uuid[],text)'::regprocedure;
 IF has_function_privilege('authenticated',routine,'EXECUTE') OR has_function_privilege('anon',routine,'EXECUTE') OR has_function_privilege('service_role',routine,'EXECUTE') THEN
  RAISE EXCEPTION 'db-contract-gate: private training source cohort exposed'; END IF;
 definition:=pg_get_functiondef(routine);
 IF strpos(definition,'p_ownership IN(''all'',''owned'')')=0 OR strpos(definition,'p_ownership IN(''all'',''received'')')=0
  OR strpos(definition,'private.live_collection_access_paths_v1')=0 OR strpos(definition,'public.can_access_dictionary(p_user_id,dictionary.id,''read'')')=0
  OR strpos(definition,'counts.language_count,0)>1 AND COALESCE(counts.item_count,0)>0')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: training kind/language/received authority changed'; END IF;
 definition:=pg_get_functiondef('public.read_personal_collection_catalog_v2(text,text,text,uuid,text,jsonb,integer,text)'::regprocedure);
 IF strpos(definition,'private.collection_access_paths_for_user_v1(principal)')=0 OR strpos(definition,'max(COALESCE(direct.accepted_at,group_subscription.accepted_at))')=0
  OR strpos(definition,'count(DISTINCT member.language_code)>1')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: personal received paths/language changed'; END IF;
 IF strpos(pg_get_functiondef('public.read_personal_collection_catalog_v1(text,text,text,uuid,text,jsonb,integer)'::regprocedure),'p_limit,''all'')')=0
  OR strpos(pg_get_functiondef('public.read_training_collection_catalog_v1(text,text,jsonb,integer)'::regprocedure),'p_limit,''all'')')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: legacy catalog all wrapper changed'; END IF;
END;
$source_ownership$;
