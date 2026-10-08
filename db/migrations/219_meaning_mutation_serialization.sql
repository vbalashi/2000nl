-- Entry-wide operations must acquire the common locks before directional rows.
BEGIN;
DO $$ DECLARE definition text; needle text; BEGIN
 SELECT pg_get_functiondef('private.perform_platform_v2_card_action_without_verifiable_receipt(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text)'::regprocedure) INTO definition;
 needle:=$needle$    PERFORM pg_advisory_xact_lock(
        hashtext(
            p_user_id::text
            || ':'
            || p_entry_id::text
            || ':'
            || p_card_type_id
        )
    );$needle$;
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'meaning_mutation_lock_seam_missing'; END IF;
 definition:=replace(definition,needle,$lock$    IF p_card_type_id IN ('word-to-definition','definition-to-word') THEN
      PERFORM pg_advisory_xact_lock(hashtext('training-headword:'||p_user_id::text||':'||private.training_headword_group_v1(p_entry_id)::text));
      PERFORM pg_advisory_xact_lock(hashtext('shared-meaning-known:'||p_user_id::text||':'||p_entry_id::text));
    END IF;
$lock$||needle);
 EXECUTE definition;
END;$$;
COMMIT;
