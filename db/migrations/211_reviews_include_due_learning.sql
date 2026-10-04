-- Reviews only excludes new introductions, not due short-interval learning.
BEGIN;
DO $patch$
DECLARE definition text;
 before text := $before$WHEN intrinsic_source='learning' AND p_card_filter='both' THEN 'learning'$before$;
 after text := $after$WHEN intrinsic_source='learning' AND p_card_filter IN ('both','review') THEN 'learning'$after$;
BEGIN
 SELECT pg_get_functiondef('private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,before,'')))/length(before) <> 1 THEN
  RAISE EXCEPTION 'due learning migration unexpected scheduler baseline';
 END IF;
 EXECUTE replace(definition,before,after);
END;
$patch$;
COMMIT;
