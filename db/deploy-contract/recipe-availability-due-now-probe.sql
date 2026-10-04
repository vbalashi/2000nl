DO $availability$
DECLARE scheduler text; projection text; rpc text; config text[];
BEGIN
 SELECT prosrc INTO scheduler FROM pg_proc WHERE oid='private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure;
 SELECT prosrc INTO projection FROM pg_proc WHERE oid='private.training_recipe_eligible_cards_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure;
 IF strpos(projection,trim(split_part(scheduler,'), new_word_ranks AS (',1)))=0
   OR strpos(projection,'selection_order')>0 OR strpos(projection,'new_word_ranks')>0 THEN
  RAISE EXCEPTION 'availability projection drifted from unordered authoritative eligibility';
 END IF;
 SELECT prosrc INTO rpc FROM pg_proc WHERE oid='public.read_training_recipe_availability_v1(uuid,text[],uuid,text,jsonb,text)'::regprocedure;
 IF strpos(rpc,'p_user_id IS DISTINCT FROM (select auth.uid())')=0
  OR strpos(rpc,'private.training_idiom_source_nodes_v1')=0
  OR (length(rpc)-length(replace(rpc,'next_review_at<=v_now','')))/length('next_review_at<=v_now')<>2
  OR strpos(rpc,'v_day_end')>0
  OR strpos(rpc,'introduced')=0 THEN RAISE EXCEPTION 'availability auth or aggregate guards missing'; END IF;
 SELECT proconfig INTO config FROM pg_proc WHERE oid='private.training_recipe_eligible_cards_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure;
 IF NOT config @> ARRAY['enable_nestloop=off','jit=off'] THEN
  RAISE EXCEPTION 'availability bounded provenance join strategy missing';
 END IF;
 IF has_function_privilege('anon','public.read_training_recipe_availability_v1(uuid,text[],uuid,text,jsonb,text)','execute')
  OR NOT has_function_privilege('authenticated','public.read_training_recipe_availability_v1(uuid,text[],uuid,text,jsonb,text)','execute')
  OR has_function_privilege('authenticated','private.training_recipe_eligible_cards_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)','execute') THEN
  RAISE EXCEPTION 'availability execute grant fence missing';
 END IF;
END;
$availability$;
