-- Harden active SECURITY DEFINER RPCs after the entry/card migration.
-- This migration intentionally redefines user-scoped functions with null-safe
-- auth checks, then locks execute privileges to authenticated callers.

-- FUNCTION add_entry_to_user_list(uuid,uuid,uuid)
CREATE OR REPLACE FUNCTION public.add_entry_to_user_list(p_user_id uuid, p_list_id uuid, p_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_dictionary_id uuid;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM user_word_lists
        WHERE id = p_list_id
          AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'list_not_found';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
    FROM word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry_not_found';
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RAISE EXCEPTION 'entry_not_accessible';
    END IF;

    INSERT INTO user_word_list_items (list_id, word_id)
    VALUES (p_list_id, p_entry_id)
    ON CONFLICT (list_id, word_id) DO NOTHING;
END;
$function$;


-- FUNCTION copy_entry_to_user_dictionary(uuid,uuid,uuid,jsonb)
CREATE OR REPLACE FUNCTION public.copy_entry_to_user_dictionary(p_user_id uuid, p_source_entry_id uuid, p_target_dictionary_id uuid DEFAULT NULL::uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_source word_entries%rowtype;
    v_target_dictionary dictionaries%rowtype;
    v_target_dictionary_id uuid;
    v_payload jsonb;
    v_headword text;
    v_language_code text;
    v_part_of_speech text;
    v_gender text;
    v_copied_entry_id uuid;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT * INTO v_source
    FROM word_entries
    WHERE id = p_source_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry_not_found';
    END IF;

    IF v_source.dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_source.dictionary_id, 'read') THEN
        RAISE EXCEPTION 'entry_not_accessible';
    END IF;

    v_target_dictionary_id := COALESCE(
        p_target_dictionary_id,
        ensure_user_dictionary(p_user_id, v_source.language_code, 'My dictionary')
    );

    SELECT * INTO v_target_dictionary
    FROM dictionaries
    WHERE id = v_target_dictionary_id;

    IF NOT FOUND
       OR v_target_dictionary.kind <> 'user'
       OR v_target_dictionary.owner_user_id <> p_user_id
       OR NOT v_target_dictionary.is_editable
       OR v_target_dictionary.schema_key <> 'user-entry-v1'
       OR v_target_dictionary.schema_version <> 1 THEN
        RAISE EXCEPTION 'target_dictionary_not_editable';
    END IF;

    v_payload := jsonb_strip_nulls(jsonb_build_object(
        'headword', v_source.headword,
        'languageCode', v_source.language_code,
        'definition', COALESCE(
            NULLIF(p_overrides->>'definition', ''),
            NULLIF(v_source.raw#>>'{meanings,0,definition}', ''),
            NULLIF(v_source.raw#>>'{definition}', '')
        ),
        'partOfSpeech', v_source.part_of_speech,
        'gender', v_source.gender,
        'notes', NULLIF(p_overrides->>'notes', ''),
        'sourceEntryId', v_source.id::text
    )) || COALESCE(p_overrides, '{}'::jsonb);

    v_headword := NULLIF(v_payload->>'headword', '');
    v_language_code := NULLIF(v_payload->>'languageCode', '');
    v_part_of_speech := NULLIF(v_payload->>'partOfSpeech', '');
    v_gender := NULLIF(v_payload->>'gender', '');

    IF v_headword IS NULL OR v_language_code IS NULL THEN
        RAISE EXCEPTION 'invalid_user_entry';
    END IF;

    IF NOT (
        v_payload ? 'definition'
        OR v_payload ? 'translation'
        OR v_payload ? 'example'
        OR v_payload ? 'notes'
    ) THEN
        RAISE EXCEPTION 'invalid_user_entry';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    IF v_language_code <> v_target_dictionary.language_code THEN
        RAISE EXCEPTION 'language_mismatch';
    END IF;

    INSERT INTO word_entries (
        dictionary_id,
        language_code,
        headword,
        meaning_id,
        part_of_speech,
        gender,
        is_nt2_2000,
        raw
    )
    VALUES (
        v_target_dictionary_id,
        v_language_code,
        v_headword,
        COALESCE(v_source.meaning_id, 1),
        v_part_of_speech,
        v_gender,
        false,
        v_payload
    )
    ON CONFLICT (dictionary_id, language_code, headword, meaning_id)
    WHERE dictionary_id IS NOT NULL
    DO UPDATE SET
        part_of_speech = excluded.part_of_speech,
        gender = excluded.gender,
        raw = excluded.raw
    RETURNING id INTO v_copied_entry_id;

    RETURN v_copied_entry_id;
END;
$function$;


-- FUNCTION create_user_dictionary_entry(uuid,uuid,jsonb)
CREATE OR REPLACE FUNCTION public.create_user_dictionary_entry(p_user_id uuid, p_dictionary_id uuid DEFAULT NULL::uuid, p_entry jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_dictionary_id uuid;
    v_dictionary dictionaries%rowtype;
    v_payload jsonb;
    v_word_id uuid;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    v_dictionary_id := COALESCE(
        p_dictionary_id,
        ensure_user_dictionary(
            p_user_id,
            COALESCE(NULLIF(trim(p_entry->>'languageCode'), ''), 'nl'),
            'My dictionary'
        )
    );
    v_dictionary := assert_editable_user_dictionary(p_user_id, v_dictionary_id);
    v_payload := validate_user_entry_v1_payload(p_entry, v_dictionary.language_code);

    IF EXISTS (
        SELECT 1
        FROM word_entries
        WHERE dictionary_id = v_dictionary_id
          AND language_code = v_payload->>'languageCode'
          AND headword = v_payload->>'headword'
          AND meaning_id = 1
    ) THEN
        RAISE EXCEPTION 'duplicate_user_entry';
    END IF;

    INSERT INTO word_entries (
        dictionary_id,
        language_code,
        headword,
        meaning_id,
        part_of_speech,
        gender,
        is_nt2_2000,
        raw
    )
    VALUES (
        v_dictionary_id,
        v_payload->>'languageCode',
        v_payload->>'headword',
        1,
        v_payload->>'partOfSpeech',
        v_payload->>'gender',
        false,
        v_payload
    )
    RETURNING id INTO v_word_id;

    RETURN v_word_id;
END;
$function$;


-- FUNCTION create_user_word_list(uuid,text,text,text,text,text,text,text[])
CREATE OR REPLACE FUNCTION public.create_user_word_list(p_user_id uuid, p_name text, p_description text DEFAULT NULL::text, p_language_code text DEFAULT 'nl'::text, p_primary_language_code text DEFAULT NULL::text, p_default_scenario_id text DEFAULT NULL::text, p_card_policy text DEFAULT 'inherit'::text, p_card_type_ids text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
    v_list user_word_lists%ROWTYPE;
    v_name text;
    v_language_code text;
    v_primary_language_code text;
    v_default_scenario_id text;
    v_card_policy text;
    v_card_type_ids text[];
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    v_name := NULLIF(trim(p_name), '');
    IF v_name IS NULL THEN
        RAISE EXCEPTION 'invalid_list_name';
    END IF;

    v_language_code := NULLIF(trim(COALESCE(p_language_code, 'nl')), '');
    v_primary_language_code := NULLIF(
        trim(COALESCE(p_primary_language_code, v_language_code)),
        ''
    );
    v_default_scenario_id := NULLIF(trim(COALESCE(p_default_scenario_id, '')), '');
    v_card_policy := private.normalize_list_card_policy(p_card_policy, 'inherit');
    v_card_type_ids := CASE
        WHEN p_card_type_ids IS NULL THEN NULL
        ELSE ARRAY(
            SELECT DISTINCT trim(card_type_id)
            FROM unnest(p_card_type_ids) AS card_type_id
            WHERE NULLIF(trim(card_type_id), '') IS NOT NULL
            ORDER BY trim(card_type_id)
        )
    END;
    IF v_card_type_ids IS NOT NULL AND array_length(v_card_type_ids, 1) IS NULL THEN
        v_card_type_ids := NULL;
    END IF;

    IF v_language_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    IF v_primary_language_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM languages WHERE code = v_primary_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    PERFORM private.validate_list_training_intent(
        v_default_scenario_id,
        v_card_policy,
        v_card_type_ids
    );

    INSERT INTO user_word_lists (
        user_id,
        name,
        description,
        language_code,
        primary_language_code,
        default_scenario_id,
        card_policy,
        card_type_ids
    )
    VALUES (
        p_user_id,
        v_name,
        NULLIF(p_description, ''),
        v_language_code,
        v_primary_language_code,
        v_default_scenario_id,
        v_card_policy,
        v_card_type_ids
    )
    RETURNING * INTO v_list;

    RETURN jsonb_build_object(
        'id', v_list.id,
        'name', v_list.name,
        'description', v_list.description,
        'language_code', v_list.language_code,
        'primary_language_code', v_list.primary_language_code,
        'default_scenario_id', v_list.default_scenario_id,
        'card_policy', v_list.card_policy,
        'card_type_ids', v_list.card_type_ids,
        'created_at', v_list.created_at,
        'user_word_list_items', jsonb_build_array(jsonb_build_object('count', 0))
    );
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'duplicate_user_list';
END;
$function$;


-- FUNCTION delete_user_dictionary_entry(uuid,uuid)
CREATE OR REPLACE FUNCTION public.delete_user_dictionary_entry(p_user_id uuid, p_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_existing word_entries%rowtype;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT * INTO v_existing
    FROM word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry_not_found';
    END IF;

    PERFORM assert_editable_user_dictionary(p_user_id, v_existing.dictionary_id);

    DELETE FROM word_entries
    WHERE id = p_entry_id;
END;
$function$;


-- FUNCTION delete_user_word_list(uuid,uuid)
CREATE OR REPLACE FUNCTION public.delete_user_word_list(p_user_id uuid, p_list_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    DELETE FROM user_word_lists
    WHERE id = p_list_id
      AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'list_not_found';
    END IF;
END;
$function$;


-- FUNCTION fetch_dictionary_entry_by_id_gated(uuid)
CREATE OR REPLACE FUNCTION public.fetch_dictionary_entry_by_id_gated(p_entry_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id uuid;
    v_entry jsonb;
BEGIN
    v_user_id := (select auth.uid());

    SELECT jsonb_build_object(
        'id', w.id,
        'dictionary_id', w.dictionary_id,
        'language_code', w.language_code,
        'headword', w.headword,
        'meaning_id', w.meaning_id,
        'part_of_speech', w.part_of_speech,
        'gender', w.gender,
        'raw', w.raw,
        'is_nt2_2000', w.is_nt2_2000,
        'meanings_count', (
            SELECT COUNT(*)
            FROM word_entries we
            WHERE we.headword = w.headword
              AND we.language_code = w.language_code
              AND (
                    (w.dictionary_id IS NULL AND we.dictionary_id IS NULL)
                 OR we.dictionary_id = w.dictionary_id
              )
        )
    )
    INTO v_entry
    FROM word_entries w
    WHERE w.id = p_entry_id
      AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'));

    RETURN v_entry;
END;
$function$;


-- FUNCTION get_active_word_list(uuid)
CREATE OR REPLACE FUNCTION public.get_active_word_list(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT jsonb_build_object(
        'active_list_id', active_list_id,
        'active_list_type', active_list_type
    )
    INTO v_result
    FROM user_settings
    WHERE user_id = p_user_id;

    RETURN v_result;
END;
$function$;


-- FUNCTION get_detailed_training_stats(uuid,text[],uuid,text)
CREATE OR REPLACE FUNCTION public.get_detailed_training_stats(p_user_id uuid, p_modes text[] DEFAULT ARRAY['word-to-definition'::text], p_list_id uuid DEFAULT NULL::uuid, p_list_type text DEFAULT 'curated'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_new_words_today INT;
    v_new_cards_today INT;
    v_daily_new_limit INT;
    v_review_words_done INT;
    v_review_cards_done INT;
    v_review_words_due INT;
    v_review_cards_due INT;
    v_total_words_learned INT;
    v_total_words_in_list INT;
BEGIN
    -- AUTH CHECK: Verify caller owns this user_id
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF p_modes IS NULL OR array_length(p_modes, 1) IS NULL THEN
        p_modes := ARRAY['word-to-definition'];
    END IF;

    IF p_list_id IS NOT NULL AND p_list_type IS NULL THEN
        p_list_type := 'curated';
    END IF;

    SELECT COALESCE(daily_new_limit, 10) INTO v_daily_new_limit
    FROM user_settings WHERE user_id = p_user_id;
    v_daily_new_limit := COALESCE(v_daily_new_limit, 10);

    -- New words introduced today that have graduated
    SELECT COUNT(DISTINCT rl.word_id) INTO v_new_words_today
    FROM user_review_log rl
    JOIN user_card_status s ON s.entry_id = rl.word_id 
        AND s.user_id = rl.user_id 
        AND s.card_type_id = rl.mode
    WHERE rl.user_id = p_user_id
      AND rl.mode = ANY(p_modes)
      AND rl.review_type = 'new'
      AND rl.reviewed_at::date = current_date
      AND s.fsrs_last_interval >= 1.0;

    v_new_cards_today := v_new_words_today;

    -- Review cards done today
    SELECT COUNT(DISTINCT word_id) INTO v_review_words_done
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type = 'review'
      AND reviewed_at::date = current_date
      AND interval_after >= 1.0;

    SELECT COUNT(*) INTO v_review_cards_done
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type = 'review'
      AND reviewed_at::date = current_date
      AND interval_after >= 1.0;

    -- Review cards due today (excluding new cards introduced today)
    SELECT COUNT(DISTINCT s.entry_id) INTO v_review_words_due
    FROM user_card_status s
    JOIN word_entries w ON w.id = s.entry_id
    WHERE s.user_id = p_user_id
      AND s.card_type_id = ANY(p_modes)
      AND s.next_review_at < (current_date + interval '1 day')
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND s.fsrs_enabled = true
      AND NOT EXISTS (
          SELECT 1 FROM user_review_log rl
          WHERE rl.user_id = s.user_id
            AND rl.word_id = s.entry_id
            AND rl.mode = s.card_type_id
            AND rl.review_type = 'new'
            AND rl.reviewed_at::date = current_date
      )
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    SELECT COUNT(*) INTO v_review_cards_due
    FROM user_card_status s
    JOIN word_entries w ON w.id = s.entry_id
    WHERE s.user_id = p_user_id
      AND s.card_type_id = ANY(p_modes)
      AND s.next_review_at < (current_date + interval '1 day')
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND s.fsrs_enabled = true
      AND NOT EXISTS (
          SELECT 1 FROM user_review_log rl
          WHERE rl.user_id = s.user_id
            AND rl.word_id = s.entry_id
            AND rl.mode = s.card_type_id
            AND rl.review_type = 'new'
            AND rl.reviewed_at::date = current_date
      )
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    -- Total words learned
    SELECT COUNT(DISTINCT s.entry_id) INTO v_total_words_learned
    FROM user_card_status s
    JOIN word_entries w ON w.id = s.entry_id
    WHERE s.user_id = p_user_id
      AND s.card_type_id = ANY(p_modes)
      AND s.fsrs_enabled = true
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    -- Total words in list
    SELECT COUNT(*) INTO v_total_words_in_list
    FROM word_entries w
    WHERE (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    RETURN jsonb_build_object(
        'newWordsToday', v_new_words_today,
        'newCardsToday', v_new_cards_today,
        'dailyNewLimit', v_daily_new_limit,
        'reviewWordsDone', v_review_words_done,
        'reviewCardsDone', v_review_cards_done,
        'reviewWordsDue', v_review_words_due,
        'reviewCardsDue', v_review_cards_due,
        'totalWordsLearned', v_total_words_learned,
        'totalWordsInList', v_total_words_in_list
    );
END;
$function$;


-- FUNCTION get_learning_preferences(uuid)
CREATE OR REPLACE FUNCTION public.get_learning_preferences(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT jsonb_build_object(
        'training_mode', training_mode,
        'modes_enabled', modes_enabled,
        'card_filter', card_filter,
        'language_code', language_code,
        'new_review_ratio', new_review_ratio,
        'active_scenario', active_scenario,
        'daily_new_limit', daily_new_limit,
        'daily_review_limit', daily_review_limit,
        'target_retention', target_retention,
        'mix_mode', mix_mode,
        'use_fsrs', use_fsrs
    )
    INTO v_result
    FROM user_settings
    WHERE user_id = p_user_id;

    RETURN v_result;
END;
$function$;


-- FUNCTION get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[])
CREATE OR REPLACE FUNCTION public.get_next_card(p_user_id uuid, p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'::text], p_exclude_entry_ids uuid[] DEFAULT ARRAY[]::uuid[], p_list_id uuid DEFAULT NULL::uuid, p_list_type text DEFAULT 'curated'::text, p_card_filter text DEFAULT 'both'::text, p_queue_turn text DEFAULT 'auto'::text, p_exclude_card_keys text[] DEFAULT ARRAY[]::text[])
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_word_id uuid;
    v_selected_mode text;
    v_source text;
    v_settings record;
    v_new_today int;
    v_reviews_today int;
    v_list_valid boolean := true;
    v_new_pool_size int;
    v_review_pool_size int;
    v_learning_due_count int;
    v_review_pool_limit int := 10;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF p_card_type_ids IS NULL OR array_length(p_card_type_ids, 1) IS NULL THEN
        p_card_type_ids := ARRAY['word-to-definition'];
    END IF;
    p_exclude_entry_ids := COALESCE(p_exclude_entry_ids, ARRAY[]::uuid[]);
    p_exclude_card_keys := COALESCE(p_exclude_card_keys, ARRAY[]::text[]);

    IF p_list_id IS NOT NULL THEN
        IF p_list_type IS NULL THEN
            p_list_type := 'curated';
        END IF;

        IF p_list_type = 'user' THEN
            SELECT EXISTS (
                SELECT 1 FROM user_word_lists
                WHERE id = p_list_id AND user_id = p_user_id
            ) INTO v_list_valid;
        ELSE
            SELECT EXISTS (
                SELECT 1 FROM word_lists WHERE id = p_list_id
            ) INTO v_list_valid;
        END IF;

        IF NOT v_list_valid THEN
            RETURN;
        END IF;
    END IF;

    SELECT * INTO v_settings
    FROM user_settings
    WHERE user_id = p_user_id;

    v_settings.daily_new_limit := COALESCE(v_settings.daily_new_limit, 10);
    v_settings.daily_review_limit := COALESCE(v_settings.daily_review_limit, 200);

    SELECT COUNT(DISTINCT word_id) INTO v_new_today
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_card_type_ids)
      AND review_type = 'new'
      AND reviewed_at::date = current_date;

    SELECT COUNT(*) INTO v_reviews_today
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_card_type_ids)
      AND review_type = 'review'
      AND reviewed_at::date = current_date;

    SELECT COUNT(*) INTO v_learning_due_count
    FROM user_card_status s
    JOIN word_entries w ON w.id = s.entry_id
    WHERE s.user_id = p_user_id
      AND s.card_type_id = ANY(p_card_type_ids)
      AND COALESCE(s.fsrs_last_interval, 0) < 1.0
      AND s.next_review_at <= now()
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND s.fsrs_enabled = true
      AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
      AND NOT (s.entry_id = ANY(p_exclude_entry_ids))
              AND NOT ((s.entry_id::text || ':' || s.card_type_id) = ANY(p_exclude_card_keys))
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    SELECT COUNT(*) INTO v_new_pool_size
    FROM word_entries w
    WHERE NOT EXISTS (
            SELECT 1 FROM user_card_status s
            WHERE s.entry_id = w.id
              AND s.user_id = p_user_id
              AND s.card_type_id = ANY(p_card_type_ids)
        )
      AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
              AND NOT (w.id = ANY(p_exclude_entry_ids))
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    SELECT COUNT(*) INTO v_review_pool_size
    FROM user_card_status s
    JOIN word_entries w ON w.id = s.entry_id
    WHERE s.user_id = p_user_id
      AND s.card_type_id = ANY(p_card_type_ids)
      AND s.fsrs_last_interval >= 1.0
      AND s.next_review_at <= now()
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND s.fsrs_enabled = true
      AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
      AND NOT (s.entry_id = ANY(p_exclude_entry_ids))
              AND NOT ((s.entry_id::text || ':' || s.card_type_id) = ANY(p_exclude_card_keys))
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    -- Keep selection semantics identical while reading card-state storage.
    IF p_queue_turn = 'new' AND p_card_filter != 'review' THEN
        IF v_new_today < v_settings.daily_new_limit THEN
            v_selected_mode := p_card_type_ids[1 + floor(random() * array_length(p_card_type_ids, 1))::int];

            SELECT w.id, 'new' INTO v_word_id, v_source
            FROM word_entries w
            WHERE NOT EXISTS (
                    SELECT 1 FROM user_card_status s
                    WHERE s.entry_id = w.id
                      AND s.user_id = p_user_id
                      AND s.card_type_id = v_selected_mode
                )
              AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
              AND NOT (w.id = ANY(p_exclude_entry_ids))
              AND NOT ((w.id::text || ':' || v_selected_mode) = ANY(p_exclude_card_keys))
              AND (
                    (p_list_id IS NULL AND w.is_nt2_2000 = true)
                 OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                        SELECT 1 FROM word_list_items li
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY random()
            LIMIT 1;
        END IF;

        IF v_word_id IS NULL AND v_learning_due_count > 0 THEN
            SELECT s.entry_id, s.card_type_id, 'learning' INTO v_word_id, v_selected_mode, v_source
            FROM user_card_status s
            JOIN word_entries w ON w.id = s.entry_id
            WHERE s.user_id = p_user_id
              AND s.card_type_id = ANY(p_card_type_ids)
              AND COALESCE(s.fsrs_last_interval, 0) < 1.0
              AND s.next_review_at <= now()
              AND (s.frozen_until IS NULL OR s.frozen_until <= now())
              AND s.hidden = false
              AND s.fsrs_enabled = true
              AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
      AND NOT (s.entry_id = ANY(p_exclude_entry_ids))
              AND NOT ((s.entry_id::text || ':' || s.card_type_id) = ANY(p_exclude_card_keys))
              AND (
                    (p_list_id IS NULL AND w.is_nt2_2000 = true)
                 OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                        SELECT 1 FROM word_list_items li
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY s.next_review_at ASC
            LIMIT 1;
        END IF;
    END IF;

    IF v_word_id IS NULL AND p_card_filter = 'new' THEN
        IF v_new_today < v_settings.daily_new_limit THEN
            v_selected_mode := p_card_type_ids[1 + floor(random() * array_length(p_card_type_ids, 1))::int];

            SELECT w.id, 'new' INTO v_word_id, v_source
            FROM word_entries w
            WHERE NOT EXISTS (
                    SELECT 1 FROM user_card_status s
                    WHERE s.entry_id = w.id
                      AND s.user_id = p_user_id
                      AND s.card_type_id = v_selected_mode
                )
              AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
              AND NOT (w.id = ANY(p_exclude_entry_ids))
              AND NOT ((w.id::text || ':' || v_selected_mode) = ANY(p_exclude_card_keys))
              AND (
                    (p_list_id IS NULL AND w.is_nt2_2000 = true)
                 OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                        SELECT 1 FROM word_list_items li
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY random()
            LIMIT 1;
        END IF;
    END IF;

    IF v_word_id IS NULL AND (p_queue_turn = 'review' OR p_card_filter = 'review') AND p_card_filter != 'new' THEN
        IF v_reviews_today < v_settings.daily_review_limit THEN
            SELECT s.entry_id, s.card_type_id, 'review' INTO v_word_id, v_selected_mode, v_source
            FROM user_card_status s
            JOIN word_entries w ON w.id = s.entry_id
            WHERE s.user_id = p_user_id
              AND s.card_type_id = ANY(p_card_type_ids)
              AND s.fsrs_last_interval >= 1.0
              AND s.next_review_at <= now()
              AND (s.frozen_until IS NULL OR s.frozen_until <= now())
              AND s.hidden = false
              AND s.fsrs_enabled = true
              AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
      AND NOT (s.entry_id = ANY(p_exclude_entry_ids))
              AND NOT ((s.entry_id::text || ':' || s.card_type_id) = ANY(p_exclude_card_keys))
              AND (
                    (p_list_id IS NULL AND w.is_nt2_2000 = true)
                 OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                        SELECT 1 FROM word_list_items li
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY s.next_review_at ASC
            LIMIT 1;
        END IF;

        IF v_word_id IS NULL AND p_card_filter = 'both' AND v_learning_due_count > 0 THEN
            SELECT s.entry_id, s.card_type_id, 'learning' INTO v_word_id, v_selected_mode, v_source
            FROM user_card_status s
            JOIN word_entries w ON w.id = s.entry_id
            WHERE s.user_id = p_user_id
              AND s.card_type_id = ANY(p_card_type_ids)
              AND COALESCE(s.fsrs_last_interval, 0) < 1.0
              AND s.next_review_at <= now()
              AND (s.frozen_until IS NULL OR s.frozen_until <= now())
              AND s.hidden = false
              AND s.fsrs_enabled = true
              AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
      AND NOT (s.entry_id = ANY(p_exclude_entry_ids))
              AND NOT ((s.entry_id::text || ':' || s.card_type_id) = ANY(p_exclude_card_keys))
              AND (
                    (p_list_id IS NULL AND w.is_nt2_2000 = true)
                 OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                        SELECT 1 FROM word_list_items li
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY s.next_review_at ASC
            LIMIT 1;
        END IF;

        IF v_word_id IS NULL AND p_card_filter = 'both' AND v_new_today < v_settings.daily_new_limit THEN
            v_selected_mode := p_card_type_ids[1 + floor(random() * array_length(p_card_type_ids, 1))::int];

            SELECT w.id, 'new' INTO v_word_id, v_source
            FROM word_entries w
            WHERE NOT EXISTS (
                    SELECT 1 FROM user_card_status s
                    WHERE s.entry_id = w.id
                      AND s.user_id = p_user_id
                      AND s.card_type_id = v_selected_mode
                )
              AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
              AND NOT (w.id = ANY(p_exclude_entry_ids))
              AND NOT ((w.id::text || ':' || v_selected_mode) = ANY(p_exclude_card_keys))
              AND (
                    (p_list_id IS NULL AND w.is_nt2_2000 = true)
                 OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                        SELECT 1 FROM word_list_items li
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY random()
            LIMIT 1;
        END IF;
    END IF;

    IF v_word_id IS NULL AND p_queue_turn = 'auto' AND p_card_filter = 'both' THEN
        IF v_reviews_today < v_settings.daily_review_limit THEN
            SELECT s.entry_id, s.card_type_id, 'review' INTO v_word_id, v_selected_mode, v_source
            FROM user_card_status s
            JOIN word_entries w ON w.id = s.entry_id
            WHERE s.user_id = p_user_id
              AND s.card_type_id = ANY(p_card_type_ids)
              AND s.fsrs_last_interval >= 1.0
              AND s.next_review_at <= now()
              AND (s.frozen_until IS NULL OR s.frozen_until <= now())
              AND s.hidden = false
              AND s.fsrs_enabled = true
              AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
      AND NOT (s.entry_id = ANY(p_exclude_entry_ids))
              AND NOT ((s.entry_id::text || ':' || s.card_type_id) = ANY(p_exclude_card_keys))
              AND (
                    (p_list_id IS NULL AND w.is_nt2_2000 = true)
                 OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                        SELECT 1 FROM word_list_items li
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY s.next_review_at ASC
            LIMIT 1;
        END IF;

        IF v_word_id IS NULL AND v_learning_due_count > 0 THEN
            SELECT s.entry_id, s.card_type_id, 'learning' INTO v_word_id, v_selected_mode, v_source
            FROM user_card_status s
            JOIN word_entries w ON w.id = s.entry_id
            WHERE s.user_id = p_user_id
              AND s.card_type_id = ANY(p_card_type_ids)
              AND COALESCE(s.fsrs_last_interval, 0) < 1.0
              AND s.next_review_at <= now()
              AND (s.frozen_until IS NULL OR s.frozen_until <= now())
              AND s.hidden = false
              AND s.fsrs_enabled = true
              AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
      AND NOT (s.entry_id = ANY(p_exclude_entry_ids))
              AND NOT ((s.entry_id::text || ':' || s.card_type_id) = ANY(p_exclude_card_keys))
              AND (
                    (p_list_id IS NULL AND w.is_nt2_2000 = true)
                 OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                        SELECT 1 FROM word_list_items li
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY s.next_review_at ASC
            LIMIT 1;
        END IF;

        IF v_word_id IS NULL AND v_new_today < v_settings.daily_new_limit THEN
            v_selected_mode := p_card_type_ids[1 + floor(random() * array_length(p_card_type_ids, 1))::int];

            SELECT w.id, 'new' INTO v_word_id, v_source
            FROM word_entries w
            WHERE NOT EXISTS (
                    SELECT 1 FROM user_card_status s
                    WHERE s.entry_id = w.id
                      AND s.user_id = p_user_id
                      AND s.card_type_id = v_selected_mode
                )
              AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
              AND NOT (w.id = ANY(p_exclude_entry_ids))
              AND NOT ((w.id::text || ':' || v_selected_mode) = ANY(p_exclude_card_keys))
              AND (
                    (p_list_id IS NULL AND w.is_nt2_2000 = true)
                 OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                        SELECT 1 FROM word_list_items li
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY random()
            LIMIT 1;
        END IF;
    END IF;

    IF v_word_id IS NULL AND p_card_filter != 'new' AND v_reviews_today < v_settings.daily_review_limit THEN
        SELECT s.entry_id, s.card_type_id, 'review' INTO v_word_id, v_selected_mode, v_source
        FROM user_card_status s
        JOIN word_entries w ON w.id = s.entry_id
        WHERE s.user_id = p_user_id
          AND s.card_type_id = ANY(p_card_type_ids)
          AND s.fsrs_last_interval >= 1.0
          AND (s.frozen_until IS NULL OR s.frozen_until <= now())
          AND s.hidden = false
          AND s.fsrs_enabled = true
          AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
      AND NOT (s.entry_id = ANY(p_exclude_entry_ids))
              AND NOT ((s.entry_id::text || ':' || s.card_type_id) = ANY(p_exclude_card_keys))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
        ORDER BY s.next_review_at ASC
        LIMIT 1;
    END IF;

    IF v_word_id IS NULL AND NOT (
        p_card_filter = 'both'
        AND v_new_today >= v_settings.daily_new_limit
        AND v_reviews_today >= v_settings.daily_review_limit
    ) THEN
        v_selected_mode := p_card_type_ids[1 + floor(random() * array_length(p_card_type_ids, 1))::int];

        SELECT w.id, 'practice' INTO v_word_id, v_source
        FROM word_entries w
        LEFT JOIN user_card_status s
          ON s.entry_id = w.id
         AND s.user_id = p_user_id
         AND s.card_type_id = v_selected_mode
        WHERE NOT (w.id = ANY(p_exclude_entry_ids))
          AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
          AND NOT ((w.id::text || ':' || v_selected_mode) = ANY(p_exclude_card_keys))
          AND (s.hidden IS NULL OR s.hidden = false)
          AND (s.frozen_until IS NULL OR s.frozen_until <= now())
          AND (s.fsrs_enabled IS NULL OR s.fsrs_enabled = true)
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
        ORDER BY random()
        LIMIT 1;
    END IF;

    IF v_word_id IS NOT NULL THEN
        RETURN QUERY
        SELECT jsonb_build_object(
            'id', w.id,
            'dictionary_id', w.dictionary_id,
            'language_code', w.language_code,
            'headword', w.headword,
            'part_of_speech', w.part_of_speech,
            'gender', w.gender,
            'raw', w.raw,
            'vandaleId', w.vandale_id,
            'is_nt2_2000', w.is_nt2_2000,
            'meanings_count', (
                SELECT COUNT(*) FROM word_entries we
                WHERE we.headword = w.headword
                  AND we.language_code = w.language_code
                  AND (
                        (w.dictionary_id IS NULL AND we.dictionary_id IS NULL)
                     OR we.dictionary_id = w.dictionary_id
                  )
            ),
            'mode', v_selected_mode,
            'stats', jsonb_build_object(
                'source', v_source,
                'mode', v_selected_mode,
                'next_review', s.next_review_at,
                'interval', s.fsrs_last_interval,
                'reps', s.fsrs_reps,
                'stability', s.fsrs_stability,
                'difficulty', s.fsrs_difficulty,
                'clicks', s.click_count,
                'new_today', v_new_today,
                'daily_new_limit', v_settings.daily_new_limit,
                'new_pool_size', v_new_pool_size,
                'learning_due_count', v_learning_due_count,
                'review_pool_size', LEAST(v_review_pool_size, v_review_pool_limit),
                'reason', v_source
            )
        )
        FROM word_entries w
        LEFT JOIN user_card_status s ON s.entry_id = w.id AND s.user_id = p_user_id AND s.card_type_id = v_selected_mode
        WHERE w.id = v_word_id
          AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'));
    END IF;

    RETURN;
END;
$function$;


-- FUNCTION get_recent_training_history(uuid,timestamp with time zone,integer)
CREATE OR REPLACE FUNCTION public.get_recent_training_history(p_user_id uuid, p_since timestamp with time zone DEFAULT (now() - '24:00:00'::interval), p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, dictionary_id uuid, language_code text, headword text, part_of_speech text, gender text, raw jsonb, is_nt2_2000 boolean, meanings_count integer, event_type text, mode text, created_at timestamp with time zone, click_count integer, last_seen_at timestamp with time zone, fsrs_last_interval double precision, fsrs_reps integer, fsrs_stability double precision, next_review_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    RETURN QUERY
    SELECT
        w.id,
        w.dictionary_id,
        w.language_code,
        w.headword,
        w.part_of_speech,
        w.gender,
        CASE
            WHEN jsonb_typeof(w.raw) = 'object'
             AND NOT (w.raw ? 'meaning_id')
             AND w.meaning_id IS NOT NULL
                THEN jsonb_set(w.raw, '{meaning_id}', to_jsonb(w.meaning_id), true)
            ELSE w.raw
        END AS raw,
        w.is_nt2_2000,
        GREATEST((
            SELECT COUNT(*)::int
            FROM word_entries sibling
            WHERE sibling.headword = w.headword
              AND sibling.language_code = w.language_code
              AND (
                    (w.dictionary_id IS NULL AND sibling.dictionary_id IS NULL)
                 OR sibling.dictionary_id = w.dictionary_id
              )
        ), 1) AS meanings_count,
        e.event_type,
        e.mode,
        e.created_at,
        COALESCE(s.click_count, 0) AS click_count,
        COALESCE(s.last_seen_at, e.created_at) AS last_seen_at,
        s.fsrs_last_interval::double precision,
        s.fsrs_reps,
        s.fsrs_stability::double precision,
        s.next_review_at
    FROM user_events e
    JOIN word_entries w ON w.id = e.word_id
    LEFT JOIN user_card_status s
      ON s.user_id = e.user_id
     AND s.entry_id = e.word_id
     AND s.card_type_id = e.mode
    WHERE e.user_id = p_user_id
      AND e.created_at >= COALESCE(p_since, now() - interval '24 hours')
      AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
    ORDER BY e.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$function$;


-- FUNCTION get_scenario_stats(uuid,text,uuid,text)
CREATE OR REPLACE FUNCTION public.get_scenario_stats(p_user_id uuid, p_scenario_id text, p_list_id uuid DEFAULT NULL::uuid, p_list_type text DEFAULT 'curated'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_card_modes text[];
    v_graduation_threshold numeric;
    v_total int;
    v_learned int;
    v_in_progress int;
    v_new int;
BEGIN
    -- AUTH CHECK: Verify caller owns this user_id
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT card_modes, graduation_threshold 
    INTO v_card_modes, v_graduation_threshold
    FROM training_scenarios WHERE id = p_scenario_id;
    
    IF v_card_modes IS NULL THEN
        RETURN jsonb_build_object('error', 'Scenario not found');
    END IF;
    
    SELECT COUNT(*) INTO v_total
    FROM word_entries w
    WHERE (
        (p_list_id IS NULL AND w.is_nt2_2000 = true)
        OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
            SELECT 1 FROM word_list_items li WHERE li.list_id = p_list_id AND li.word_id = w.id
        ))
        OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
            SELECT 1 FROM user_word_list_items li
            JOIN user_word_lists l ON l.id = li.list_id
            WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
        ))
    );
    
    WITH word_min_stability AS (
        SELECT 
            w.id as word_id,
            MIN(COALESCE(s.fsrs_stability, 0)) as min_stability,
            COUNT(s.entry_id) as cards_started
        FROM word_entries w
        LEFT JOIN user_card_status s ON s.entry_id = w.id 
            AND s.user_id = p_user_id 
            AND s.card_type_id = ANY(v_card_modes)
            AND s.fsrs_enabled = true
            AND s.hidden = false
        WHERE (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
            OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
            OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
        )
        GROUP BY w.id
    )
    SELECT 
        COUNT(*) FILTER (WHERE min_stability >= v_graduation_threshold AND cards_started >= array_length(v_card_modes, 1)),
        COUNT(*) FILTER (WHERE cards_started > 0 AND (min_stability < v_graduation_threshold OR cards_started < array_length(v_card_modes, 1))),
        COUNT(*) FILTER (WHERE cards_started = 0)
    INTO v_learned, v_in_progress, v_new
    FROM word_min_stability;
    
    RETURN jsonb_build_object(
        'learned', COALESCE(v_learned, 0),
        'in_progress', COALESCE(v_in_progress, 0),
        'new', COALESCE(v_new, 0),
        'total', COALESCE(v_total, 0),
        'scenario_id', p_scenario_id,
        'card_modes', v_card_modes,
        'graduation_threshold', v_graduation_threshold
    );
END;
$function$;


-- FUNCTION get_scenario_word_stats(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.get_scenario_word_stats(p_user_id uuid, p_word_id uuid, p_scenario_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_card_modes text[];
    v_result jsonb;
BEGIN
    -- AUTH CHECK: Verify caller owns this user_id
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT card_modes INTO v_card_modes
    FROM training_scenarios WHERE id = p_scenario_id;
    
    IF v_card_modes IS NULL THEN
        RETURN jsonb_build_object('error', 'Scenario not found');
    END IF;
    
    SELECT jsonb_build_object(
        'min_stability', MIN(s.fsrs_stability),
        'avg_stability', AVG(s.fsrs_stability),
        'max_stability', MAX(s.fsrs_stability),
        'cards_started', COUNT(s.entry_id),
        'cards_total', array_length(v_card_modes, 1),
        'is_learned', COALESCE(MIN(s.fsrs_stability), 0) >= (
            SELECT graduation_threshold FROM training_scenarios WHERE id = p_scenario_id
        )
    ) INTO v_result
    FROM user_card_status s
    WHERE s.user_id = p_user_id
      AND s.entry_id = p_word_id
      AND s.card_type_id = ANY(v_card_modes)
      AND s.fsrs_enabled = true
      AND s.hidden = false;
    
    RETURN COALESCE(v_result, jsonb_build_object(
        'min_stability', null, 'avg_stability', null, 'max_stability', null,
        'cards_started', 0, 'cards_total', array_length(v_card_modes, 1), 'is_learned', false
    ));
END;
$function$;


-- FUNCTION get_training_scenarios()
CREATE OR REPLACE FUNCTION public.get_training_scenarios()
 RETURNS SETOF jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
    SELECT jsonb_build_object(
        'id', id, 'name_en', name_en, 'name_nl', name_nl,
        'description', description, 'card_modes', card_modes,
        'graduation_threshold', graduation_threshold,
        'enabled', enabled, 'sort_order', sort_order
    )
    FROM training_scenarios
    ORDER BY sort_order, id;
$function$;


-- FUNCTION get_user_card_state(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.get_user_card_state(p_user_id uuid, p_entry_id uuid, p_card_type_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT get_card_user_state(p_user_id, p_entry_id, p_card_type_id);
$function$;


-- FUNCTION get_user_list_membership(uuid,uuid,uuid[])
CREATE OR REPLACE FUNCTION public.get_user_list_membership(p_user_id uuid, p_list_id uuid, p_entry_ids uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_entry_ids uuid[];
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM user_word_lists
        WHERE id = p_list_id
          AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'user_list_not_found';
    END IF;

    SELECT COALESCE(array_agg(item.word_id ORDER BY item.word_id), ARRAY[]::uuid[])
    INTO v_entry_ids
    FROM user_word_list_items item
    WHERE item.list_id = p_list_id
      AND item.word_id = ANY(COALESCE(p_entry_ids, ARRAY[]::uuid[]));

    RETURN v_entry_ids;
END;
$function$;


-- FUNCTION get_user_list_memberships_for_entries(uuid,uuid[])
CREATE OR REPLACE FUNCTION public.get_user_list_memberships_for_entries(p_user_id uuid, p_entry_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    WITH requested(entry_id) AS (
        SELECT DISTINCT unnest(COALESCE(p_entry_ids, ARRAY[]::uuid[]))
    ),
    memberships AS (
        SELECT
            item.word_id AS entry_id,
            jsonb_build_object(
                'id', list.id,
                'kind', 'user',
                'name', list.name,
                'description', list.description,
                'primary_language_code', list.primary_language_code,
                'item_count', (
                    SELECT COUNT(*)::int
                    FROM user_word_list_items count_item
                    WHERE count_item.list_id = list.id
                )
            ) AS list_payload
        FROM requested
        JOIN user_word_list_items item ON item.word_id = requested.entry_id
        JOIN user_word_lists list ON list.id = item.list_id
        WHERE list.user_id = p_user_id
    ),
    grouped AS (
        SELECT
            entry_id,
            jsonb_agg(list_payload ORDER BY list_payload->>'name') AS lists
        FROM memberships
        GROUP BY entry_id
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'entry_id', entry_id,
                'lists', lists
            )
            ORDER BY entry_id
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM grouped;

    RETURN v_result;
END;
$function$;


-- FUNCTION handle_card_review(uuid,uuid,text,text,uuid)
CREATE OR REPLACE FUNCTION public.handle_card_review(p_user_id uuid, p_entry_id uuid, p_card_type_id text, p_result text, p_turn_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_dictionary_id uuid;
    v_status user_card_status%rowtype;
    v_grade smallint;
    v_params numeric[];
    v_target numeric;
    v_compute jsonb;
    v_review_type text;
    v_scheduled timestamptz;
    v_interval numeric;
    v_meta jsonb;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
    FROM word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'word entry not found';
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RAISE EXCEPTION 'dictionary access denied';
    END IF;

    IF p_turn_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext(p_turn_id::text));

        IF EXISTS (
            SELECT 1
            FROM user_review_log
            WHERE turn_id = p_turn_id
        ) THEN
            RETURN;
        END IF;
    END IF;

    IF p_result = 'hide' THEN
        INSERT INTO user_card_status (
            user_id, entry_id, card_type_id, hidden, last_result, last_seen_at
        )
        VALUES (p_user_id, p_entry_id, p_card_type_id, true, 'hide', now())
        ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
        SET hidden = true, last_result = 'hide', last_seen_at = now();

        INSERT INTO user_events (user_id, word_id, mode, event_type)
        VALUES (p_user_id, p_entry_id, p_card_type_id, 'hide');
        RETURN;
    END IF;

    IF p_result = 'freeze' THEN
        INSERT INTO user_card_status (
            user_id, entry_id, card_type_id, frozen_until, last_result, last_seen_at
        )
        VALUES (p_user_id, p_entry_id, p_card_type_id, now() + interval '1 day', 'freeze', now())
        ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
        SET frozen_until = now() + interval '1 day',
            last_result = 'freeze',
            last_seen_at = now();

        INSERT INTO user_events (user_id, word_id, mode, event_type)
        VALUES (p_user_id, p_entry_id, p_card_type_id, 'freeze');
        RETURN;
    END IF;

    v_grade := CASE p_result
        WHEN 'fail' THEN 1
        WHEN 'hard' THEN 2
        WHEN 'success' THEN 3
        WHEN 'easy' THEN 4
        ELSE 1
    END;

    SELECT * INTO v_status
    FROM user_card_status
    WHERE user_id = p_user_id
      AND entry_id = p_entry_id
      AND card_type_id = p_card_type_id;

    IF p_turn_id IS NULL
        AND v_status.last_reviewed_at IS NOT NULL
        AND (now() - v_status.last_reviewed_at) < interval '10 seconds' THEN
        RETURN;
    END IF;

    v_params := fsrs6_parameters();
    SELECT COALESCE(target_retention, 0.9) INTO v_target
    FROM user_settings
    WHERE user_id = p_user_id;

    v_review_type := CASE WHEN v_status.fsrs_stability IS NULL THEN 'new' ELSE 'review' END;
    v_scheduled := v_status.next_review_at;

    v_compute := fsrs6_compute(
        v_status.fsrs_stability,
        v_status.fsrs_difficulty,
        v_status.last_reviewed_at,
        v_grade,
        v_target,
        v_status.fsrs_reps,
        v_status.fsrs_lapses,
        v_params
    );

    v_interval := (v_compute->>'interval')::numeric;
    v_meta := jsonb_build_object(
        'elapsed_days', (v_compute->>'elapsed')::numeric,
        'retrievability', (v_compute->>'retrievability')::numeric,
        'same_day', (v_compute->>'same_day')::boolean,
        'last_reviewed_at_before', v_status.last_reviewed_at
    );

    INSERT INTO user_card_status (
        user_id, entry_id, card_type_id,
        fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses, fsrs_last_grade,
        fsrs_last_interval, fsrs_target_retention, fsrs_params_version, fsrs_enabled,
        next_review_at, last_result, last_seen_at, last_reviewed_at,
        click_count, seen_count
    )
    VALUES (
        p_user_id, p_entry_id, p_card_type_id,
        (v_compute->>'stability')::numeric,
        (v_compute->>'difficulty')::numeric,
        (v_compute->>'reps')::int,
        (v_compute->>'lapses')::int,
        v_grade,
        v_interval,
        v_target,
        'fsrs-6-default',
        true,
        now() + (v_interval || ' days')::interval,
        p_result,
        now(),
        now(),
        COALESCE(v_status.click_count, 0),
        COALESCE(v_status.seen_count, 0) + 1
    )
    ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
    SET fsrs_stability = excluded.fsrs_stability,
        fsrs_difficulty = excluded.fsrs_difficulty,
        fsrs_reps = excluded.fsrs_reps,
        fsrs_lapses = excluded.fsrs_lapses,
        fsrs_last_grade = excluded.fsrs_last_grade,
        fsrs_last_interval = excluded.fsrs_last_interval,
        fsrs_target_retention = excluded.fsrs_target_retention,
        fsrs_params_version = excluded.fsrs_params_version,
        fsrs_enabled = true,
        next_review_at = excluded.next_review_at,
        last_result = excluded.last_result,
        last_seen_at = excluded.last_seen_at,
        last_reviewed_at = excluded.last_reviewed_at,
        seen_count = user_card_status.seen_count + 1;

    INSERT INTO user_review_log (
        user_id, word_id, mode, turn_id, grade, review_type,
        scheduled_at, reviewed_at,
        stability_before, difficulty_before,
        stability_after, difficulty_after,
        interval_after, params_version, metadata
    ) VALUES (
        p_user_id, p_entry_id, p_card_type_id, p_turn_id, v_grade, v_review_type,
        v_scheduled, now(),
        v_status.fsrs_stability, v_status.fsrs_difficulty,
        (v_compute->>'stability')::numeric,
        (v_compute->>'difficulty')::numeric,
        v_interval,
        'fsrs-6-default',
        v_meta
    );

    INSERT INTO user_events (user_id, word_id, mode, event_type)
    VALUES (p_user_id, p_entry_id, p_card_type_id, 'review_' || p_result);
END;
$function$;


-- FUNCTION record_card_view(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.record_card_view(p_user_id uuid, p_entry_id uuid, p_card_type_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_dictionary_id uuid;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
    FROM word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'word entry not found';
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RAISE EXCEPTION 'dictionary access denied';
    END IF;

    INSERT INTO user_card_status (user_id, entry_id, card_type_id, last_seen_at)
    VALUES (p_user_id, p_entry_id, p_card_type_id, now())
    ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
    SET last_seen_at = excluded.last_seen_at;
END;
$function$;


-- FUNCTION remove_entries_from_user_list(uuid,uuid,uuid[])
CREATE OR REPLACE FUNCTION public.remove_entries_from_user_list(p_user_id uuid, p_list_id uuid, p_entry_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    IF p_entry_ids IS NULL OR array_length(p_entry_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM user_word_lists
        WHERE id = p_list_id
          AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'list_not_found';
    END IF;

    DELETE FROM user_word_list_items
    WHERE list_id = p_list_id
      AND word_id = ANY(p_entry_ids);
END;
$function$;


-- FUNCTION start_learning_entry_card(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.start_learning_entry_card(p_user_id uuid, p_entry_id uuid, p_card_type_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_dictionary_id uuid;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
    FROM word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'word entry not found';
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RAISE EXCEPTION 'dictionary access denied';
    END IF;

    INSERT INTO user_card_status (
        user_id,
        entry_id,
        card_type_id,
        fsrs_enabled,
        next_review_at,
        last_seen_at,
        seen_count,
        hidden,
        frozen_until
    )
    VALUES (
        p_user_id,
        p_entry_id,
        p_card_type_id,
        true,
        now(),
        now(),
        1,
        false,
        null
    )
    ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
    SET fsrs_enabled = true,
        next_review_at = COALESCE(user_card_status.next_review_at, now()),
        last_seen_at = now(),
        seen_count = user_card_status.seen_count + 1,
        hidden = false,
        frozen_until = null;
END;
$function$;


-- FUNCTION update_active_word_list(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.update_active_word_list(p_user_id uuid, p_list_id uuid DEFAULT NULL::uuid, p_list_type text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_list_type text;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    v_list_type := CASE
        WHEN p_list_id IS NULL THEN NULL
        WHEN p_list_type IN ('curated', 'user') THEN p_list_type
        ELSE 'curated'
    END;

    INSERT INTO user_settings (user_id, active_list_id, active_list_type)
    VALUES (p_user_id, p_list_id, v_list_type)
    ON CONFLICT (user_id) DO UPDATE
    SET active_list_id = excluded.active_list_id,
        active_list_type = excluded.active_list_type;
END;
$function$;


-- FUNCTION update_learning_preferences(uuid,text[],text,text,integer,text)
CREATE OR REPLACE FUNCTION public.update_learning_preferences(p_user_id uuid, p_modes_enabled text[] DEFAULT NULL::text[], p_card_filter text DEFAULT NULL::text, p_language_code text DEFAULT NULL::text, p_new_review_ratio integer DEFAULT NULL::integer, p_active_scenario text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_modes_enabled text[];
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    v_modes_enabled := CASE
        WHEN p_modes_enabled IS NULL THEN NULL
        WHEN array_length(p_modes_enabled, 1) IS NULL THEN ARRAY['word-to-definition']::text[]
        ELSE p_modes_enabled
    END;

    INSERT INTO user_settings (
        user_id,
        modes_enabled,
        training_mode,
        card_filter,
        language_code,
        new_review_ratio,
        active_scenario
    )
    VALUES (
        p_user_id,
        COALESCE(v_modes_enabled, ARRAY['word-to-definition']::text[]),
        COALESCE(v_modes_enabled[1], 'word-to-definition'),
        COALESCE(p_card_filter, 'both'),
        COALESCE(p_language_code, 'nl'),
        COALESCE(p_new_review_ratio, 2),
        COALESCE(p_active_scenario, 'understanding')
    )
    ON CONFLICT (user_id) DO UPDATE
    SET modes_enabled = COALESCE(v_modes_enabled, user_settings.modes_enabled),
        training_mode = COALESCE(v_modes_enabled[1], user_settings.training_mode),
        card_filter = COALESCE(p_card_filter, user_settings.card_filter),
        language_code = COALESCE(p_language_code, user_settings.language_code),
        new_review_ratio = COALESCE(p_new_review_ratio, user_settings.new_review_ratio),
        active_scenario = COALESCE(p_active_scenario, user_settings.active_scenario),
        updated_at = now();
END;
$function$;


-- FUNCTION update_user_dictionary_entry(uuid,uuid,jsonb)
CREATE OR REPLACE FUNCTION public.update_user_dictionary_entry(p_user_id uuid, p_entry_id uuid, p_entry jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_existing word_entries%rowtype;
    v_dictionary dictionaries%rowtype;
    v_payload jsonb;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT * INTO v_existing
    FROM word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry_not_found';
    END IF;

    v_dictionary := assert_editable_user_dictionary(p_user_id, v_existing.dictionary_id);
    v_payload := validate_user_entry_v1_payload(p_entry, v_dictionary.language_code);

    IF EXISTS (
        SELECT 1
        FROM word_entries
        WHERE dictionary_id = v_existing.dictionary_id
          AND language_code = v_payload->>'languageCode'
          AND headword = v_payload->>'headword'
          AND meaning_id = v_existing.meaning_id
          AND id <> p_entry_id
    ) THEN
        RAISE EXCEPTION 'duplicate_user_entry';
    END IF;

    UPDATE word_entries
    SET language_code = v_payload->>'languageCode',
        headword = v_payload->>'headword',
        part_of_speech = v_payload->>'partOfSpeech',
        gender = v_payload->>'gender',
        is_nt2_2000 = false,
        raw = v_payload
    WHERE id = p_entry_id;

    RETURN p_entry_id;
END;
$function$;


-- FUNCTION update_user_word_list(uuid,uuid,text,text,text,text,text,text,text[],boolean)
CREATE OR REPLACE FUNCTION public.update_user_word_list(p_user_id uuid, p_list_id uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_language_code text DEFAULT NULL::text, p_primary_language_code text DEFAULT NULL::text, p_default_scenario_id text DEFAULT NULL::text, p_card_policy text DEFAULT NULL::text, p_card_type_ids text[] DEFAULT NULL::text[], p_clear_default_scenario boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
    v_existing user_word_lists%ROWTYPE;
    v_list user_word_lists%ROWTYPE;
    v_name text;
    v_language_code text;
    v_primary_language_code text;
    v_default_scenario_id text;
    v_card_policy text;
    v_card_type_ids text[];
    v_item_count int;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT * INTO v_existing
    FROM user_word_lists
    WHERE id = p_list_id
      AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'list_not_found';
    END IF;

    v_name := COALESCE(NULLIF(trim(p_name), ''), v_existing.name);
    IF v_name IS NULL THEN
        RAISE EXCEPTION 'invalid_list_name';
    END IF;

    v_language_code := COALESCE(
        NULLIF(trim(p_language_code), ''),
        v_existing.language_code
    );
    v_primary_language_code := COALESCE(
        NULLIF(trim(p_primary_language_code), ''),
        v_existing.primary_language_code,
        v_language_code
    );
    v_default_scenario_id := CASE
        WHEN COALESCE(p_clear_default_scenario, false) THEN NULL
        ELSE COALESCE(
            NULLIF(trim(p_default_scenario_id), ''),
            v_existing.default_scenario_id
        )
    END;
    v_card_policy := private.normalize_list_card_policy(
        p_card_policy,
        v_existing.card_policy
    );
    v_card_type_ids := CASE
        WHEN p_card_type_ids IS NULL THEN v_existing.card_type_ids
        ELSE ARRAY(
            SELECT DISTINCT trim(card_type_id)
            FROM unnest(p_card_type_ids) AS card_type_id
            WHERE NULLIF(trim(card_type_id), '') IS NOT NULL
            ORDER BY trim(card_type_id)
        )
    END;
    IF v_card_type_ids IS NOT NULL AND array_length(v_card_type_ids, 1) IS NULL THEN
        v_card_type_ids := NULL;
    END IF;

    IF v_language_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    IF v_primary_language_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM languages WHERE code = v_primary_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    PERFORM private.validate_list_training_intent(
        v_default_scenario_id,
        v_card_policy,
        v_card_type_ids
    );

    UPDATE user_word_lists
    SET name = v_name,
        description = CASE
            WHEN p_description IS NULL THEN description
            ELSE NULLIF(p_description, '')
        END,
        language_code = v_language_code,
        primary_language_code = v_primary_language_code,
        default_scenario_id = v_default_scenario_id,
        card_policy = v_card_policy,
        card_type_ids = v_card_type_ids,
        updated_at = now()
    WHERE id = p_list_id
      AND user_id = p_user_id
    RETURNING * INTO v_list;

    SELECT COUNT(*) INTO v_item_count
    FROM user_word_list_items
    WHERE list_id = v_list.id;

    RETURN jsonb_build_object(
        'id', v_list.id,
        'name', v_list.name,
        'description', v_list.description,
        'language_code', v_list.language_code,
        'primary_language_code', v_list.primary_language_code,
        'default_scenario_id', v_list.default_scenario_id,
        'card_policy', v_list.card_policy,
        'card_type_ids', v_list.card_type_ids,
        'created_at', v_list.created_at,
        'user_word_list_items', jsonb_build_array(jsonb_build_object('count', v_item_count))
    );
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'duplicate_user_list';
END;
$function$;


CREATE OR REPLACE FUNCTION public.ensure_user_dictionary(p_user_id uuid, p_language_code text DEFAULT 'nl'::text, p_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_dictionary_id uuid;
    v_language_code text := COALESCE(NULLIF(trim(p_language_code), ''), 'nl');
    v_name text := COALESCE(NULLIF(trim(p_name), ''), 'My dictionary');
    v_slug text;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    v_slug := 'user-' || replace(p_user_id::text, '-', '') || '-' || v_language_code;

    INSERT INTO dictionaries (
        language_code,
        slug,
        name,
        description,
        kind,
        visibility,
        owner_user_id,
        is_editable,
        minimum_subscription_tier,
        schema_key,
        schema_version,
        source_provider
    )
    VALUES (
        v_language_code,
        v_slug,
        v_name,
        'Private user-owned editable dictionary.',
        'user',
        'private',
        p_user_id,
        true,
        'free',
        'user-entry-v1',
        1,
        'user'
    )
    ON CONFLICT (language_code, slug) DO UPDATE
    SET name = excluded.name,
        owner_user_id = excluded.owner_user_id,
        is_editable = true,
        schema_key = 'user-entry-v1',
        schema_version = 1,
        updated_at = now()
    RETURNING id INTO v_dictionary_id;

    RETURN v_dictionary_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_available_word_lists(p_user_id uuid, p_language_code text DEFAULT NULL::text, p_list_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    WITH curated AS (
        SELECT jsonb_build_object(
            'id', l.id,
            'list_type', 'curated',
            'name', l.name,
            'description', l.description,
            'language_code', l.language_code,
            'primary_language_code', l.primary_language_code,
            'default_scenario_id', l.default_scenario_id,
            'card_policy', l.card_policy,
            'card_type_ids', l.card_type_ids,
            'is_primary', l.is_primary,
            'sort_order', l.sort_order,
            'word_list_items', jsonb_build_array(jsonb_build_object(
                'count', (
                    SELECT COUNT(*)::int
                    FROM word_list_items item
                    WHERE item.list_id = l.id
                )
            ))
        ) AS row,
        COALESCE(l.sort_order, 2147483647) AS sort_order,
        l.is_primary,
        l.name,
        NULL::timestamptz AS created_at
        FROM word_lists l
        WHERE (p_list_type IS NULL OR p_list_type = 'curated')
          AND (p_language_code IS NULL OR l.language_code = p_language_code)
    ),
    user_lists AS (
        SELECT jsonb_build_object(
            'id', l.id,
            'list_type', 'user',
            'name', l.name,
            'description', l.description,
            'language_code', l.language_code,
            'primary_language_code', l.primary_language_code,
            'default_scenario_id', l.default_scenario_id,
            'card_policy', l.card_policy,
            'card_type_ids', l.card_type_ids,
            'created_at', l.created_at,
            'user_word_list_items', jsonb_build_array(jsonb_build_object(
                'count', (
                    SELECT COUNT(*)::int
                    FROM user_word_list_items item
                    WHERE item.list_id = l.id
                )
            ))
        ) AS row,
        2147483647 AS sort_order,
        false AS is_primary,
        l.name,
        l.created_at
        FROM user_word_lists l
        WHERE (p_list_type IS NULL OR p_list_type = 'user')
          AND l.user_id = p_user_id
    ),
    combined AS (
        SELECT row, 0 AS group_order, sort_order, is_primary, name, created_at
        FROM curated
        UNION ALL
        SELECT row, 1 AS group_order, sort_order, is_primary, name, created_at
        FROM user_lists
    )
    SELECT COALESCE(
        jsonb_agg(row ORDER BY group_order, sort_order, is_primary DESC, name ASC, created_at DESC),
        '[]'::jsonb
    )
    INTO v_result
    FROM combined;

    RETURN v_result;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_card_user_state(p_user_id uuid, p_word_id uuid, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_dictionary_id uuid;
    v_result jsonb;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
    FROM word_entries
    WHERE id = p_word_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RETURN NULL;
    END IF;

    SELECT jsonb_build_object(
        'fsrs_last_interval', s.fsrs_last_interval,
        'fsrs_reps', s.fsrs_reps,
        'fsrs_stability', s.fsrs_stability,
        'fsrs_difficulty', s.fsrs_difficulty,
        'fsrs_lapses', s.fsrs_lapses,
        'fsrs_last_grade', s.fsrs_last_grade,
        'fsrs_params_version', s.fsrs_params_version,
        'click_count', s.click_count,
        'seen_count', s.seen_count,
        'success_count', s.success_count,
        'last_seen_at', s.last_seen_at,
        'last_reviewed_at', s.last_reviewed_at,
        'next_review_at', s.next_review_at,
        'hidden', s.hidden,
        'frozen_until', s.frozen_until,
        'in_learning', s.in_learning,
        'learning_due_at', s.learning_due_at
    )
    INTO v_result
    FROM user_card_status s
    WHERE s.user_id = p_user_id
      AND s.entry_id = p_word_id
      AND s.card_type_id = p_mode;

    RETURN v_result;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tier text;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT COALESCE(subscription_tier, 'free')
    INTO v_tier
    FROM user_settings
    WHERE user_id = p_user_id;

    RETURN COALESCE(v_tier, 'free');
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_word_list_summary(p_user_id uuid, p_list_id uuid, p_list_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF p_list_type = 'user' THEN
        SELECT jsonb_build_object(
            'id', l.id,
            'name', l.name,
            'description', l.description,
            'language_code', l.language_code,
            'primary_language_code', l.primary_language_code,
            'default_scenario_id', l.default_scenario_id,
            'card_policy', l.card_policy,
            'card_type_ids', l.card_type_ids,
            'created_at', l.created_at,
            'user_word_list_items', jsonb_build_array(jsonb_build_object(
                'count', (
                    SELECT COUNT(*)::int
                    FROM user_word_list_items item
                    WHERE item.list_id = l.id
                )
            ))
        )
        INTO v_result
        FROM user_word_lists l
        WHERE l.id = p_list_id
          AND l.user_id = p_user_id;

        RETURN v_result;
    END IF;

    SELECT jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'description', l.description,
        'language_code', l.language_code,
        'primary_language_code', l.primary_language_code,
        'default_scenario_id', l.default_scenario_id,
        'card_policy', l.card_policy,
        'card_type_ids', l.card_type_ids,
        'is_primary', l.is_primary,
        'word_list_items', jsonb_build_array(jsonb_build_object(
            'count', (
                SELECT COUNT(*)::int
                FROM word_list_items item
                WHERE item.list_id = l.id
            )
        ))
    )
    INTO v_result
    FROM word_lists l
    WHERE l.id = p_list_id;

    RETURN v_result;
END;
$function$;



-- Ensure search_path is fixed for functions whose earlier definitions lacked it.
ALTER FUNCTION public.get_next_card(uuid, text[], uuid[], uuid, text, text, text, text[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_scenario_word_stats(uuid, uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_scenario_stats(uuid, text, uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_training_scenarios() SECURITY INVOKER;
ALTER FUNCTION public.get_training_scenarios() SET search_path = public, pg_temp;

-- Remove default PUBLIC/anon execute from sensitive RPCs and grant only to authenticated.
REVOKE EXECUTE ON FUNCTION public.get_next_card(uuid, text[], uuid[], uuid, text, text, text, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_card_review(uuid, uuid, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_card_view(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_learning_entry_card(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_card_state(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_recent_training_history(uuid, timestamptz, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_learning_preferences(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_learning_preferences(uuid, text[], text, text, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_active_word_list(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_active_word_list(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_scenario_word_stats(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_scenario_stats(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_user_word_list(uuid, text, text, text, text, text, text, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_user_word_list(uuid, uuid, text, text, text, text, text, text, text[], boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_user_word_list(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_entry_to_user_list(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_entries_from_user_list(uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_list_membership(uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_list_memberships_for_entries(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copy_entry_to_user_dictionary(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_user_dictionary_entry(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_user_dictionary_entry(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_user_dictionary_entry(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fetch_dictionary_entry_by_id_gated(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_user_dictionary(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_available_word_lists(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_card_user_state(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_tier(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_word_list_summary(uuid, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_next_card(uuid, text[], uuid[], uuid, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_card_review(uuid, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_card_view(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_learning_entry_card(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_card_state(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_training_history(uuid, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_learning_preferences(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_learning_preferences(uuid, text[], text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_word_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_active_word_list(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scenario_word_stats(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scenario_stats(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_scenarios() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_word_list(uuid, text, text, text, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_word_list(uuid, uuid, text, text, text, text, text, text, text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_word_list(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_entry_to_user_list(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_entries_from_user_list(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_list_membership(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_list_memberships_for_entries(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_entry_to_user_dictionary(uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_dictionary_entry(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_dictionary_entry(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_dictionary_entry(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_dictionary_entry_by_id_gated(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_dictionary(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_word_lists(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_card_user_state(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_word_list_summary(uuid, uuid, text) TO authenticated;
