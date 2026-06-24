-- Replace grouped-search readiness full-table counts with bounded existence
-- checks. This preserves search_index_not_ready behavior without making every
-- grouped search count all search documents and fields.

CREATE OR REPLACE FUNCTION private.dictionary_search_index_ready_v1()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
    SELECT
        EXISTS (SELECT 1 FROM dictionary_search_documents LIMIT 1)
        AND EXISTS (SELECT 1 FROM dictionary_search_fields LIMIT 1);
$$;

CREATE OR REPLACE FUNCTION search_dictionary_groups_v1(
    p_query text,
    p_language_code text DEFAULT NULL,
    p_dictionary_ids uuid[] DEFAULT NULL,
    p_group text DEFAULT NULL,
    p_limit int DEFAULT 6,
    p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_user_id uuid := (select auth.uid());
    v_raw_query text := NULLIF(trim(COALESCE(p_query, '')), '');
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_group text := NULLIF(trim(COALESCE(p_group, '')), '');
    v_groups jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'unauthenticated');
    END IF;

    IF NOT private.dictionary_search_index_ready_v1() THEN
        RETURN jsonb_build_object(
            'error', 'search_index_not_ready',
            'detail', 'Grouped dictionary search index is not ready.'
        );
    END IF;

    IF v_group IS NOT NULL THEN
        v_groups := jsonb_build_array(
            private.search_dictionary_group_keyset_v1(
                v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, v_group, p_limit, p_cursor
            )
        );
    ELSE
        SELECT jsonb_agg(group_payload ORDER BY group_rank)
        INTO v_groups
        FROM (
            VALUES
                (1, private.search_dictionary_group_keyset_v1(v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, 'headwords', p_limit, NULL)),
                (2, private.search_dictionary_group_keyset_v1(v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, 'examples', p_limit, NULL)),
                (3, private.search_dictionary_group_keyset_v1(v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, 'definitions', p_limit, NULL)),
                (4, private.search_dictionary_group_keyset_v1(v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, 'alphabetical', p_limit, NULL))
        ) AS groups(group_rank, group_payload);
    END IF;

    v_groups := private.clean_dictionary_search_groups_v1(v_groups);

    RETURN jsonb_build_object(
        'contractVersion', 'dictionary-search-v1',
        'query', v_raw_query,
        'request', jsonb_strip_nulls(jsonb_build_object(
            'languageCode', v_language_code,
            'scope', 'authenticated',
            'group', v_group
        )),
        'groups', COALESCE(v_groups, '[]'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION search_public_dictionary_groups_v1(
    p_query text,
    p_language_code text DEFAULT NULL,
    p_group text DEFAULT NULL,
    p_limit int DEFAULT 6,
    p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_raw_query text := NULLIF(trim(COALESCE(p_query, '')), '');
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_group text := NULLIF(trim(COALESCE(p_group, '')), '');
    v_groups jsonb;
BEGIN
    IF NOT private.dictionary_search_index_ready_v1() THEN
        RETURN jsonb_build_object(
            'error', 'search_index_not_ready',
            'detail', 'Grouped dictionary search index is not ready.'
        );
    END IF;

    IF v_group IS NOT NULL THEN
        v_groups := jsonb_build_array(
            private.search_dictionary_group_keyset_v1(
                NULL, true, v_raw_query, v_language_code, NULL, v_group, p_limit, p_cursor
            )
        );
    ELSE
        SELECT jsonb_agg(group_payload ORDER BY group_rank)
        INTO v_groups
        FROM (
            VALUES
                (1, private.search_dictionary_group_keyset_v1(NULL, true, v_raw_query, v_language_code, NULL, 'headwords', p_limit, NULL)),
                (2, private.search_dictionary_group_keyset_v1(NULL, true, v_raw_query, v_language_code, NULL, 'examples', p_limit, NULL)),
                (3, private.search_dictionary_group_keyset_v1(NULL, true, v_raw_query, v_language_code, NULL, 'definitions', p_limit, NULL)),
                (4, private.search_dictionary_group_keyset_v1(NULL, true, v_raw_query, v_language_code, NULL, 'alphabetical', p_limit, NULL))
        ) AS groups(group_rank, group_payload);
    END IF;

    v_groups := private.clean_dictionary_search_groups_v1(v_groups);

    RETURN jsonb_build_object(
        'contractVersion', 'dictionary-search-v1',
        'query', v_raw_query,
        'request', jsonb_strip_nulls(jsonb_build_object(
            'languageCode', v_language_code,
            'scope', 'public-catalog',
            'group', v_group
        )),
        'groups', COALESCE(v_groups, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION private.dictionary_search_index_ready_v1() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION search_dictionary_groups_v1(text, text, uuid[], text, int, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION search_public_dictionary_groups_v1(text, text, text, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_dictionary_groups_v1(text, text, uuid[], text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION search_public_dictionary_groups_v1(text, text, text, int, text) TO service_role;
