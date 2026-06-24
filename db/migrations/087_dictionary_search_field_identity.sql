-- Stable field identity and ordering metadata for grouped dictionary search.
-- This keeps the existing search-document surface private and additive while
-- preparing deterministic field matches for Van Dale-style grouped search.

ALTER TABLE dictionary_search_fields
    ADD COLUMN IF NOT EXISTS field_kind text NOT NULL DEFAULT 'generic',
    ADD COLUMN IF NOT EXISTS meaning_ordinal int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS item_ordinal int NOT NULL DEFAULT 0;

ALTER TABLE dictionary_search_fields
    DROP CONSTRAINT IF EXISTS dictionary_search_fields_ordinals_nonnegative,
    ADD CONSTRAINT dictionary_search_fields_ordinals_nonnegative
    CHECK (meaning_ordinal >= 0 AND item_ordinal >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS dictionary_search_fields_entry_source_path_v2_idx
    ON dictionary_search_fields(entry_id, source_path)
    WHERE extraction_version >= 2;

CREATE INDEX IF NOT EXISTS dictionary_search_fields_group_order_v2_idx
    ON dictionary_search_fields(
        language_code,
        field_group,
        dictionary_id,
        normalized_text_unaccent,
        meaning_ordinal,
        item_ordinal,
        entry_id
    )
    WHERE extraction_version >= 2;

CREATE INDEX IF NOT EXISTS dictionary_search_documents_browse_idx
    ON dictionary_search_documents(
        language_code,
        normalized_headword_unaccent,
        normalized_headword,
        dictionary_id,
        entry_id
    );

CREATE INDEX IF NOT EXISTS dictionary_search_fields_examples_tsv_v2_idx
    ON dictionary_search_fields USING gin (field_tsv)
    WHERE extraction_version >= 2
      AND field_group IN ('example', 'idiom');

CREATE INDEX IF NOT EXISTS dictionary_search_fields_definitions_tsv_v2_idx
    ON dictionary_search_fields USING gin (field_tsv)
    WHERE extraction_version >= 2
      AND field_group IN ('definition', 'context', 'note');

CREATE OR REPLACE FUNCTION refresh_dictionary_search_document(
    p_entry_id uuid,
    p_extraction_version int DEFAULT 2
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_entry_id IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM word_entries WHERE id = p_entry_id) THEN
        DELETE FROM dictionary_search_documents WHERE entry_id = p_entry_id;
        RETURN;
    END IF;

    INSERT INTO dictionary_search_documents (
        entry_id,
        dictionary_id,
        language_code,
        headword,
        meaning_id,
        part_of_speech,
        is_nt2_2000,
        normalized_headword,
        normalized_headword_unaccent,
        summary_definition,
        extraction_version,
        indexed_at,
        updated_at
    )
    SELECT
        w.id,
        w.dictionary_id,
        w.language_code,
        w.headword,
        w.meaning_id,
        w.part_of_speech,
        COALESCE(w.is_nt2_2000, false),
        normalize_dictionary_search_text(w.headword),
        normalize_dictionary_search_text_unaccent(w.headword),
        NULLIF(btrim(COALESCE(
            w.raw#>>'{definition}',
            w.raw#>>'{meanings,0,definition}',
            w.raw#>>'{meanings,0,context}',
            ''
        )), ''),
        GREATEST(p_extraction_version, 2),
        now(),
        now()
    FROM word_entries w
    WHERE w.id = p_entry_id
    ON CONFLICT (entry_id) DO UPDATE
    SET dictionary_id = excluded.dictionary_id,
        language_code = excluded.language_code,
        headword = excluded.headword,
        meaning_id = excluded.meaning_id,
        part_of_speech = excluded.part_of_speech,
        is_nt2_2000 = excluded.is_nt2_2000,
        normalized_headword = excluded.normalized_headword,
        normalized_headword_unaccent = excluded.normalized_headword_unaccent,
        summary_definition = excluded.summary_definition,
        extraction_version = excluded.extraction_version,
        indexed_at = excluded.indexed_at,
        updated_at = excluded.updated_at;

    DELETE FROM dictionary_search_fields WHERE entry_id = p_entry_id;

    WITH source_entry AS (
        SELECT w.*
        FROM word_entries w
        WHERE w.id = p_entry_id
    ),
    meanings AS (
        SELECT
            m.meaning,
            m.meaning_ord::int AS meaning_ord
        FROM source_entry s
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE
                WHEN jsonb_typeof(s.raw->'meanings') = 'array' THEN s.raw->'meanings'
                ELSE '[]'::jsonb
            END
        ) WITH ORDINALITY AS m(meaning, meaning_ord)
    ),
    examples AS (
        SELECT
            meaning_ord,
            e.example,
            e.example_ord::int AS example_ord
        FROM meanings m
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE
                WHEN jsonb_typeof(m.meaning->'examples') = 'array' THEN m.meaning->'examples'
                ELSE '[]'::jsonb
            END
        ) WITH ORDINALITY AS e(example, example_ord)
    ),
    idioms AS (
        SELECT
            meaning_ord,
            i.idiom,
            i.idiom_ord::int AS idiom_ord
        FROM meanings m
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE
                WHEN jsonb_typeof(m.meaning->'idioms') = 'array' THEN m.meaning->'idioms'
                ELSE '[]'::jsonb
            END
        ) WITH ORDINALITY AS i(idiom, idiom_ord)
    ),
    alternate_headwords AS (
        SELECT
            a.alternate_headword,
            a.alternate_ord::int AS alternate_ord
        FROM source_entry s
        CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE
                WHEN jsonb_typeof(s.raw->'alternate_headwords') = 'array' THEN s.raw->'alternate_headwords'
                WHEN NULLIF(s.raw->>'alternate_headwords', '') IS NOT NULL THEN jsonb_build_array(s.raw->>'alternate_headwords')
                ELSE '[]'::jsonb
            END
        ) WITH ORDINALITY AS a(alternate_headword, alternate_ord)
    ),
    source_forms AS (
        SELECT
            f.form,
            row_number() OVER (ORDER BY f.form, f.word_id)::int AS form_ord
        FROM source_entry s
        JOIN word_forms f ON f.word_id = s.id
        WHERE f.language_code = s.language_code
          AND (
              (f.dictionary_id IS NULL AND s.dictionary_id IS NULL)
              OR f.dictionary_id = s.dictionary_id
          )
    ),
    field_candidates AS (
        SELECT
            s.id AS entry_id,
            s.dictionary_id,
            s.language_code,
            'headword'::text AS field_group,
            'headword'::text AS field_kind,
            'word_entries.headword'::text AS source_path,
            0::int AS ordinal,
            0::int AS meaning_ordinal,
            0::int AS item_ordinal,
            s.headword AS display_text,
            100::int AS field_weight,
            NULL::text AS form_type,
            NULL::text AS form_source,
            NULL::numeric AS confidence
        FROM source_entry s

        UNION ALL

        SELECT
            s.id,
            s.dictionary_id,
            s.language_code,
            'headword',
            'headword-raw',
            'raw._metadata.headword_raw',
            1,
            0,
            1,
            s.raw#>>'{_metadata,headword_raw}',
            95,
            NULL,
            NULL,
            NULL
        FROM source_entry s

        UNION ALL

        SELECT
            s.id,
            s.dictionary_id,
            s.language_code,
            'alternate-headword',
            'search-term',
            'raw._metadata.search_term',
            2,
            0,
            2,
            s.raw#>>'{_metadata,search_term}',
            90,
            NULL,
            NULL,
            NULL
        FROM source_entry s

        UNION ALL

        SELECT
            s.id,
            s.dictionary_id,
            s.language_code,
            'alternate-headword',
            'alternate-headword',
            format('raw.alternate_headwords[%s]', a.alternate_ord - 1),
            a.alternate_ord,
            0,
            a.alternate_ord,
            a.alternate_headword,
            85,
            NULL,
            NULL,
            NULL
        FROM source_entry s
        JOIN alternate_headwords a ON true

        UNION ALL

        SELECT
            s.id,
            s.dictionary_id,
            s.language_code,
            'form',
            'word-form',
            format('word_forms.form[%s]', f.form_ord - 1),
            f.form_ord,
            0,
            f.form_ord,
            f.form,
            80,
            NULL,
            'source',
            1.0
        FROM source_entry s
        JOIN source_forms f ON true

        UNION ALL

        SELECT
            s.id,
            s.dictionary_id,
            s.language_code,
            'definition',
            'entry-definition',
            'raw.definition',
            0,
            0,
            0,
            s.raw#>>'{definition}',
            70,
            NULL,
            NULL,
            NULL
        FROM source_entry s

        UNION ALL

        SELECT
            s.id,
            s.dictionary_id,
            s.language_code,
            'definition',
            'meaning-definition',
            format('raw.meanings[%s].definition', m.meaning_ord - 1),
            m.meaning_ord,
            m.meaning_ord,
            0,
            m.meaning->>'definition',
            70,
            NULL,
            NULL,
            NULL
        FROM source_entry s
        JOIN meanings m ON true

        UNION ALL

        SELECT
            s.id,
            s.dictionary_id,
            s.language_code,
            'context',
            'meaning-context',
            format('raw.meanings[%s].context', m.meaning_ord - 1),
            m.meaning_ord,
            m.meaning_ord,
            0,
            m.meaning->>'context',
            60,
            NULL,
            NULL,
            NULL
        FROM source_entry s
        JOIN meanings m ON true

        UNION ALL

        SELECT
            s.id,
            s.dictionary_id,
            s.language_code,
            'example',
            'example',
            format('raw.meanings[%s].examples[%s]', e.meaning_ord - 1, e.example_ord - 1),
            e.example_ord,
            e.meaning_ord,
            e.example_ord,
            CASE
                WHEN jsonb_typeof(e.example) = 'string' THEN e.example#>>'{}'
                ELSE COALESCE(e.example->>'text', e.example->>'example', e.example#>>'{}')
            END,
            50,
            NULL,
            NULL,
            NULL
        FROM source_entry s
        JOIN examples e ON true

        UNION ALL

        SELECT
            s.id,
            s.dictionary_id,
            s.language_code,
            'idiom',
            'idiom-expression',
            format('raw.meanings[%s].idioms[%s].expression', i.meaning_ord - 1, i.idiom_ord - 1),
            i.idiom_ord,
            i.meaning_ord,
            i.idiom_ord,
            i.idiom->>'expression',
            65,
            NULL,
            NULL,
            NULL
        FROM source_entry s
        JOIN idioms i ON true

        UNION ALL

        SELECT
            s.id,
            s.dictionary_id,
            s.language_code,
            'definition',
            'idiom-explanation',
            format('raw.meanings[%s].idioms[%s].explanation', i.meaning_ord - 1, i.idiom_ord - 1),
            i.idiom_ord,
            i.meaning_ord,
            i.idiom_ord,
            i.idiom->>'explanation',
            55,
            NULL,
            NULL,
            NULL
        FROM source_entry s
        JOIN idioms i ON true

        UNION ALL

        SELECT
            s.id,
            s.dictionary_id,
            s.language_code,
            'translation',
            'source-translation',
            'raw.translation.text',
            0,
            0,
            0,
            s.raw#>>'{translation,text}',
            50,
            NULL,
            NULL,
            NULL
        FROM source_entry s

        UNION ALL

        SELECT
            s.id,
            s.dictionary_id,
            s.language_code,
            'note',
            'entry-note',
            'raw.notes',
            0,
            0,
            0,
            s.raw#>>'{notes}',
            40,
            NULL,
            NULL,
            NULL
        FROM source_entry s
    )
    INSERT INTO dictionary_search_fields (
        entry_id,
        dictionary_id,
        language_code,
        field_group,
        field_kind,
        source_path,
        ordinal,
        meaning_ordinal,
        item_ordinal,
        display_text,
        normalized_text,
        normalized_text_unaccent,
        field_tsv,
        field_weight,
        form_type,
        form_source,
        confidence,
        extraction_version
    )
    SELECT
        entry_id,
        dictionary_id,
        language_code,
        field_group,
        field_kind,
        source_path,
        ordinal,
        meaning_ordinal,
        item_ordinal,
        btrim(display_text),
        normalize_dictionary_search_text(display_text),
        normalize_dictionary_search_text_unaccent(display_text),
        to_tsvector('simple', normalize_dictionary_search_text_unaccent(display_text)),
        field_weight,
        form_type,
        form_source,
        confidence,
        GREATEST(p_extraction_version, 2)
    FROM field_candidates
    WHERE NULLIF(btrim(COALESCE(display_text, '')), '') IS NOT NULL;

    UPDATE dictionary_search_documents d
    SET search_tsv = COALESCE((
            SELECT to_tsvector(
                'simple',
                string_agg(
                    f.normalized_text_unaccent,
                    ' '
                    ORDER BY f.field_weight DESC, f.meaning_ordinal ASC, f.item_ordinal ASC, f.source_path ASC
                )
            )
            FROM dictionary_search_fields f
            WHERE f.entry_id = d.entry_id
        ), ''::tsvector),
        indexed_at = now(),
        updated_at = now()
    WHERE d.entry_id = p_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION rebuild_dictionary_search_documents(
    p_limit int DEFAULT NULL,
    p_extraction_version int DEFAULT 2
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entry_id uuid;
    v_count int := 0;
BEGIN
    FOR v_entry_id IN
        SELECT id
        FROM word_entries
        ORDER BY language_code, headword, meaning_id, id
        LIMIT COALESCE(p_limit, 2147483647)
    LOOP
        PERFORM refresh_dictionary_search_document(v_entry_id, p_extraction_version);
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE ALL ON dictionary_search_documents FROM anon, authenticated;
REVOKE ALL ON dictionary_search_fields FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION refresh_dictionary_search_document(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rebuild_dictionary_search_documents(int, int) FROM PUBLIC, anon, authenticated;
