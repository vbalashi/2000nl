-- Dictionary search documents: extracted, indexed search surface for the
-- next-generation dictionary matcher. This migration is additive and does not
-- route existing UI search to the new tables yet.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION normalize_dictionary_search_text(p_text text)
RETURNS text
LANGUAGE sql
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT regexp_replace(lower(btrim(COALESCE(p_text, ''))), '\s+', ' ', 'g');
$$;

CREATE OR REPLACE FUNCTION normalize_dictionary_search_text_unaccent(p_text text)
RETURNS text
LANGUAGE sql
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT unaccent(normalize_dictionary_search_text(p_text));
$$;

CREATE TABLE IF NOT EXISTS dictionary_search_documents (
    entry_id uuid PRIMARY KEY REFERENCES word_entries(id) ON DELETE CASCADE,
    dictionary_id uuid REFERENCES dictionaries(id) ON DELETE CASCADE,
    language_code text NOT NULL REFERENCES languages(code),
    headword text NOT NULL,
    meaning_id int NOT NULL,
    part_of_speech text,
    is_nt2_2000 boolean NOT NULL DEFAULT false,
    normalized_headword text NOT NULL,
    normalized_headword_unaccent text NOT NULL,
    summary_definition text,
    search_tsv tsvector NOT NULL DEFAULT ''::tsvector,
    extraction_version int NOT NULL DEFAULT 1 CHECK (extraction_version > 0),
    indexed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dictionary_search_documents_dictionary_idx
    ON dictionary_search_documents(dictionary_id, language_code);

CREATE INDEX IF NOT EXISTS dictionary_search_documents_exact_headword_idx
    ON dictionary_search_documents(language_code, normalized_headword, dictionary_id);

CREATE INDEX IF NOT EXISTS dictionary_search_documents_exact_headword_unaccent_idx
    ON dictionary_search_documents(language_code, normalized_headword_unaccent, dictionary_id);

CREATE INDEX IF NOT EXISTS dictionary_search_documents_headword_trgm_idx
    ON dictionary_search_documents USING gin (normalized_headword gin_trgm_ops);

CREATE INDEX IF NOT EXISTS dictionary_search_documents_headword_unaccent_trgm_idx
    ON dictionary_search_documents USING gin (normalized_headword_unaccent gin_trgm_ops);

CREATE INDEX IF NOT EXISTS dictionary_search_documents_tsv_idx
    ON dictionary_search_documents USING gin (search_tsv);

CREATE TABLE IF NOT EXISTS dictionary_search_fields (
    id bigserial PRIMARY KEY,
    entry_id uuid NOT NULL REFERENCES dictionary_search_documents(entry_id) ON DELETE CASCADE,
    dictionary_id uuid REFERENCES dictionaries(id) ON DELETE CASCADE,
    language_code text NOT NULL REFERENCES languages(code),
    field_group text NOT NULL CHECK (
        field_group IN (
            'headword',
            'form',
            'alternate-headword',
            'definition',
            'context',
            'example',
            'idiom',
            'translation',
            'note',
            'fallback'
        )
    ),
    source_path text NOT NULL,
    ordinal int NOT NULL DEFAULT 0,
    display_text text NOT NULL,
    normalized_text text NOT NULL,
    normalized_text_unaccent text NOT NULL,
    field_tsv tsvector NOT NULL DEFAULT ''::tsvector,
    field_weight int NOT NULL DEFAULT 1 CHECK (field_weight > 0),
    form_type text,
    form_source text,
    confidence numeric(4, 3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    extraction_version int NOT NULL DEFAULT 1 CHECK (extraction_version > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dictionary_search_fields_entry_idx
    ON dictionary_search_fields(entry_id);

CREATE INDEX IF NOT EXISTS dictionary_search_fields_group_idx
    ON dictionary_search_fields(language_code, field_group, dictionary_id);

CREATE INDEX IF NOT EXISTS dictionary_search_fields_exact_text_idx
    ON dictionary_search_fields(language_code, field_group, normalized_text, dictionary_id);

CREATE INDEX IF NOT EXISTS dictionary_search_fields_exact_text_unaccent_idx
    ON dictionary_search_fields(language_code, field_group, normalized_text_unaccent, dictionary_id);

CREATE INDEX IF NOT EXISTS dictionary_search_fields_text_trgm_idx
    ON dictionary_search_fields USING gin (normalized_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS dictionary_search_fields_text_unaccent_trgm_idx
    ON dictionary_search_fields USING gin (normalized_text_unaccent gin_trgm_ops);

CREATE INDEX IF NOT EXISTS dictionary_search_fields_tsv_idx
    ON dictionary_search_fields USING gin (field_tsv);

CREATE OR REPLACE FUNCTION refresh_dictionary_search_document(
    p_entry_id uuid,
    p_extraction_version int DEFAULT 1
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
        GREATEST(p_extraction_version, 1),
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
            'word_entries.headword'::text AS source_path,
            0::int AS ordinal,
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
            'raw._metadata.headword_raw',
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
            'raw._metadata.search_term',
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
            format('raw.alternate_headwords[%s]', a.alternate_ord - 1),
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
            'word_forms.form',
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
            'raw.definition',
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
            format('raw.meanings[%s].definition', m.meaning_ord - 1),
            m.meaning_ord,
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
            format('raw.meanings[%s].context', m.meaning_ord - 1),
            m.meaning_ord,
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
            format('raw.meanings[%s].examples[%s]', e.meaning_ord - 1, e.example_ord - 1),
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
            format('raw.meanings[%s].idioms[%s].expression', i.meaning_ord - 1, i.idiom_ord - 1),
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
            'idiom',
            format('raw.meanings[%s].idioms[%s].explanation', i.meaning_ord - 1, i.idiom_ord - 1),
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
            'raw.translation.text',
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
            'raw.notes',
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
        source_path,
        ordinal,
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
        source_path,
        ordinal,
        btrim(display_text),
        normalize_dictionary_search_text(display_text),
        normalize_dictionary_search_text_unaccent(display_text),
        to_tsvector('simple', normalize_dictionary_search_text_unaccent(display_text)),
        field_weight,
        form_type,
        form_source,
        confidence,
        GREATEST(p_extraction_version, 1)
    FROM field_candidates
    WHERE NULLIF(btrim(COALESCE(display_text, '')), '') IS NOT NULL;

    UPDATE dictionary_search_documents d
    SET search_tsv = COALESCE((
            SELECT to_tsvector(
                'simple',
                string_agg(f.normalized_text_unaccent, ' ' ORDER BY f.field_weight DESC, f.ordinal ASC)
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
    p_extraction_version int DEFAULT 1
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

ALTER TABLE dictionary_search_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE dictionary_search_fields ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON dictionary_search_documents FROM anon, authenticated;
REVOKE ALL ON dictionary_search_fields FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION refresh_dictionary_search_document(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rebuild_dictionary_search_documents(int, int) FROM PUBLIC, anon, authenticated;
