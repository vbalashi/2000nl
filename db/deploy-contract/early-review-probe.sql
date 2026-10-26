DO $early_review_contract$
DECLARE body text;
BEGIN
  IF NOT private.training_review_early_v1('{"reviewTiming":"early"}', 'review')
     OR private.training_review_early_v1('{}', 'review') THEN
    RAISE EXCEPTION 'early review flag contract missing';
  END IF;
  BEGIN
    PERFORM private.training_review_early_v1('{"reviewTiming":"early"}', 'both');
    RAISE EXCEPTION 'early review must reject implicit policy widening';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid_training_review_timing' THEN RAISE; END IF;
  END;
  SELECT pg_get_functiondef('private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure) INTO body;
  IF strpos(body,'cards.introduced AND cards.fsrs_enabled=true')=0
     OR strpos(body,'THEN next_review_at END')=0
     OR strpos(body,'private.training_review_early_v1')=0 THEN
    RAISE EXCEPTION 'ordinary early-review eligibility or order missing';
  END IF;
  SELECT pg_get_functiondef('private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)'::regprocedure) INTO body;
  IF strpos(body,'introduced AND fsrs_enabled=true')=0
     OR strpos(body,'private.training_review_early_v1')=0 THEN
    RAISE EXCEPTION 'idiom early-review eligibility missing';
  END IF;
  SELECT pg_get_functiondef('private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)'::regprocedure) INTO body;
  IF strpos(body,'v_size=''all-due-today'' AND private.training_review_early_v1')=0
     OR strpos(body,'{state,nextReviewAt}')=0
     OR strpos(body,'idiom_training_session_start_idempotency_conflict')=0 THEN
    RAISE EXCEPTION 'idiom early all/order/receipt contract missing';
  END IF;
  IF has_function_privilege('authenticated','private.training_review_early_v1(jsonb,text)','EXECUTE')
     OR has_function_privilege('anon','private.training_review_early_v1(jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'early review helper must remain private';
  END IF;
END
$early_review_contract$;
