-- Local-only characterization of real learning RPCs. All fixtures roll back.
-- psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -f scripts/diagnostics/learning-observability.sql
-- Add -v enforce=1 to assert the proposed product rule: Learn increments New.
-- Does not simulate browser sessions, memory, elapsed time, or the V2 action envelope.
\set ON_ERROR_STOP on
SELECT :'HOST' IN ('127.0.0.1','localhost') AND :'PORT'='54322' AS local_target \gset
\if :local_target
\else
\echo 'Refusing a target other than the documented local Supabase endpoint.'
\quit 2
\endif
\if :{?enforce}
\else
\set enforce 0
\endif
BEGIN;
SET LOCAL timezone = 'UTC';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF inet_server_port() IS DISTINCT FROM 5432 OR
     NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    RAISE EXCEPTION 'Expected local Supabase fixture database';
  END IF;
END $$;
CREATE TEMP TABLE observations (
  scenario text, stage text, introduced int, graded int,
  history_rows int, history_has_more boolean, footer_new int,
  learning_flags int, due_now int, min_interval_days numeric,
  sample_phase text, public_selection_source text, canonical_selection_source text
);
CREATE TEMP TABLE fixture_cards (id uuid, ordinal int);
CREATE FUNCTION pg_temp.snapshot(p_user uuid,p_list uuid,p_scenario text,p_stage text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE stats jsonb; selected jsonb;
BEGIN
  stats := get_detailed_training_stats(p_user,ARRAY['word-to-definition'],p_list,'curated');
  selected := get_next_card(p_user,ARRAY['word-to-definition'],ARRAY[]::uuid[],p_list,'curated','both','review',ARRAY[]::text[]);
  INSERT INTO observations
  SELECT p_scenario,p_stage,count(*)::int,
    count(*) FILTER (WHERE s.fsrs_reps > 0)::int,
    (SELECT count(*)::int FROM get_recent_training_review_history(50)),
    COALESCE((SELECT bool_or(has_more) FROM get_recent_training_review_history(50)),false),
    (stats->>'newWordsToday')::int,
    count(*) FILTER (WHERE s.in_learning)::int,
    count(*) FILTER (WHERE s.next_review_at <= now())::int,
    min(s.fsrs_last_interval),
    private.platform_v2_card_state_json(p_user,(SELECT id FROM fixture_cards WHERE ordinal=1),'word-to-definition')#>>'{scheduler,phase}',
    selected#>>'{stats,source}',
    (SELECT queue_source FROM private.training_scheduler_candidates_v1(
      p_user,ARRAY['word-to-definition'],p_list,'curated','both','review',
      ARRAY[]::uuid[],ARRAY[]::text[],'{}',false
    ) ORDER BY selection_order LIMIT 1)
  FROM user_card_status s WHERE s.user_id=p_user;
END $$;
DO $$
DECLARE n int; i int; u uuid; l uuid; e uuid;
BEGIN
  INSERT INTO languages(code,name) VALUES ('nl','Dutch') ON CONFLICT DO NOTHING;
  l:=gen_random_uuid();
  INSERT INTO word_lists(id,language_code,slug,name) VALUES(l,'nl','diagnostic-'||l,'Learning diagnostic');
  FOR i IN 1..100 LOOP
    INSERT INTO word_entries(language_code,headword,part_of_speech,gender,is_nt2_2000,raw)
    VALUES('nl','diagnostic-'||i,'noun','n',true,'{}') RETURNING id INTO e;
    INSERT INTO fixture_cards VALUES(e,i);
    INSERT INTO word_list_items(list_id,word_id,rank) VALUES(l,e,i);
  END LOOP;
  FOREACH n IN ARRAY ARRAY[5,10,50,100] LOOP
    u:=gen_random_uuid();
    INSERT INTO auth.users(id,email) VALUES(u,u||'@diagnostic.test');
    INSERT INTO user_settings(user_id,daily_new_limit,daily_review_limit,target_retention,mix_mode)
    VALUES(u,n,200,0.9,'mixed') ON CONFLICT(user_id) DO UPDATE SET daily_new_limit=n,target_retention=0.9;
    PERFORM set_config('request.jwt.claim.sub',u::text,true);
    FOR e IN SELECT id FROM fixture_cards WHERE ordinal<=n LOOP
      PERFORM start_learning_entry_card(u,e,'word-to-definition');
    END LOOP;
    PERFORM pg_temp.snapshot(u,l,n||' new','after Learn');
    IF n=5 THEN
      FOR e IN SELECT id FROM fixture_cards WHERE ordinal<=2 LOOP
        PERFORM handle_card_review(u,e,'word-to-definition','success',gen_random_uuid());
      END LOOP;
      PERFORM pg_temp.snapshot(u,l,'5 new','stopped after 2 first Good');
    END IF;
    FOR e IN SELECT id FROM fixture_cards WHERE ordinal<=n AND (n<>5 OR ordinal>2) LOOP
      PERFORM handle_card_review(u,e,'word-to-definition','success',gen_random_uuid());
    END LOOP;
    PERFORM pg_temp.snapshot(u,l,n||' new','after first Good');
  END LOOP;
  -- Isolate the proposed direct first Again without changing runtime capability guards.
  u:=gen_random_uuid();
  INSERT INTO auth.users(id,email) VALUES(u,u||'@diagnostic.test');
  INSERT INTO user_settings(user_id,daily_new_limit,target_retention) VALUES(u,10,0.9)
  ON CONFLICT(user_id) DO UPDATE SET target_retention=0.9;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  FOR e IN SELECT id FROM fixture_cards WHERE ordinal<=5 LOOP
    PERFORM handle_card_review(u,e,'word-to-definition','fail',gen_random_uuid());
  END LOOP;
  PERFORM pg_temp.snapshot(u,l,'5 direct Again','candidate, bypasses V2 guard');
END $$;
TABLE observations;
\if :enforce
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM observations WHERE stage='after Learn' AND footer_new<>introduced) THEN
    RAISE EXCEPTION 'PRODUCT EXPECTATION FAILED: Learn does not increment the New counter';
  END IF;
END $$;
\endif
ROLLBACK;
