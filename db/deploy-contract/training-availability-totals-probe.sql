DO $probe$
DECLARE f regprocedure := 'public.read_training_recipe_availability_v1(uuid,text[],uuid,text,jsonb,text)'::regprocedure; definition text;
BEGIN
 definition := pg_get_functiondef(f);
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=f AND prosecdef)
    OR has_function_privilege('anon',f,'EXECUTE')
    OR NOT has_function_privilege('authenticated',f,'EXECUTE')
    OR strpos(definition,'''totalCards'',v_cards')=0
    OR strpos(definition,'''totalMeanings'',v_meanings')=0
    OR strpos(definition,'''totalWords'',v_words')=0
    OR strpos(definition,'p_user_id IS DISTINCT FROM ( SELECT auth.uid()')=0 AND strpos(definition,'p_user_id IS DISTINCT FROM (select auth.uid()')=0 THEN
  RAISE EXCEPTION 'training_availability_totals_contract';
 END IF;
END;
$probe$;
