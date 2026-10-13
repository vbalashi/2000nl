-- #693. Retire only the legacy hide write. Preserve ratings, freeze and schema.
-- Latest full signature: 059, with the committed 149/169/192 clock/exclusion
-- amendments. The assembled body was compared with production before editing.
BEGIN;
DO $retire_hide$
DECLARE
 v_oid regprocedure := 'public.handle_card_review(uuid,uuid,text,text,uuid)'::regprocedure;
 v_definition text := pg_get_functiondef(v_oid);
 v_body text;
 v_old text := $old$    IF p_result = 'hide' THEN
        INSERT INTO user_card_status (
            user_id, entry_id, card_type_id, hidden, last_result, last_seen_at
        )
        VALUES (p_user_id, p_entry_id, p_card_type_id, true, 'hide', private.training_reference_now_v1())
        ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
        SET hidden = true, last_result = 'hide', last_seen_at = private.training_reference_now_v1();

        INSERT INTO user_events (user_id, word_id, mode, event_type)
        VALUES (p_user_id, p_entry_id, p_card_type_id, 'hide');
        RETURN;
    END IF;

$old$;
 v_anchor text := '    IF p_turn_id IS NOT NULL THEN';
 v_guard text := $guard$    -- Reject before the consumed-turn shortcut; hide is no longer an action.
    IF p_result = 'hide' THEN
        RAISE EXCEPTION 'legacy_hide_disabled' USING ERRCODE = '22023';
    END IF;

$guard$;
BEGIN
 SELECT prosrc INTO STRICT v_body FROM pg_proc WHERE oid=v_oid;
 IF md5(v_body) <> '779e758a82d151f24bb88145f43717f4'
 OR position(v_old IN v_definition)=0
 OR (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1
 THEN RAISE EXCEPTION 'legacy hide retirement: unexpected predecessor'; END IF;
 v_definition := replace(v_definition,v_old,'');
 v_definition := replace(v_definition,v_anchor,v_guard || v_anchor);
 EXECUTE v_definition;
END $retire_hide$;
COMMIT;
