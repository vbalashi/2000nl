-- Group-atomic, opaque-cursor lookup for Platform V2.

BEGIN;

CREATE OR REPLACE FUNCTION public.lookup_platform_v2_entries(
    p_user_id uuid,
    p_catalog boolean,
    p_query text,
    p_language_code text DEFAULT NULL,
    p_cursor text DEFAULT NULL,
    p_group_limit integer DEFAULT 10,
    p_group_entry_bound integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_raw_query text := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query text;
    v_query_unaccent text;
    v_language_code text :=
        NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_group_limit integer :=
        LEAST(GREATEST(COALESCE(p_group_limit, 10), 1), 25);
    v_group_entry_bound integer :=
        LEAST(GREATEST(COALESCE(p_group_entry_bound, 50), 1), 100);
    v_cursor jsonb :=
        private.decode_dictionary_search_cursor_v1(p_cursor);
    v_query_key text;
    v_cursor_tier_rank integer;
    v_cursor_match_rank integer;
    v_cursor_dictionary_rank integer;
    v_cursor_sort_headword text;
    v_cursor_group_id uuid;
    v_items jsonb;
    v_has_more boolean;
    v_next_cursor text;
    v_missing_identity_count integer;
    v_oversized_group jsonb;
BEGIN
    IF p_catalog AND p_user_id IS NOT NULL THEN
        RETURN jsonb_build_object('error', 'invalid_principal');
    END IF;
    IF NOT p_catalog AND p_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'invalid_principal');
    END IF;
    IF v_raw_query IS NULL THEN
        RETURN jsonb_build_object(
            'query', p_query,
            'items', '[]'::jsonb,
            'page', jsonb_build_object(
                'selectedTierComplete', true,
                'nextGroupCursor', NULL
            )
        );
    END IF;

    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent :=
        normalize_dictionary_search_text_unaccent(v_raw_query);
    v_query_key := encode(
        digest(
            concat_ws(
                chr(31),
                'platform-v2-group-cursor-v1',
                COALESCE(p_user_id::text, 'catalog'),
                p_catalog::text,
                v_raw_query,
                v_query,
                v_query_unaccent,
                COALESCE(v_language_code, '')
            ),
            'sha256'
        ),
        'hex'
    );

    IF NULLIF(trim(COALESCE(p_cursor, '')), '') IS NOT NULL THEN
        IF v_cursor = '{}'::jsonb
           OR v_cursor->>'version' <> 'platform-v2-group-cursor-v1'
           OR v_cursor->>'queryKey' IS DISTINCT FROM v_query_key THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END IF;
        BEGIN
            v_cursor_tier_rank := (v_cursor->>'tierRank')::integer;
            v_cursor_match_rank := (v_cursor->>'matchRank')::integer;
            v_cursor_dictionary_rank :=
                (v_cursor->>'dictionaryRank')::integer;
            v_cursor_sort_headword := v_cursor->>'sortHeadword';
            v_cursor_group_id := (v_cursor->>'headwordGroupId')::uuid;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END;
        IF v_cursor_sort_headword IS NULL
           OR v_cursor_group_id IS NULL THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END IF;
    END IF;

    IF p_catalog
       AND EXISTS (
           SELECT 1
           FROM public.word_entries AS entry
           JOIN public.dictionaries AS dictionary
             ON dictionary.id = entry.dictionary_id
           WHERE dictionary.visibility IN ('system', 'public')
             AND dictionary.kind <> 'user'
             AND (
                 v_language_code IS NULL
                 OR entry.language_code = v_language_code
             )
           LIMIT 1
       )
       AND NOT EXISTS (
           SELECT 1
           FROM public.dictionary_search_documents AS document
           JOIN public.dictionaries AS dictionary
             ON dictionary.id = document.dictionary_id
           WHERE dictionary.visibility IN ('system', 'public')
             AND dictionary.kind <> 'user'
             AND (
                 v_language_code IS NULL
                 OR document.language_code = v_language_code
             )
           LIMIT 1
       ) THEN
        RETURN jsonb_build_object('error', 'search_index_not_ready');
    END IF;

    WITH user_context AS MATERIALIZED (
        SELECT COALESCE(
            (
                SELECT subscription_tier
                FROM public.user_settings
                WHERE user_id = p_user_id
            ),
            'free'
        ) AS subscription_tier
    ),
    eligible_dictionaries AS MATERIALIZED (
        SELECT
            dictionary.*,
            CASE
                WHEN NOT p_catalog
                     AND dictionary.kind = 'user'
                     AND dictionary.owner_user_id = p_user_id THEN 0
                WHEN dictionary.kind = 'curated' THEN 1
                ELSE 2
            END AS dictionary_rank
        FROM public.dictionaries AS dictionary
        CROSS JOIN user_context
        WHERE (
            (
                p_catalog
                AND dictionary.visibility IN ('system', 'public')
                AND dictionary.kind <> 'user'
            )
            OR (
                NOT p_catalog
                AND (
                    (
                        dictionary.kind = 'user'
                        AND dictionary.owner_user_id = p_user_id
                    )
                    OR (
                        dictionary.kind <> 'user'
                        AND (
                            dictionary.owner_user_id = p_user_id
                            OR (
                                dictionary.visibility IN (
                                    'system',
                                    'public',
                                    'shared'
                                )
                                AND (
                                    CASE user_context.subscription_tier
                                        WHEN 'admin' THEN 30
                                        WHEN 'premium' THEN 20
                                        ELSE 10
                                    END
                                ) >= (
                                    CASE COALESCE(
                                        dictionary.minimum_subscription_tier,
                                        'free'
                                    )
                                        WHEN 'admin' THEN 30
                                        WHEN 'premium' THEN 20
                                        ELSE 10
                                    END
                                )
                            )
                            OR EXISTS (
                                SELECT 1
                                FROM public.dictionary_entitlements
                                    AS entitlement
                                WHERE entitlement.dictionary_id =
                                    dictionary.id
                                  AND (
                                      (
                                          entitlement.subject_type = 'user'
                                          AND entitlement.subject_key =
                                              p_user_id::text
                                      )
                                      OR (
                                          entitlement.subject_type = 'tier'
                                          AND entitlement.subject_key =
                                              user_context.subscription_tier
                                      )
                                  )
                                  AND entitlement.permission IN (
                                      'read',
                                      'write',
                                      'admin'
                                  )
                                  AND (
                                      entitlement.starts_at IS NULL
                                      OR entitlement.starts_at <= now()
                                  )
                                  AND (
                                      entitlement.ends_at IS NULL
                                      OR entitlement.ends_at > now()
                                  )
                              )
                        )
                    )
                )
            )
        )
    ),
    indexed_headword_matches AS MATERIALIZED (
        SELECT
            document.entry_id,
            'exact-headword'::text AS resolved_by,
            document.headword AS matched_text,
            1 AS tier_rank,
            CASE
                WHEN document.headword = v_raw_query THEN 0
                WHEN document.normalized_headword = v_query THEN 1
                ELSE 2
            END AS match_rank,
            document.headword,
            document.meaning_id,
            document.dictionary_id
        FROM public.dictionary_search_documents AS document
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = document.dictionary_id
        WHERE (
            v_language_code IS NULL
            OR document.language_code = v_language_code
        )
          AND document.normalized_headword = v_query

        UNION ALL

        SELECT
            document.entry_id,
            'exact-headword'::text,
            document.headword,
            1,
            CASE
                WHEN document.headword = v_raw_query THEN 0
                WHEN document.normalized_headword = v_query THEN 1
                ELSE 2
            END,
            document.headword,
            document.meaning_id,
            document.dictionary_id
        FROM public.dictionary_search_documents AS document
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = document.dictionary_id
        WHERE (
            v_language_code IS NULL
            OR document.language_code = v_language_code
        )
          AND document.normalized_headword_unaccent =
              v_query_unaccent
          AND document.normalized_headword <> v_query
    ),
    legacy_user_headword_matches AS MATERIALIZED (
        SELECT
            entry.id AS entry_id,
            'exact-headword'::text AS resolved_by,
            entry.headword AS matched_text,
            1 AS tier_rank,
            CASE
                WHEN entry.headword = v_raw_query THEN 0
                WHEN lower(entry.headword) = lower(v_raw_query) THEN 1
                ELSE 2
            END AS match_rank,
            entry.headword,
            entry.meaning_id,
            entry.dictionary_id
        FROM public.word_entries AS entry
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id
        LEFT JOIN public.dictionary_search_documents AS document
          ON document.entry_id = entry.id
        WHERE NOT p_catalog
          AND dictionary.kind = 'user'
          AND document.entry_id IS NULL
          AND (
              v_language_code IS NULL
              OR entry.language_code = v_language_code
          )
          AND (
              lower(entry.headword) = lower(v_raw_query)
              OR normalize_dictionary_search_text_unaccent(
                  entry.headword
              ) = v_query_unaccent
          )
    ),
    headword_matches AS MATERIALIZED (
        SELECT * FROM indexed_headword_matches
        UNION ALL
        SELECT * FROM legacy_user_headword_matches
    ),
    headword_candidates AS MATERIALIZED (
        SELECT DISTINCT ON (match.entry_id)
            match.*
        FROM headword_matches AS match
        ORDER BY
            match.entry_id,
            match.match_rank,
            normalize_dictionary_search_text(match.headword),
            match.meaning_id
    ),
    indexed_form_matches AS MATERIALIZED (
        SELECT
            document.entry_id,
            'lemma-or-inflection'::text AS resolved_by,
            field.display_text AS matched_text,
            2 AS tier_rank,
            CASE
                WHEN field.display_text = v_raw_query THEN 0
                WHEN field.normalized_text = v_query THEN 1
                ELSE 2
            END AS match_rank,
            document.headword,
            document.meaning_id,
            document.dictionary_id
        FROM public.dictionary_search_fields AS field
        JOIN public.dictionary_search_documents AS document
          ON document.entry_id = field.entry_id
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = document.dictionary_id
        WHERE NOT EXISTS (SELECT 1 FROM headword_candidates)
          AND field.field_group = 'form'
          AND (
              v_language_code IS NULL
              OR field.language_code = v_language_code
          )
          AND field.normalized_text = v_query

        UNION ALL

        SELECT
            document.entry_id,
            'lemma-or-inflection'::text,
            field.display_text,
            2,
            CASE
                WHEN field.display_text = v_raw_query THEN 0
                WHEN field.normalized_text = v_query THEN 1
                ELSE 2
            END,
            document.headword,
            document.meaning_id,
            document.dictionary_id
        FROM public.dictionary_search_fields AS field
        JOIN public.dictionary_search_documents AS document
          ON document.entry_id = field.entry_id
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = document.dictionary_id
        WHERE NOT EXISTS (SELECT 1 FROM headword_candidates)
          AND field.field_group = 'form'
          AND (
              v_language_code IS NULL
              OR field.language_code = v_language_code
          )
          AND field.normalized_text_unaccent = v_query_unaccent
          AND field.normalized_text <> v_query
    ),
    legacy_user_form_matches AS MATERIALIZED (
        SELECT
            entry.id AS entry_id,
            'lemma-or-inflection'::text AS resolved_by,
            form.form AS matched_text,
            2 AS tier_rank,
            CASE
                WHEN form.form = v_raw_query THEN 0
                WHEN lower(form.form) = lower(v_raw_query) THEN 1
                ELSE 2
            END AS match_rank,
            entry.headword,
            entry.meaning_id,
            entry.dictionary_id
        FROM public.word_forms AS form
        JOIN public.word_entries AS entry
          ON entry.id = form.word_id
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id
        LEFT JOIN public.dictionary_search_documents AS document
          ON document.entry_id = entry.id
        WHERE NOT p_catalog
          AND NOT EXISTS (SELECT 1 FROM headword_candidates)
          AND dictionary.kind = 'user'
          AND document.entry_id IS NULL
          AND (
              v_language_code IS NULL
              OR form.language_code = v_language_code
          )
          AND form.language_code = entry.language_code
          AND (
              form.dictionary_id IS NULL
              OR form.dictionary_id = entry.dictionary_id
          )
          AND (
              lower(form.form) = lower(v_raw_query)
              OR normalize_dictionary_search_text_unaccent(form.form) =
                  v_query_unaccent
          )
    ),
    form_matches AS MATERIALIZED (
        SELECT * FROM indexed_form_matches
        UNION ALL
        SELECT * FROM legacy_user_form_matches
    ),
    form_candidates AS MATERIALIZED (
        SELECT DISTINCT ON (match.entry_id)
            match.*
        FROM form_matches AS match
        ORDER BY
            match.entry_id,
            match.match_rank,
            normalize_dictionary_search_text(match.matched_text)
    ),
    candidates AS MATERIALIZED (
        SELECT * FROM headword_candidates
        UNION ALL
        SELECT * FROM form_candidates
        WHERE NOT EXISTS (SELECT 1 FROM headword_candidates)
    ),
    candidate_identity AS MATERIALIZED (
        SELECT
            candidate.*,
            dictionary.dictionary_rank,
            COALESCE(
                source_group.id,
                user_group.id
            ) AS headword_group_id
        FROM candidates AS candidate
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = candidate.dictionary_id
        LEFT JOIN private.source_entry_bindings AS binding
          ON binding.word_entry_id = candidate.entry_id
         AND binding.binding_state = 'active'
        LEFT JOIN private.platform_v2_headword_groups AS source_group
          ON source_group.management_kind = 'source'
         AND source_group.dictionary_id = binding.dictionary_id
         AND source_group.identity_scheme_version =
             binding.identity_scheme_version
         AND source_group.source_group_key = binding.source_group_key
        LEFT JOIN private.platform_v2_headword_groups AS user_group
          ON user_group.management_kind = 'user'
         AND user_group.singleton_entry_id = candidate.entry_id
    ),
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            min(dictionary_rank) AS dictionary_rank,
            min(normalize_dictionary_search_text(headword))
                AS sort_headword,
            (array_agg(
                resolved_by
                ORDER BY
                    tier_rank,
                    match_rank,
                    dictionary_rank,
                    normalize_dictionary_search_text(headword),
                    entry_id
            ))[1] AS resolved_by,
            (array_agg(
                matched_text
                ORDER BY
                    tier_rank,
                    match_rank,
                    dictionary_rank,
                    normalize_dictionary_search_text(headword),
                    entry_id
            ))[1] AS matched_text
        FROM candidate_identity
        WHERE headword_group_id IS NOT NULL
        GROUP BY headword_group_id
    ),
    after_cursor AS MATERIALIZED (
        SELECT *
        FROM candidate_groups
        WHERE v_cursor_group_id IS NULL
           OR (
                tier_rank,
                match_rank,
                dictionary_rank,
                sort_headword,
                headword_group_id
           ) > (
                v_cursor_tier_rank,
                v_cursor_match_rank,
                v_cursor_dictionary_rank,
                v_cursor_sort_headword,
                v_cursor_group_id
           )
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
            headword_group_id
        LIMIT v_group_limit + 1
    ),
    returned_groups AS MATERIALIZED (
        SELECT *
        FROM after_cursor
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
            headword_group_id
        LIMIT v_group_limit
    ),
    group_entry_ids AS MATERIALIZED (
        SELECT
            group_page.*,
            entry.id AS entry_id,
            COALESCE(binding.sense_ordinal, entry.meaning_id)
                AS group_meaning_order
        FROM returned_groups AS group_page
        JOIN private.platform_v2_headword_groups AS headword_group
          ON headword_group.id = group_page.headword_group_id
        LEFT JOIN private.source_entry_bindings AS binding
          ON headword_group.management_kind = 'source'
         AND binding.dictionary_id = headword_group.dictionary_id
         AND binding.identity_scheme_version =
             headword_group.identity_scheme_version
         AND binding.source_group_key = headword_group.source_group_key
         AND binding.binding_state = 'active'
        JOIN public.word_entries AS entry
          ON entry.id = COALESCE(
              binding.word_entry_id,
              headword_group.singleton_entry_id
          )
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id
    ),
    group_sizes AS MATERIALIZED (
        SELECT
            headword_group_id,
            count(*)::integer AS entry_count
        FROM group_entry_ids
        GROUP BY headword_group_id
    ),
    oversized_groups AS MATERIALIZED (
        SELECT jsonb_build_object(
            'headwordGroupId', size.headword_group_id,
            'entryCount', size.entry_count,
            'safetyBound', v_group_entry_bound
        ) AS error_payload
        FROM group_sizes AS size
        WHERE size.entry_count > v_group_entry_bound
        ORDER BY size.entry_count DESC, size.headword_group_id
        LIMIT 1
    ),
    group_entries AS MATERIALIZED (
        SELECT
            member.tier_rank,
            member.match_rank,
            member.dictionary_rank,
            member.sort_headword,
            member.resolved_by,
            member.matched_text,
            member.headword_group_id,
            member.group_meaning_order,
            entry.*,
            dictionary.language_code AS dictionary_language_code,
            dictionary.slug AS dictionary_slug,
            dictionary.name AS dictionary_name,
            dictionary.kind AS dictionary_kind,
            dictionary.visibility AS dictionary_visibility,
            dictionary.owner_user_id AS dictionary_owner_user_id,
            dictionary.is_editable AS dictionary_is_editable,
            dictionary.schema_key AS dictionary_schema_key,
            dictionary.schema_version AS dictionary_schema_version
        FROM group_entry_ids AS member
        JOIN public.word_entries AS entry
          ON entry.id = member.entry_id
        JOIN public.dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id
        WHERE NOT EXISTS (SELECT 1 FROM oversized_groups)
    ),
    payloads AS (
        SELECT
            jsonb_strip_nulls(jsonb_build_object(
                'id', entry.id,
                'dictionary_id', entry.dictionary_id,
                'language_code', entry.language_code,
                'headword', entry.headword,
                'meaning_id', entry.meaning_id,
                'part_of_speech', entry.part_of_speech,
                'gender', entry.gender,
                'raw', entry.raw,
                'is_nt2_2000', entry.is_nt2_2000,
                'meanings_count', size.entry_count,
                'dictionary', jsonb_build_object(
                    'id', entry.dictionary_id,
                    'language_code', entry.dictionary_language_code,
                    'slug', entry.dictionary_slug,
                    'name', entry.dictionary_name,
                    'kind', entry.dictionary_kind,
                    'visibility', entry.dictionary_visibility,
                    'owner_user_id',
                        entry.dictionary_owner_user_id,
                    'is_editable', entry.dictionary_is_editable,
                    'schema_key', entry.dictionary_schema_key,
                    'schema_version',
                        entry.dictionary_schema_version
                ),
                'dictionary_name', entry.dictionary_name,
                'dictionary_slug', entry.dictionary_slug,
                'dictionary_kind', entry.dictionary_kind,
                'search_match_group', entry.resolved_by,
                'search_matched_text', entry.matched_text
            )) AS payload,
            entry.tier_rank,
            entry.match_rank,
            entry.dictionary_rank,
            entry.sort_headword,
            entry.headword_group_id,
            entry.group_meaning_order,
            entry.id
        FROM group_entries AS entry
        JOIN group_sizes AS size
          ON size.headword_group_id = entry.headword_group_id
    )
    SELECT
        COALESCE(
            (
                SELECT jsonb_agg(
                    payload
                    ORDER BY
                        tier_rank,
                        match_rank,
                        dictionary_rank,
                        sort_headword,
                        headword_group_id,
                        group_meaning_order,
                        id
                )
                FROM payloads
            ),
            '[]'::jsonb
        ),
        (SELECT count(*) > v_group_limit FROM after_cursor),
        (
            SELECT private.encode_dictionary_search_cursor_v1(
                jsonb_build_object(
                    'version', 'platform-v2-group-cursor-v1',
                    'queryKey', v_query_key,
                    'tierRank', tier_rank,
                    'matchRank', match_rank,
                    'dictionaryRank', dictionary_rank,
                    'sortHeadword', sort_headword,
                    'headwordGroupId', headword_group_id
                )
            )
            FROM returned_groups
            ORDER BY
                tier_rank DESC,
                match_rank DESC,
                dictionary_rank DESC,
                sort_headword DESC,
                headword_group_id DESC
            LIMIT 1
        ),
        (
            SELECT count(*)::integer
            FROM candidate_identity
            WHERE headword_group_id IS NULL
        ),
        (
            SELECT error_payload
            FROM oversized_groups
        )
    INTO
        v_items,
        v_has_more,
        v_next_cursor,
        v_missing_identity_count,
        v_oversized_group;

    IF v_missing_identity_count > 0 THEN
        RETURN jsonb_build_object(
            'error', 'presentation_identity_incomplete'
        );
    END IF;
    IF v_oversized_group IS NOT NULL THEN
        RETURN jsonb_build_object(
            'error', 'group-too-large',
            'group', v_oversized_group
        );
    END IF;

    RETURN jsonb_build_object(
        'query', v_raw_query,
        'items', COALESCE(v_items, '[]'::jsonb),
        'page', jsonb_build_object(
            'selectedTierComplete', NOT COALESCE(v_has_more, false),
            'nextGroupCursor', CASE
                WHEN COALESCE(v_has_more, false) THEN v_next_cursor
                ELSE NULL
            END
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_platform_v2_entries(
    uuid,
    boolean,
    text,
    text,
    text,
    integer,
    integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_platform_v2_entries(
    uuid,
    boolean,
    text,
    text,
    text,
    integer,
    integer
) TO service_role;

COMMIT;
