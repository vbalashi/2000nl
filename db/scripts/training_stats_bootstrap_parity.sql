-- Run from repository root after real compatibility+bootstrap in an OWNED fresh
-- disposable DB. No migration replay: verifies bootstrap installed230 itself.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^2000nl_fsrs_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'unsafe_bootstrap_stats_parity_database';
  END IF;
END $$;
\i apps/ui/tests/fsrs/fixtures/stats737Baseline.sql
\i db/deploy-contract/training-stats-totals-probe.sql
DO $parity$
DECLARE
  learner uuid := gen_random_uuid(); entry uuid := gen_random_uuid();
  list_id uuid := gen_random_uuid(); modes text[]; list_type text;
  expected jsonb; four_args jsonb; five_args jsonb;
  before_definition text;
BEGIN
  SELECT pg_get_functiondef('private.training_stats_totals_v1(uuid,text[],uuid,text)'::regprocedure)
    INTO before_definition;
  INSERT INTO auth.users(id,email) VALUES(learner,learner::text||'@bootstrap.local');
  PERFORM set_config('request.jwt.claim.sub',learner::text,true);
  INSERT INTO user_settings(user_id,daily_new_limit,training_schedule_timezone)
    VALUES(learner,7,'Europe/Amsterdam') ON CONFLICT(user_id) DO UPDATE
    SET daily_new_limit=7,training_schedule_timezone='Europe/Amsterdam';
  INSERT INTO languages(code,name) VALUES('nl','Dutch') ON CONFLICT DO NOTHING;
  INSERT INTO word_entries(id,language_code,headword,part_of_speech,is_nt2_2000,raw)
    VALUES(entry,'nl','bootstrap-stats-parity','noun',true,'{}');
  INSERT INTO user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,next_review_at)
    VALUES(learner,entry,'word-to-definition',true,now()-interval '1 day');
  INSERT INTO user_card_action_events(user_id,entry_id,card_type_id,action,action_payload_hash,created_at)
    SELECT learner,entry,'word-to-definition','start-learning','fixture',bounds.start_at+interval '1 minute'
    FROM private.training_study_day_bounds_v1(clock_timestamp(),'Europe/Amsterdam') bounds;
  INSERT INTO user_word_lists(id,user_id,language_code,primary_language_code,name)
    VALUES(list_id,learner,'nl','nl','Bootstrap stats parity');
  INSERT INTO user_word_list_items(list_id,word_id) VALUES(list_id,entry);
  FOREACH modes SLICE 1 IN ARRAY ARRAY[ARRAY['word-to-definition'],ARRAY['definition-to-word']] LOOP
    FOREACH list_type IN ARRAY ARRAY['user','curated',NULL::text,'invalid'] LOOP
      expected := private.stats737_baseline(learner,modes,list_id,list_type,'Pacific/Honolulu');
      four_args := public.get_detailed_training_stats(learner,modes,list_id,list_type);
      five_args := public.get_detailed_training_stats(learner,modes,list_id,list_type,'Pacific/Honolulu');
      IF expected IS DISTINCT FROM four_args OR expected IS DISTINCT FROM five_args THEN
        RAISE EXCEPTION 'bootstrap stats parity mismatch: %, %',modes,list_type;
      END IF;
    END LOOP;
  END LOOP;
  expected := private.stats737_baseline(learner,NULL,NULL,NULL,'UTC');
  IF expected IS DISTINCT FROM public.get_detailed_training_stats(learner,NULL,NULL,NULL)
     OR expected IS DISTINCT FROM public.get_detailed_training_stats(learner)
     OR expected IS DISTINCT FROM public.get_detailed_training_stats(learner,ARRAY[]::text[],NULL,NULL,'UTC') THEN
    RAISE EXCEPTION 'bootstrap stats defaults mismatch';
  END IF;
  four_args := public.get_detailed_training_stats(learner,ARRAY['word-to-definition'],list_id,'user');
  IF four_args->>'dailyNewLimit'<>'7' OR four_args->>'totalWordsLearned'<>'1'
     OR four_args->>'totalWordsInList'<>'1' OR four_args->>'learningStartedToday'<>'1'
     OR (SELECT count(*) FROM jsonb_object_keys(four_args))<>11 THEN
    RAISE EXCEPTION 'bootstrap stats fixture expectation mismatch: %',four_args;
  END IF;
  -- A bootstrap-only test must not install the candidate under test itself.
  IF before_definition IS DISTINCT FROM pg_get_functiondef('private.training_stats_totals_v1(uuid,text[],uuid,text)'::regprocedure) THEN
    RAISE EXCEPTION 'bootstrap parity replaced optimized function';
  END IF;
END;
$parity$;
ROLLBACK;
