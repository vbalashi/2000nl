-- Read-only probe for migration230. Do not enable rollout without integrated229.
DO $probe$
DECLARE signature regprocedure; definition text;
BEGIN
  signature := 'private.training_stats_totals_v1(uuid,text[],uuid,text)'::regprocedure;
  SELECT pg_get_functiondef(signature) INTO definition;
  IF definition NOT LIKE '%dailyNewLimit%' OR definition NOT LIKE '%totalWordsLearned%'
     OR definition NOT LIKE '%totalWordsInList%'
     OR definition LIKE '%user_review_log%' OR definition LIKE '%user_card_action_events%'
     OR definition NOT LIKE '%can_access_dictionary(p_user_id, w.dictionary_id, ''read'')%'
     OR definition NOT LIKE '%unauthorized: user_id does not match authenticated user%' THEN
    RAISE EXCEPTION 'stats totals projection contract mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid=signature AND
    (NOT prosecdef OR provolatile<>'s' OR pg_get_userbyid(proowner)<>'postgres'
     OR proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']))
     OR has_function_privilege('anon',signature,'EXECUTE')
     OR has_function_privilege('authenticated',signature,'EXECUTE')
     OR has_function_privilege('service_role',signature,'EXECUTE') THEN
    RAISE EXCEPTION 'stats totals private boundary mismatch';
  END IF;
  FOREACH signature IN ARRAY ARRAY[
    'public.get_detailed_training_stats(uuid,text[],uuid,text)'::regprocedure,
    'public.get_detailed_training_stats(uuid,text[],uuid,text,text)'::regprocedure
  ] LOOP
    IF NOT has_function_privilege('authenticated',signature,'EXECUTE')
       OR has_function_privilege('anon',signature,'EXECUTE')
       OR EXISTS(SELECT 1 FROM pg_proc WHERE oid=signature AND
         (NOT prosecdef OR provolatile<>'s' OR pg_get_userbyid(proowner)<>'postgres'
          OR proconfig IS DISTINCT FROM ARRAY['search_path=public, private, pg_temp'])) THEN
      RAISE EXCEPTION 'stats public overload boundary mismatch: %', signature;
    END IF;
  END LOOP;
  SELECT pg_get_functiondef('public.get_detailed_training_stats(uuid,text[],uuid,text,text)'::regprocedure) INTO definition;
  IF definition NOT LIKE '%private.training_stats_totals_v1(%'
     OR definition NOT LIKE '%private.training_local_daily_stats_v1(%'
     OR definition NOT LIKE '%private.training_user_timezone_v1(p_user_id)%'
     OR definition LIKE '%get_detailed_training_stats_utc_legacy_v1%' THEN
    RAISE EXCEPTION 'stats wrapper projection mismatch';
  END IF;
  SELECT pg_get_functiondef('private.training_local_daily_stats_v1(uuid,text[],uuid,text,text)'::regprocedure) INTO definition;
  IF definition NOT LIKE '%training_pair_exclusions%'
     OR definition NOT LIKE '%exclusion.entry_id=s.entry_id%'
     OR definition NOT LIKE '%training_study_day_bounds_v1%' THEN
    RAISE EXCEPTION 'stats effective local eligibility mismatch';
  END IF;
END;
$probe$;
