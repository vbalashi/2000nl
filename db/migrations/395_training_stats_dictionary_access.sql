BEGIN;

DO $migration$
DECLARE
  old_predicate constant text := 'can_access_dictionary(p_user_id, w.dictionary_id, ''read'')';
  new_predicate constant text := $predicate$w.dictionary_id = ANY(ARRAY(
          SELECT d.id
          FROM public.dictionaries d
          WHERE public.can_access_dictionary(p_user_id, d.id, 'read')
        ))$predicate$;
  helper record;
  definition text;
  old_count int;
  new_count int;
BEGIN
  -- Store the allowed IDs in an uncorrelated subquery within each statement.
  -- Existing dictionary authorization and each statement's snapshot still apply.
  FOR helper IN
    SELECT * FROM (VALUES
      ('private.get_detailed_training_stats_utc_legacy_v1(uuid,text[],uuid,text)'::regprocedure, 7),
      ('private.training_local_daily_stats_v1(uuid,text[],uuid,text,text)'::regprocedure, 1)
    ) AS routines(signature, expected_count)
  LOOP
    definition := pg_get_functiondef(helper.signature);
    old_count := (length(definition) - length(replace(definition, old_predicate, ''))) / length(old_predicate);
    new_count := (length(definition) - length(replace(definition, new_predicate, ''))) / length(new_predicate);
    IF old_count = helper.expected_count AND new_count = 0 THEN
      EXECUTE replace(definition, old_predicate, new_predicate);
    ELSIF old_count <> 0 OR new_count <> helper.expected_count THEN
      RAISE EXCEPTION 'Unexpected dictionary access predicates in %', helper.signature;
    END IF;
  END LOOP;
END
$migration$;

COMMIT;
