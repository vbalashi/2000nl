-- Multilanguage search/list/training-scope contracts.
--
-- Active training scope is training-critical state and is stored per learning
-- language. The legacy user_settings active-list columns remain as the default
-- language compatibility bridge.

CREATE TABLE IF NOT EXISTS user_training_scopes (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    language_code text NOT NULL REFERENCES languages(code),
    active_list_id uuid,
    active_list_type text CHECK (active_list_type IN ('curated', 'user')),
    active_scenario text DEFAULT 'understanding',
    card_filter text DEFAULT 'both' CHECK (card_filter IN ('new', 'review', 'both')),
    modes_enabled text[] DEFAULT ARRAY['word-to-definition']::text[],
    new_review_ratio int DEFAULT 2,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, language_code)
);

INSERT INTO user_training_scopes (
    user_id,
    language_code,
    active_list_id,
    active_list_type,
    active_scenario,
    card_filter,
    modes_enabled,
    new_review_ratio,
    created_at,
    updated_at
)
SELECT
    s.user_id,
    COALESCE(NULLIF(s.language_code, ''), 'nl'),
    s.active_list_id,
    CASE
        WHEN s.active_list_id IS NULL THEN NULL
        WHEN s.active_list_type IN ('curated', 'user') THEN s.active_list_type
        ELSE 'curated'
    END,
    COALESCE(s.active_scenario, 'understanding'),
    COALESCE(s.card_filter, 'both'),
    COALESCE(s.modes_enabled, ARRAY['word-to-definition']::text[]),
    COALESCE(s.new_review_ratio, 2),
    now(),
    COALESCE(s.updated_at, now())
FROM user_settings s
WHERE s.active_list_id IS NOT NULL
ON CONFLICT (user_id, language_code) DO UPDATE
SET active_list_id = excluded.active_list_id,
    active_list_type = excluded.active_list_type,
    active_scenario = excluded.active_scenario,
    card_filter = excluded.card_filter,
    modes_enabled = excluded.modes_enabled,
    new_review_ratio = excluded.new_review_ratio,
    updated_at = now();

