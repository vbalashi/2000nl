-- Explicitly opted-in local QA only. Not a migration, bootstrap or deploy input.
-- Prerequisite: search_multisource.sql installed nl-fixture-v1.
-- Caller must use an explicit local DSN and set_config('app.local_qa753','true',false).
-- Adds only its own dictionary/entries/bindings/nodes/search documents; no user
-- collections, progress or existing source identities are modified.
BEGIN;
DO $fixture$
<<qa753>>
DECLARE
    fixture_dictionary_id constant uuid := '75300000-0000-4000-8000-000000000100';
    run_id constant uuid := '75300000-0000-4000-8000-000000000200';
    scheme constant text := 'local-qa753-meanings-v1';
    group_key constant text := 'local-qa753:bank';
    manifest text := encode(digest('2000nl:qa753:bank:two-meanings:v1', 'sha256'), 'hex');
    sense record;
    payload jsonb;
    nodes jsonb;
BEGIN
    IF current_setting('app.local_qa753', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'local_qa_opt_in_required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.dictionary_schemas
        WHERE schema_key='nl-fixture-v1' AND version=1 AND language_code='nl') THEN
        RAISE EXCEPTION 'local_qa_fixture_schema_missing';
    END IF;
    -- Refuse namespace collisions instead of repurposing any pre-existing data.
    IF EXISTS (SELECT 1 FROM public.dictionaries dictionary
        WHERE (dictionary.id=qa753.fixture_dictionary_id OR (dictionary.language_code='nl' AND dictionary.slug='nl-qa753-meanings'))
        AND (dictionary.id<>qa753.fixture_dictionary_id OR dictionary.language_code<>'nl'
            OR dictionary.slug<>'nl-qa753-meanings' OR dictionary.source_provider IS DISTINCT FROM 'local-qa753'
            OR dictionary.kind<>'curated' OR dictionary.schema_key IS DISTINCT FROM 'nl-fixture-v1'
            OR dictionary.schema_version IS DISTINCT FROM 1 OR dictionary.publication_state<>'general')) THEN
        RAISE EXCEPTION 'local_qa_dictionary_namespace_collision';
    END IF;
    INSERT INTO public.dictionaries (
        id,language_code,slug,name,description,kind,visibility,is_editable,
        minimum_subscription_tier,schema_key,schema_version,source_provider,source_version,publication_state
    ) VALUES (
        qa753.fixture_dictionary_id,'nl','nl-qa753-meanings','NL QA753 betekenissen',
        'Local QA: two bank meanings in one source article.',
        'curated','system',false,'free','nl-fixture-v1',1,'local-qa753','v1','general'
    ) ON CONFLICT (id) DO NOTHING;

    IF EXISTS (SELECT 1 FROM private.dictionary_import_runs run WHERE run.id=qa753.run_id
        AND (run.dictionary_id<>qa753.fixture_dictionary_id OR run.identity_scheme_version<>qa753.scheme OR run.manifest_checksum<>qa753.manifest)) THEN
        RAISE EXCEPTION 'local_qa_import_namespace_collision';
    END IF;
    INSERT INTO private.dictionary_import_runs (
        id,dictionary_id,identity_scheme_version,artifact_format_version,
        manifest_checksum,input_checksum,source_record_count,artifact_count,status,counts,actor,reason,finished_at
    ) VALUES (
        qa753.run_id,qa753.fixture_dictionary_id,qa753.scheme,'local-qa753-v1',manifest,manifest,2,2,'completed',
        '{"fixture_artifacts":2}'::jsonb,'db/test-fixtures/library_material_meanings.sql',
        'Explicit local multi-meaning collection QA',now()
    ) ON CONFLICT (id) DO NOTHING;

    FOR sense IN SELECT * FROM (VALUES
        ('75300000-0000-4000-8000-000000000001'::uuid,1,
            'Zitmeubel voor meerdere personen.'::text,'De bank staat naast het raam.'::text),
        ('75300000-0000-4000-8000-000000000002'::uuid,2,
            'Instelling waar mensen geld bewaren.'::text,'Ik zet mijn spaargeld op de bank.'::text)
    ) AS meanings(id,ordinal,definition,example)
    LOOP
        payload := jsonb_build_object(
            'headword','bank','pronunciation','bank','pronunciation_with_stress','bank',
            'gender','de','part_of_speech','zn','plural','banken','meaning_id',sense.ordinal,
            'is_nt2_2000',true,'audio_links','{}'::jsonb,'images','[]'::jsonb,
            'meanings',jsonb_build_array(jsonb_build_object(
                'definition',sense.definition,'context','','examples',jsonb_build_array(sense.example),'idioms','[]'::jsonb)),
            '_metadata',jsonb_build_object('fixture',true,'index',753000+sense.ordinal,
                'search_term','bank','headword_raw','bank','dictionaryId','nl-qa753-meanings',
                'dictionary_name','NL QA753 betekenissen'),
            '_source',jsonb_build_object('identity_scheme_version',scheme,
                'source_entry_key',group_key||':sense-'||sense.ordinal,'source_group_key',group_key,
                'sense_ordinal',sense.ordinal,'source_index',753000+sense.ordinal,
                'normalized_pos_status','known','identity_evidence',jsonb_build_object('kind','deterministic-local-qa753'))
        );
        IF EXISTS (SELECT 1 FROM public.word_entries entry WHERE entry.id=sense.id
            AND (entry.dictionary_id<>qa753.fixture_dictionary_id OR entry.raw IS DISTINCT FROM payload)) THEN
            RAISE EXCEPTION 'local_qa_entry_namespace_collision: %',sense.id;
        END IF;
        INSERT INTO public.word_entries (
            id,dictionary_id,language_code,headword,meaning_id,part_of_speech,gender,
            is_nt2_2000,source_rank,raw,management_kind,source_lifecycle,normalized_pos_status
        ) VALUES (
            sense.id,qa753.fixture_dictionary_id,'nl','bank',sense.ordinal,'zn','de',true,753000+sense.ordinal,
            payload,'source','active','known'
        ) ON CONFLICT (id) DO NOTHING;

        IF EXISTS (SELECT 1 FROM private.source_entry_bindings binding
            WHERE (binding.word_entry_id=sense.id OR (binding.dictionary_id=qa753.fixture_dictionary_id
                AND binding.identity_scheme_version=qa753.scheme AND binding.source_entry_key=qa753.group_key||':sense-'||sense.ordinal))
            AND (binding.dictionary_id<>qa753.fixture_dictionary_id OR binding.identity_scheme_version<>qa753.scheme
                OR binding.source_entry_key<>qa753.group_key||':sense-'||sense.ordinal
                OR binding.source_group_key<>qa753.group_key OR binding.sense_ordinal<>sense.ordinal
                OR binding.word_entry_id IS DISTINCT FROM sense.id OR binding.binding_state<>'active')) THEN
            RAISE EXCEPTION 'local_qa_binding_namespace_collision: %',sense.id;
        END IF;
        INSERT INTO private.source_entry_bindings (
            dictionary_id,identity_scheme_version,source_entry_key,source_group_key,sense_ordinal,
            word_entry_id,binding_state,first_seen_run_id,last_seen_run_id,manifest_checksum,
            content_fingerprint_version,content_fingerprint,identity_evidence,reconciliation_decision
        ) VALUES (
            qa753.fixture_dictionary_id,qa753.scheme,qa753.group_key||':sense-'||sense.ordinal,group_key,sense.ordinal,
            sense.id,'active',qa753.run_id,qa753.run_id,qa753.manifest,'fixture-jsonb-v1',encode(digest(payload::text,'sha256'),'hex'),
            '{"kind":"deterministic-local-qa753"}'::jsonb,
            '{"action":"create-isolated-fixture","fixture":"library_material_meanings"}'::jsonb
        ) ON CONFLICT (dictionary_id,identity_scheme_version,source_entry_key) DO NOTHING;

        nodes := jsonb_build_array(
            jsonb_build_object('inputKey','definition-0','kind','definition',
                'sourcePath','raw.meanings[0].definition','sourceNativeKey','qa753:definition-0',
                'sourceTextFingerprint',encode(digest(sense.definition,'sha256'),'hex'),'sourceText',sense.definition),
            jsonb_build_object('inputKey','example-0','kind','example',
                'sourcePath','raw.meanings[0].examples[0]','sourceNativeKey','qa753:example-0',
                'sourceTextFingerprint',encode(digest(sense.example,'sha256'),'hex'),'sourceText',sense.example)
        );
        PERFORM private.reconcile_platform_v2_content_nodes(sense.id,scheme,nodes);
        PERFORM public.refresh_dictionary_search_document(sense.id,2);
    END LOOP;

    IF (SELECT count(*) FROM private.source_entry_bindings binding
        WHERE binding.dictionary_id=qa753.fixture_dictionary_id AND binding.identity_scheme_version=qa753.scheme
            AND binding.source_group_key=qa753.group_key AND binding.binding_state='active') <> 2
        OR (SELECT count(*) FROM private.platform_v2_headword_groups headword_group
            WHERE headword_group.dictionary_id=qa753.fixture_dictionary_id AND headword_group.identity_scheme_version=qa753.scheme
                AND headword_group.source_group_key=qa753.group_key AND headword_group.management_kind='source') <> 1 THEN
        RAISE EXCEPTION 'local_qa_group_identity_incomplete';
    END IF;
END;
$fixture$;
COMMIT;
