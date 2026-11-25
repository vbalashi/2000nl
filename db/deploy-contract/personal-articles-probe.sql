DO $probe$
BEGIN
  IF to_regclass('private.article_members_v1') IS NULL
     OR NOT has_function_privilege('authenticated','public.save_personal_article_v1(text,text,text,jsonb,uuid,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.save_personal_article_v1(text,text,text,jsonb,uuid,jsonb)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.move_personal_meaning_v1(uuid,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.list_personal_move_targets_v1(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.list_personal_move_targets_v1(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.move_personal_meaning_v1(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Personal article contract missing';
  END IF;
END
$probe$;