CREATE OR REPLACE FUNCTION get_available_learning_languages(
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    WITH dictionary_counts AS (
        SELECT
            d.language_code,
            COUNT(*)::int AS dictionary_count
        FROM dictionaries d
        WHERE can_access_dictionary(p_user_id, d.id, 'read')
          AND EXISTS (
            SELECT 1
            FROM word_entries w
            WHERE w.dictionary_id = d.id
              AND w.language_code = d.language_code
          )
        GROUP BY d.language_code
    ),
    curated_counts AS (
        SELECT
            l.language_code,
            COUNT(*)::int AS curated_list_count
        FROM word_lists l
        WHERE EXISTS (
            SELECT 1 FROM word_list_items item WHERE item.list_id = l.id
        )
        GROUP BY l.language_code
    ),
    user_counts AS (
        SELECT
            COALESCE(l.primary_language_code, l.language_code) AS language_code,
            COUNT(*)::int AS user_list_count
        FROM user_word_lists l
        WHERE l.user_id = p_user_id
          AND EXISTS (
            SELECT 1 FROM user_word_list_items item WHERE item.list_id = l.id
        )
        GROUP BY COALESCE(l.primary_language_code, l.language_code)
    ),
    available AS (
        SELECT language_code FROM dictionary_counts
        UNION
        SELECT language_code FROM curated_counts
        UNION
        SELECT language_code FROM user_counts
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'code', lang.code,
                'label', lang.name,
                'dictionary_count', COALESCE(dictionary_counts.dictionary_count, 0),
                'curated_list_count', COALESCE(curated_counts.curated_list_count, 0),
                'user_list_count', COALESCE(user_counts.user_list_count, 0),
                'has_training_eligible_lists',
                    COALESCE(curated_counts.curated_list_count, 0)
                    + COALESCE(user_counts.user_list_count, 0) > 0
            )
            ORDER BY lang.code
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM available
    JOIN languages lang ON lang.code = available.language_code
    LEFT JOIN dictionary_counts ON dictionary_counts.language_code = lang.code
    LEFT JOIN curated_counts ON curated_counts.language_code = lang.code
    LEFT JOIN user_counts ON user_counts.language_code = lang.code;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION get_available_dictionary_sources(
    p_user_id uuid,
    p_language_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_result jsonb;
BEGIN
    IF p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF v_language_code IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', d.id,
                'language_code', d.language_code,
                'slug', d.slug,
                'name', d.name,
                'kind', d.kind,
                'visibility', d.visibility,
                'is_editable', d.is_editable,
                'entry_count', source_counts.entry_count
            )
            ORDER BY
                CASE WHEN d.kind = 'user' AND d.owner_user_id = p_user_id THEN 0 ELSE 1 END,
                d.name ASC,
                d.slug ASC
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM dictionaries d
    JOIN LATERAL (
        SELECT COUNT(*)::int AS entry_count
        FROM word_entries w
        WHERE w.dictionary_id = d.id
          AND w.language_code = d.language_code
    ) source_counts ON true
    WHERE d.language_code = v_language_code
      AND source_counts.entry_count > 0
      AND can_access_dictionary(p_user_id, d.id, 'read');

    RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS get_active_word_list(uuid);
CREATE OR REPLACE FUNCTION get_active_word_list(
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_language_code text;
BEGIN
    IF p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT COALESCE(NULLIF(language_code, ''), 'nl')
    INTO v_language_code
    FROM user_settings
    WHERE user_id = p_user_id;

    RETURN get_active_training_scope(p_user_id, COALESCE(v_language_code, 'nl'));
END;
$$;

CREATE OR REPLACE FUNCTION get_active_training_scope(
    p_user_id uuid,
    p_language_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_language_code text := COALESCE(NULLIF(trim(p_language_code), ''), 'nl');
    v_scope user_training_scopes%rowtype;
    v_valid boolean := false;
    v_result jsonb;
BEGIN
    IF p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT *
    INTO v_scope
    FROM user_training_scopes
    WHERE user_id = p_user_id
      AND language_code = v_language_code;

    IF v_scope.user_id IS NOT NULL AND v_scope.active_list_id IS NOT NULL THEN
        IF v_scope.active_list_type = 'curated' THEN
            SELECT EXISTS (
                SELECT 1
                FROM word_lists l
                WHERE l.id = v_scope.active_list_id
                  AND l.language_code = v_language_code
            )
            INTO v_valid;
        ELSIF v_scope.active_list_type = 'user' THEN
            SELECT EXISTS (
                SELECT 1
                FROM user_word_lists l
                WHERE l.id = v_scope.active_list_id
                  AND l.user_id = p_user_id
                  AND (
                    COALESCE(l.primary_language_code, l.language_code) = v_language_code
                    OR (l.primary_language_code IS NULL AND l.language_code = v_language_code)
                  )
            )
            INTO v_valid;
        END IF;
    END IF;

    IF v_scope.user_id IS NOT NULL AND v_scope.active_list_id IS NOT NULL AND NOT v_valid THEN
        UPDATE user_training_scopes
        SET active_list_id = NULL,
            active_list_type = NULL,
            updated_at = now()
        WHERE user_id = p_user_id
          AND language_code = v_language_code;

        v_scope.active_list_id := NULL;
        v_scope.active_list_type := NULL;
    END IF;

    SELECT jsonb_build_object(
        'language_code', v_language_code,
        'active_list_id', v_scope.active_list_id,
        'active_list_type', v_scope.active_list_type,
        'active_scenario', COALESCE(v_scope.active_scenario, settings.active_scenario, 'understanding'),
        'card_filter', COALESCE(v_scope.card_filter, settings.card_filter, 'both'),
        'modes_enabled', COALESCE(v_scope.modes_enabled, settings.modes_enabled, ARRAY['word-to-definition']::text[]),
        'new_review_ratio', COALESCE(v_scope.new_review_ratio, settings.new_review_ratio, 2),
        'has_saved_scope', v_scope.user_id IS NOT NULL,
        'is_valid', COALESCE(v_valid, false)
    )
    INTO v_result
    FROM user_settings settings
    WHERE settings.user_id = p_user_id;

    RETURN COALESCE(v_result, jsonb_build_object(
        'language_code', v_language_code,
        'active_list_id', NULL,
        'active_list_type', NULL,
        'active_scenario', 'understanding',
        'card_filter', 'both',
        'modes_enabled', ARRAY['word-to-definition']::text[],
        'new_review_ratio', 2,
        'has_saved_scope', false,
        'is_valid', false
    ));
END;
$$;

DROP FUNCTION IF EXISTS update_active_word_list(uuid, uuid, text);
CREATE OR REPLACE FUNCTION update_active_word_list(
    p_user_id uuid,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_language_code text;
BEGIN
    IF p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT COALESCE(NULLIF(language_code, ''), 'nl')
    INTO v_language_code
    FROM user_settings
    WHERE user_id = p_user_id;

    PERFORM update_active_training_scope(
        p_user_id,
        COALESCE(v_language_code, 'nl'),
        p_list_id,
        p_list_type,
        NULL,
        NULL,
        NULL,
        NULL
    );
END;
$$;

CREATE OR REPLACE FUNCTION update_active_training_scope(
    p_user_id uuid,
    p_language_code text,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT NULL,
    p_active_scenario text DEFAULT NULL,
    p_card_filter text DEFAULT NULL,
    p_modes_enabled text[] DEFAULT NULL,
    p_new_review_ratio int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_language_code text := COALESCE(NULLIF(trim(p_language_code), ''), 'nl');
    v_list_type text;
    v_modes_enabled text[];
BEGIN
    IF p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'invalid language_code %', v_language_code;
    END IF;

    v_list_type := CASE
        WHEN p_list_id IS NULL THEN NULL
        WHEN p_list_type IN ('curated', 'user') THEN p_list_type
        ELSE 'curated'
    END;

    IF p_list_id IS NOT NULL AND v_list_type = 'curated' AND NOT EXISTS (
        SELECT 1
        FROM word_lists l
        WHERE l.id = p_list_id
          AND l.language_code = v_language_code
    ) THEN
        RAISE EXCEPTION 'curated list is not available for language %', v_language_code;
    END IF;

    IF p_list_id IS NOT NULL AND v_list_type = 'user' AND NOT EXISTS (
        SELECT 1
        FROM user_word_lists l
        WHERE l.id = p_list_id
          AND l.user_id = p_user_id
          AND (
            COALESCE(l.primary_language_code, l.language_code) = v_language_code
            OR (l.primary_language_code IS NULL AND l.language_code = v_language_code)
          )
    ) THEN
        RAISE EXCEPTION 'user list is not available for language %', v_language_code;
    END IF;

    v_modes_enabled := CASE
        WHEN p_modes_enabled IS NULL THEN NULL
        WHEN array_length(p_modes_enabled, 1) IS NULL THEN ARRAY['word-to-definition']::text[]
        ELSE p_modes_enabled
    END;

    INSERT INTO user_training_scopes (
        user_id,
        language_code,
        active_list_id,
        active_list_type,
        active_scenario,
        card_filter,
        modes_enabled,
        new_review_ratio
    )
    VALUES (
        p_user_id,
        v_language_code,
        p_list_id,
        v_list_type,
        COALESCE(p_active_scenario, 'understanding'),
        COALESCE(p_card_filter, 'both'),
        COALESCE(v_modes_enabled, ARRAY['word-to-definition']::text[]),
        COALESCE(p_new_review_ratio, 2)
    )
    ON CONFLICT (user_id, language_code) DO UPDATE
    SET active_list_id = excluded.active_list_id,
        active_list_type = excluded.active_list_type,
        active_scenario = COALESCE(p_active_scenario, user_training_scopes.active_scenario),
        card_filter = COALESCE(p_card_filter, user_training_scopes.card_filter),
        modes_enabled = COALESCE(v_modes_enabled, user_training_scopes.modes_enabled),
        new_review_ratio = COALESCE(p_new_review_ratio, user_training_scopes.new_review_ratio),
        updated_at = now();

    IF EXISTS (
        SELECT 1
        FROM user_settings
        WHERE user_id = p_user_id
          AND COALESCE(NULLIF(language_code, ''), 'nl') = v_language_code
    ) THEN
        INSERT INTO user_settings (user_id, active_list_id, active_list_type)
        VALUES (p_user_id, p_list_id, v_list_type)
        ON CONFLICT (user_id) DO UPDATE
        SET active_list_id = excluded.active_list_id,
            active_list_type = excluded.active_list_type,
            updated_at = now();
    END IF;

    RETURN get_active_training_scope(p_user_id, v_language_code);
END;
$$;

DROP FUNCTION IF EXISTS get_available_word_lists(uuid, text, text);
CREATE OR REPLACE FUNCTION get_available_word_lists(
    p_user_id uuid,
    p_language_code text DEFAULT NULL,
    p_list_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_result jsonb;
BEGIN
    IF p_user_id IS DISTINCT FROM (select auth.uid()) THEN
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
            'is_mixed_language', false,
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
          AND (v_language_code IS NULL OR l.language_code = v_language_code)
    ),
    user_lists AS (
        SELECT jsonb_build_object(
            'id', l.id,
            'list_type', 'user',
            'name', l.name,
            'description', l.description,
            'language_code', l.language_code,
            'primary_language_code', l.primary_language_code,
            'is_mixed_language', item_languages.language_count > 1,
            'created_at', l.created_at,
            'user_word_list_items', jsonb_build_array(jsonb_build_object(
                'count', item_languages.item_count
            ))
        ) AS row,
        2147483647 AS sort_order,
        false AS is_primary,
        l.name,
        l.created_at
        FROM user_word_lists l
        JOIN LATERAL (
            SELECT
                COUNT(*)::int AS item_count,
                COUNT(DISTINCT w.language_code)::int AS language_count
            FROM user_word_list_items item
            JOIN word_entries w ON w.id = item.word_id
            WHERE item.list_id = l.id
        ) item_languages ON true
        WHERE (p_list_type IS NULL OR p_list_type = 'user')
          AND l.user_id = p_user_id
          AND (
            v_language_code IS NULL
            OR item_languages.language_count > 1
            OR (
                item_languages.language_count <= 1
                AND (
                    COALESCE(l.primary_language_code, l.language_code) = v_language_code
                    OR (l.primary_language_code IS NULL AND l.language_code = v_language_code)
                )
            )
          )
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
$$;

DROP FUNCTION IF EXISTS search_word_entries_gated(text, text, boolean, boolean, boolean, int, int);
CREATE OR REPLACE FUNCTION search_word_entries_gated(
    p_query text DEFAULT NULL,
    p_part_of_speech text DEFAULT NULL,
    p_is_nt2 boolean DEFAULT NULL,
    p_filter_frozen boolean DEFAULT NULL,
    p_filter_hidden boolean DEFAULT NULL,
    p_page int DEFAULT 1,
    p_page_size int DEFAULT 20,
    p_language_code text DEFAULT NULL,
    p_dictionary_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_user_id uuid;
    v_tier text;
    v_query text;
    v_like_query text;
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_dictionary_ids uuid[] := COALESCE(p_dictionary_ids, ARRAY[]::uuid[]);
    v_offset int;
    v_limit int;
    v_total int;
    v_max_allowed int;
    v_items jsonb;
BEGIN
    v_user_id := (select auth.uid());
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'is_locked', true, 'max_allowed', 0);
    END IF;

    v_tier := get_user_tier(v_user_id);
    v_query := NULLIF(lower(trim(COALESCE(p_query, ''))), '');
    v_like_query := CASE WHEN v_query IS NULL THEN NULL ELSE '%' || v_query || '%' END;
    v_max_allowed := CASE WHEN v_tier IN ('premium', 'admin') THEN NULL ELSE 100 END;
    v_offset := (GREATEST(p_page, 1) - 1) * p_page_size;
    v_limit := p_page_size;

    WITH visible_entries AS (
        SELECT w.*, d.name AS dictionary_name, d.slug AS dictionary_slug, d.kind AS dictionary_kind, d.owner_user_id
        FROM word_entries w
        LEFT JOIN dictionaries d ON d.id = w.dictionary_id
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
          AND (v_language_code IS NULL OR w.language_code = v_language_code)
          AND (array_length(v_dictionary_ids, 1) IS NULL OR w.dictionary_id = ANY(v_dictionary_ids))
          AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
          AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
          AND (p_filter_hidden IS NULL OR p_filter_hidden = false
               OR EXISTS (SELECT 1 FROM user_card_status s WHERE s.user_id = v_user_id AND s.entry_id = w.id AND COALESCE(s.hidden, false) = true))
          AND (p_filter_frozen IS NULL OR p_filter_frozen = false
               OR EXISTS (SELECT 1 FROM user_card_status s WHERE s.user_id = v_user_id AND s.entry_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
    ),
    ranked_entries AS (
        SELECT
            v.*,
            CASE
                WHEN v_query IS NULL THEN 6
                WHEN lower(v.headword) = v_query THEN 1
                WHEN EXISTS (
                    SELECT 1
                    FROM word_forms f
                    WHERE f.word_id = v.id
                      AND lower(f.form) = v_query
                      AND (
                        (f.dictionary_id IS NULL AND v.dictionary_id IS NULL)
                        OR f.dictionary_id = v.dictionary_id
                      )
                ) THEN 2
                WHEN lower(v.headword) LIKE v_like_query THEN 3
                WHEN lower(COALESCE(v.raw#>>'{example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,examples}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{translation,text}', '')) LIKE v_like_query
                    THEN 4
                WHEN lower(COALESCE(v.raw#>>'{definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,context}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{notes}', '')) LIKE v_like_query
                    THEN 5
                WHEN lower(v.raw::text) LIKE v_like_query THEN 6
                ELSE NULL
            END AS search_group_rank,
            CASE
                WHEN v.dictionary_kind = 'user' AND v.owner_user_id = v_user_id THEN 0
                WHEN v.dictionary_kind = 'curated' THEN 1
                ELSE 2
            END AS dictionary_rank,
            CASE
                WHEN v_query IS NULL THEN 0
                WHEN lower(v.headword) = v_query THEN 0
                WHEN lower(v.headword) LIKE v_query || '%' THEN 1
                WHEN lower(v.headword) LIKE v_like_query THEN 2
                ELSE 3
            END AS headword_rank
        FROM visible_entries v
    )
    SELECT COUNT(*) INTO v_total
    FROM ranked_entries
    WHERE search_group_rank IS NOT NULL;

    IF v_max_allowed IS NOT NULL AND v_offset >= v_max_allowed THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', v_total, 'is_locked', true, 'max_allowed', v_max_allowed);
    END IF;

    IF v_max_allowed IS NOT NULL AND (v_offset + v_limit) > v_max_allowed THEN
        v_limit := v_max_allowed - v_offset;
    END IF;

    WITH visible_entries AS (
        SELECT w.*, d.name AS dictionary_name, d.slug AS dictionary_slug, d.kind AS dictionary_kind, d.owner_user_id
        FROM word_entries w
        LEFT JOIN dictionaries d ON d.id = w.dictionary_id
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
          AND (v_language_code IS NULL OR w.language_code = v_language_code)
          AND (array_length(v_dictionary_ids, 1) IS NULL OR w.dictionary_id = ANY(v_dictionary_ids))
          AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
          AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
          AND (p_filter_hidden IS NULL OR p_filter_hidden = false
               OR EXISTS (SELECT 1 FROM user_card_status s WHERE s.user_id = v_user_id AND s.entry_id = w.id AND COALESCE(s.hidden, false) = true))
          AND (p_filter_frozen IS NULL OR p_filter_frozen = false
               OR EXISTS (SELECT 1 FROM user_card_status s WHERE s.user_id = v_user_id AND s.entry_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
    ),
    ranked_entries AS (
        SELECT
            v.*,
            CASE
                WHEN v_query IS NULL THEN 6
                WHEN lower(v.headword) = v_query THEN 1
                WHEN EXISTS (
                    SELECT 1
                    FROM word_forms f
                    WHERE f.word_id = v.id
                      AND lower(f.form) = v_query
                      AND (
                        (f.dictionary_id IS NULL AND v.dictionary_id IS NULL)
                        OR f.dictionary_id = v.dictionary_id
                      )
                ) THEN 2
                WHEN lower(v.headword) LIKE v_like_query THEN 3
                WHEN lower(COALESCE(v.raw#>>'{example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,examples}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{translation,text}', '')) LIKE v_like_query
                    THEN 4
                WHEN lower(COALESCE(v.raw#>>'{definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,context}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{notes}', '')) LIKE v_like_query
                    THEN 5
                WHEN lower(v.raw::text) LIKE v_like_query THEN 6
                ELSE NULL
            END AS search_group_rank,
            CASE
                WHEN v_query IS NULL THEN 'fallback'
                WHEN lower(v.headword) = v_query THEN 'exact-headword'
                WHEN EXISTS (
                    SELECT 1
                    FROM word_forms f
                    WHERE f.word_id = v.id
                      AND lower(f.form) = v_query
                      AND (
                        (f.dictionary_id IS NULL AND v.dictionary_id IS NULL)
                        OR f.dictionary_id = v.dictionary_id
                      )
                ) THEN 'lemma-or-inflection'
                WHEN lower(v.headword) LIKE v_like_query THEN 'related-headword'
                WHEN lower(COALESCE(v.raw#>>'{example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,examples}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{translation,text}', '')) LIKE v_like_query
                    THEN 'example'
                WHEN lower(COALESCE(v.raw#>>'{definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,context}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{notes}', '')) LIKE v_like_query
                    THEN 'definition'
                ELSE 'fallback'
            END AS search_match_group,
            CASE
                WHEN v_query IS NULL THEN 'Bladeren'
                WHEN lower(v.headword) = v_query THEN 'Exacte match'
                WHEN EXISTS (
                    SELECT 1
                    FROM word_forms f
                    WHERE f.word_id = v.id
                      AND lower(f.form) = v_query
                      AND (
                        (f.dictionary_id IS NULL AND v.dictionary_id IS NULL)
                        OR f.dictionary_id = v.dictionary_id
                      )
                ) THEN 'Woordvorm'
                WHEN lower(v.headword) LIKE v_like_query THEN 'Samenstelling'
                WHEN lower(COALESCE(v.raw#>>'{example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,examples}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{translation,text}', '')) LIKE v_like_query
                    THEN 'In voorbeeld'
                WHEN lower(COALESCE(v.raw#>>'{definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,context}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{notes}', '')) LIKE v_like_query
                    THEN 'In betekenis'
                ELSE 'Bladeren'
            END AS search_match_label,
            CASE
                WHEN v.dictionary_kind = 'user' AND v.owner_user_id = v_user_id THEN 0
                WHEN v.dictionary_kind = 'curated' THEN 1
                ELSE 2
            END AS dictionary_rank,
            CASE
                WHEN v_query IS NULL THEN 0
                WHEN lower(v.headword) = v_query THEN 0
                WHEN lower(v.headword) LIKE v_query || '%' THEN 1
                WHEN lower(v.headword) LIKE v_like_query THEN 2
                ELSE 3
            END AS headword_rank
        FROM visible_entries v
    )
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_items
    FROM (
        SELECT
            id,
            dictionary_id,
            dictionary_name,
            dictionary_slug,
            dictionary_kind,
            language_code,
            headword,
            part_of_speech,
            gender,
            raw,
            is_nt2_2000,
            search_group_rank,
            search_match_group,
            search_match_label,
            NULL::text AS search_matched_text
        FROM ranked_entries
        WHERE search_group_rank IS NOT NULL
        ORDER BY search_group_rank ASC, dictionary_rank ASC, headword_rank ASC, lower(headword) ASC, meaning_id ASC
        OFFSET v_offset LIMIT v_limit
    ) t;

    RETURN jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'is_locked', v_max_allowed IS NOT NULL AND v_total > v_max_allowed,
        'max_allowed', v_max_allowed
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_available_learning_languages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_dictionary_sources(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_word_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_active_word_list(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_training_scope(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_active_training_scope(uuid, text, uuid, text, text, text, text[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_word_lists(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION search_word_entries_gated(text, text, boolean, boolean, boolean, int, int, text, uuid[]) TO authenticated;
