\i db/deploy-contract/read-only-postflight-215.sql
DO $probe$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='known_meaning_familiarity' AND NOT tgisinternal) THEN RAISE EXCEPTION 'missing durable meaning familiarity'; END IF;
 IF has_function_privilege('authenticated','private.enroll_familiar_meaning_directions_v1(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'familiarity helper must be private'; END IF;
END;
$probe$;
