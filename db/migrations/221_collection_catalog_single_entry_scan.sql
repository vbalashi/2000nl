-- #413: scan the narrow entry projection once for curated collection counts.
-- Based on migration 203; user collections, identity guard and JSON ordering are preserved.
BEGIN;

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

    WITH entry_sources AS MATERIALIZED (
        SELECT id, dictionary_id FROM public.word_entries
    ), selected_lists AS MATERIALIZED (
        SELECT id FROM public.word_lists
        WHERE (p_list_type IS NULL OR p_list_type = 'curated')
          AND (v_language_code IS NULL OR language_code = v_language_code)
    ), curated_source_counts AS MATERIALIZED (
        SELECT item.list_id, entry.dictionary_id, count(*)::int AS item_count,
            entry.dictionary_id IS NULL
                OR public.can_browse_dictionary(p_user_id, entry.dictionary_id) AS accessible
        FROM public.word_list_items item
        JOIN selected_lists selected ON selected.id = item.list_id
        JOIN entry_sources entry ON entry.id = item.word_id
        GROUP BY item.list_id, entry.dictionary_id
    ), curated AS (
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
                'count', availability.item_count,
                'available_count', availability.available_item_count,
                'unavailable_source_count', availability.unavailable_source_count
            ))
        ) AS row,
        COALESCE(l.sort_order, 2147483647) AS sort_order,
        l.is_primary,
        l.name,
        NULL::timestamptz AS created_at
        FROM word_lists l
        CROSS JOIN LATERAL (
            SELECT
                COALESCE(sum(source.item_count), 0)::int AS item_count,
                COALESCE(sum(source.item_count) FILTER (WHERE source.accessible), 0)::int
                    AS available_item_count,
                count(*) FILTER (
                    WHERE source.dictionary_id IS NOT NULL AND NOT source.accessible
                )::int AS unavailable_source_count
            FROM curated_source_counts source
            WHERE source.list_id = l.id
        ) AS availability
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
                'count', availability.item_count,
                'available_count', availability.available_item_count,
                'unavailable_source_count', availability.unavailable_source_count
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
        JOIN LATERAL (
            SELECT
                COALESCE(sum(source.item_count), 0)::int AS item_count,
                COALESCE(sum(source.item_count) FILTER (WHERE source.accessible), 0)::int
                    AS available_item_count,
                count(*) FILTER (
                    WHERE source.dictionary_id IS NOT NULL AND NOT source.accessible
                )::int AS unavailable_source_count
            FROM (
                SELECT
                    entry.dictionary_id,
                    count(*)::int AS item_count,
                    entry.dictionary_id IS NULL
                        OR can_browse_dictionary(p_user_id, entry.dictionary_id)
                        AS accessible
                FROM user_word_list_items item
                JOIN word_entries entry ON entry.id = item.word_id
                WHERE item.list_id = l.id
                GROUP BY entry.dictionary_id
            ) AS source
        ) AS availability ON true
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

REVOKE EXECUTE ON FUNCTION get_available_word_lists(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_available_word_lists(uuid, text, text) TO authenticated;


COMMIT;
