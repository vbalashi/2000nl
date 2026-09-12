-- Training-ready extension for the local multi-source fixture.
-- Safe to run repeatedly after search_multisource.sql on local/test databases.

BEGIN;

UPDATE public.word_entries AS entry
SET is_nt2_2000 = true,
    raw = jsonb_set(entry.raw, '{is_nt2_2000}', 'true'::jsonb, true)
FROM public.dictionaries AS dictionary
WHERE dictionary.id = entry.dictionary_id
  AND dictionary.language_code = 'nl'
  AND dictionary.slug = 'nl-test-lexicon'
  AND entry.raw #>> '{_metadata,fixture}' = 'true';

DO $$
DECLARE
    entry record;
    definition_text text;
    context_text text;
    example_text text;
    example_item record;
    idiom_item record;
    idiom_text text;
    idiom_explanation text;
    idiom_example_item record;
    note_text text;
    nodes jsonb;
BEGIN
    FOR entry IN
        SELECT word.id, word.raw
        FROM public.word_entries AS word
        JOIN public.dictionaries AS dictionary
          ON dictionary.id = word.dictionary_id
        WHERE dictionary.language_code = 'nl'
          AND dictionary.slug = 'nl-test-lexicon'
          AND word.raw #>> '{_metadata,fixture}' = 'true'
        ORDER BY word.headword, word.meaning_id
    LOOP
        definition_text := NULLIF(trim(entry.raw #>> '{meanings,0,definition}'), '');
        context_text := NULLIF(trim(entry.raw #>> '{meanings,0,context}'), '');
        note_text := NULLIF(trim(entry.raw #>> '{meanings,0,note}'), '');
        IF definition_text IS NULL THEN
            RAISE EXCEPTION 'training fixture entry % has no definition', entry.id;
        END IF;

        nodes := jsonb_build_array(jsonb_build_object(
            'inputKey', 'definition-0',
            'kind', 'definition',
            'sourcePath', 'raw.meanings[0].definition',
            'sourceNativeKey', 'fixture:meaning-0:definition',
            'sourceTextFingerprint', encode(digest(definition_text, 'sha256'), 'hex'),
            'sourceText', definition_text
        ));

        IF context_text IS NOT NULL THEN
            nodes := nodes || jsonb_build_array(jsonb_build_object(
                'inputKey', 'usage-pattern-0',
                'kind', 'usage-pattern',
                'sourcePath', 'raw.meanings[0].context',
                'sourceNativeKey', 'fixture:meaning-0:context',
                'sourceTextFingerprint', encode(digest(context_text, 'sha256'), 'hex'),
                'sourceText', context_text
            ));
        END IF;

        FOR example_item IN
            SELECT value, ordinal - 1 AS index
            FROM jsonb_array_elements(
                COALESCE(entry.raw #> '{meanings,0,examples}', '[]'::jsonb)
            ) WITH ORDINALITY AS item(value, ordinal)
        LOOP
            example_text := NULLIF(trim(example_item.value #>> '{}'), '');
            IF example_text IS NOT NULL THEN
                nodes := nodes || jsonb_build_array(jsonb_build_object(
                    'inputKey', 'example-0-' || example_item.index,
                    'kind', 'example',
                    'sourcePath', 'raw.meanings[0].examples[' || example_item.index || ']',
                    'sourceNativeKey', 'fixture:meaning-0:example-' || example_item.index,
                    'sourceTextFingerprint', encode(digest(example_text, 'sha256'), 'hex'),
                    'parentInputKey', 'definition-0',
                    'sourceText', example_text
                ));
            END IF;
        END LOOP;

        FOR idiom_item IN
            SELECT value, ordinal - 1 AS index
            FROM jsonb_array_elements(
                COALESCE(entry.raw #> '{meanings,0,idioms}', '[]'::jsonb)
            ) WITH ORDINALITY AS item(value, ordinal)
        LOOP
            idiom_text := NULLIF(trim(CASE
                WHEN jsonb_typeof(idiom_item.value) = 'string'
                    THEN idiom_item.value #>> '{}'
                ELSE idiom_item.value ->> 'expression'
            END), '');
            IF idiom_text IS NULL THEN
                CONTINUE;
            END IF;

            nodes := nodes || jsonb_build_array(jsonb_build_object(
                'inputKey', 'idiom-0-' || idiom_item.index,
                'kind', 'idiom',
                'sourcePath', 'raw.meanings[0].idioms[' || idiom_item.index || ']',
                'sourceNativeKey', 'fixture:meaning-0:idiom-' || idiom_item.index,
                'sourceTextFingerprint', encode(digest(idiom_text, 'sha256'), 'hex'),
                'sourceText', idiom_text
            ));

            IF jsonb_typeof(idiom_item.value) = 'object' THEN
                idiom_explanation := NULLIF(trim(idiom_item.value ->> 'explanation'), '');
                IF idiom_explanation IS NOT NULL THEN
                    nodes := nodes || jsonb_build_array(jsonb_build_object(
                        'inputKey', 'idiom-explanation-0-' || idiom_item.index,
                        'kind', 'idiom-explanation',
                        'sourcePath', 'raw.meanings[0].idioms[' || idiom_item.index || '].explanation',
                        'sourceNativeKey', 'fixture:meaning-0:idiom-' || idiom_item.index || ':explanation',
                        'sourceTextFingerprint', encode(digest(idiom_explanation, 'sha256'), 'hex'),
                        'parentInputKey', 'idiom-0-' || idiom_item.index,
                        'sourceText', idiom_explanation
                    ));
                END IF;

                FOR idiom_example_item IN
                    SELECT value, ordinal - 1 AS index
                    FROM jsonb_array_elements(
                        COALESCE(idiom_item.value -> 'examples', '[]'::jsonb)
                    ) WITH ORDINALITY AS item(value, ordinal)
                LOOP
                    example_text := NULLIF(trim(idiom_example_item.value #>> '{}'), '');
                    IF example_text IS NOT NULL THEN
                        nodes := nodes || jsonb_build_array(jsonb_build_object(
                            'inputKey', 'idiom-example-0-' || idiom_item.index || '-' || idiom_example_item.index,
                            'kind', 'example',
                            'sourcePath', 'raw.meanings[0].idioms[' || idiom_item.index || '].examples[' || idiom_example_item.index || ']',
                            'sourceNativeKey', 'fixture:meaning-0:idiom-' || idiom_item.index || ':example-' || idiom_example_item.index,
                            'sourceTextFingerprint', encode(digest(example_text, 'sha256'), 'hex'),
                            'parentInputKey', 'idiom-0-' || idiom_item.index,
                            'sourceText', example_text
                        ));
                    END IF;
                END LOOP;
            END IF;
        END LOOP;

        IF note_text IS NOT NULL THEN
            nodes := nodes || jsonb_build_array(jsonb_build_object(
                'inputKey', 'usage-note-0',
                'kind', 'usage-note',
                'sourcePath', 'raw.meanings[0].note',
                'sourceNativeKey', 'fixture:meaning-0:note',
                'sourceTextFingerprint', encode(digest(note_text, 'sha256'), 'hex'),
                'sourceText', note_text
            ));
        END IF;

        PERFORM private.reconcile_platform_v2_content_nodes(
            entry.id,
            'local-training-fixture-v1',
            nodes
        );
    END LOOP;
END;
$$;

DO $$
DECLARE
    probe_user_id constant uuid := '00000000-0000-4000-8000-000000000396';
    plan jsonb;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.word_entries AS entry
        JOIN public.dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id
        WHERE dictionary.source_provider = 'local-fixture'
          AND entry.raw #>> '{_metadata,fixture}' = 'true'
          AND entry.id::text !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) THEN
        RAISE EXCEPTION 'training fixture generated a non-RFC UUID';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', probe_user_id::text, true);
    SELECT public.get_training_session_plan(
        probe_user_id,
        ARRAY['word-to-definition']::text[],
        NULL,
        'curated',
        'new',
        '{}'::jsonb,
        '5'
    )
    INTO plan;

    IF COALESCE((plan->>'plannedTotal')::integer, 0) <> 5
       OR COALESCE((plan->>'plannedNew')::integer, 0) <> 5 THEN
        RAISE EXCEPTION 'training fixture did not prepare five new cards: %', plan;
    END IF;
END;
$$;

COMMIT;
