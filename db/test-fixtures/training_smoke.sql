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
    example_text text;
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
        example_text := NULLIF(trim(entry.raw #>> '{meanings,0,examples,0}'), '');
        IF definition_text IS NULL THEN
            RAISE EXCEPTION 'training fixture entry % has no definition', entry.id;
        END IF;

        nodes := jsonb_build_array(jsonb_build_object(
            'inputKey', 'definition-0',
            'kind', 'definition',
            'sourcePath', 'raw.meanings[0].definition',
            'sourceNativeKey', 'definition-0',
            'sourceTextFingerprint', encode(digest(definition_text, 'sha256'), 'hex'),
            'sourceText', definition_text
        ));
        IF example_text IS NOT NULL THEN
            nodes := nodes || jsonb_build_array(jsonb_build_object(
                'inputKey', 'example-0',
                'kind', 'example',
                'sourcePath', 'raw.meanings[0].examples[0]',
                'sourceNativeKey', 'example-0',
                'sourceTextFingerprint', encode(digest(example_text, 'sha256'), 'hex'),
                'parentInputKey', 'definition-0',
                'sourceText', example_text
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
