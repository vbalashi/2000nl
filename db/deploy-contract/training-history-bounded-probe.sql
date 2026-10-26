BEGIN READ ONLY;
DO $probe$
DECLARE body text := pg_get_functiondef('public.get_recent_training_activity_v1(integer)'::regprocedure);
BEGIN
 IF (SELECT count(*) FROM regexp_matches(body,'LIMIT v_limit \+ 1','g'))<>4 THEN
  RAISE EXCEPTION 'history streams and global merge must be bounded'; END IF;
 IF to_regclass('public.training_word_review_recent_activity_idx') IS NULL
  OR to_regclass('public.training_word_start_recent_activity_idx') IS NULL
  OR to_regclass('public.training_exercise_recent_activity_idx') IS NULL THEN
  RAISE EXCEPTION 'history time indexes missing'; END IF;
END;
$probe$;
COMMIT;
