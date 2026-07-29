-- Separate source-managed and user-owned entry identity.
-- Generated: 2026-07-29

BEGIN;

INSERT INTO public.dictionary_schemas (
    schema_key,
    version,
    language_code,
    title,
    description,
    source_path,
    render_capabilities
)
VALUES (
    'nl-vandale-v2',
    1,
    'nl',
    'Structured Dutch Van Dale entry schema',
    'Van Dale payload with explicit lexical relations, sense metadata, idiom examples, references, and source identity evidence.',
    'packages/shared/schemas/nl/note.schema.json',
    ARRAY[
        'definitions',
        'examples',
        'idioms',
        'audio',
        'images',
        'morphology',
        'conjugation',
        'synonyms',
        'antonyms',
        'usage-labels',
        'notes',
        'cross-references',
        'reference-tables'
    ]::text[]
)
ON CONFLICT (schema_key, version) DO UPDATE
SET language_code = excluded.language_code,
    title = excluded.title,
    description = excluded.description,
    source_path = excluded.source_path,
    render_capabilities = excluded.render_capabilities;

ALTER TABLE public.word_entries
    ADD COLUMN IF NOT EXISTS management_kind text,
    ADD COLUMN IF NOT EXISTS source_lifecycle text,
    ADD COLUMN IF NOT EXISTS normalized_pos_status text;

UPDATE public.word_entries AS entry
SET management_kind = CASE
        WHEN dictionary.kind = 'user' THEN 'user'
        ELSE 'source'
    END,
    source_lifecycle = CASE
        WHEN dictionary.kind = 'user' THEN NULL
        ELSE COALESCE(entry.source_lifecycle, 'active')
    END,
    normalized_pos_status = CASE
        WHEN dictionary.kind = 'user' THEN NULL
        ELSE COALESCE(entry.normalized_pos_status, 'unresolved')
    END
FROM public.dictionaries AS dictionary
WHERE dictionary.id = entry.dictionary_id
  AND (
      entry.management_kind IS NULL
      OR (
          dictionary.kind = 'user'
          AND (
              entry.management_kind <> 'user'
              OR entry.source_lifecycle IS NOT NULL
              OR entry.normalized_pos_status IS NOT NULL
          )
      )
      OR (
          dictionary.kind <> 'user'
          AND (
              entry.management_kind <> 'source'
              OR entry.source_lifecycle IS NULL
              OR entry.normalized_pos_status IS NULL
          )
      )
  );

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.word_entries
        WHERE management_kind IS NULL
    ) THEN
        RAISE EXCEPTION 'word_entries_without_management_kind';
    END IF;
END;
$$;

ALTER TABLE public.word_entries
    ALTER COLUMN management_kind SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.word_entries'::regclass
          AND conname = 'word_entries_management_kind_check'
    ) THEN
        ALTER TABLE public.word_entries
            ADD CONSTRAINT word_entries_management_kind_check
            CHECK (management_kind IN ('source', 'user'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.word_entries'::regclass
          AND conname = 'word_entries_management_fields_check'
    ) THEN
        ALTER TABLE public.word_entries
            ADD CONSTRAINT word_entries_management_fields_check
            CHECK (
                (
                    management_kind = 'source'
                    AND source_lifecycle IN ('active', 'retired')
                    AND normalized_pos_status IN (
                        'known',
                        'source-none',
                        'unresolved'
                    )
                )
                OR (
                    management_kind = 'user'
                    AND source_lifecycle IS NULL
                    AND normalized_pos_status IS NULL
                )
            );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.assign_word_entry_management()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_dictionary_kind text;
    v_expected_management text;
BEGIN
    SELECT kind
    INTO v_dictionary_kind
    FROM public.dictionaries
    WHERE id = NEW.dictionary_id;

    IF v_dictionary_kind IS NULL THEN
        RAISE EXCEPTION 'word_entry_dictionary_not_found';
    END IF;

    v_expected_management := CASE
        WHEN v_dictionary_kind = 'user' THEN 'user'
        ELSE 'source'
    END;

    NEW.management_kind := COALESCE(
        NEW.management_kind,
        v_expected_management
    );
    IF NEW.management_kind <> v_expected_management THEN
        RAISE EXCEPTION 'word_entry_management_mismatch';
    END IF;

    IF NEW.management_kind = 'source' THEN
        NEW.source_lifecycle := COALESCE(NEW.source_lifecycle, 'active');
        NEW.normalized_pos_status := COALESCE(
            NEW.normalized_pos_status,
            'unresolved'
        );
    ELSE
        NEW.source_lifecycle := NULL;
        NEW.normalized_pos_status := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_word_entries_management
    ON public.word_entries;
CREATE TRIGGER trg_word_entries_management
BEFORE INSERT OR UPDATE OF dictionary_id, management_kind,
    source_lifecycle, normalized_pos_status
ON public.word_entries
FOR EACH ROW
EXECUTE FUNCTION private.assign_word_entry_management();

CREATE TABLE IF NOT EXISTS private.dictionary_import_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dictionary_id uuid NOT NULL
        REFERENCES public.dictionaries(id) ON DELETE RESTRICT,
    identity_scheme_version text NOT NULL,
    artifact_format_version text NOT NULL,
    manifest_checksum text NOT NULL,
    input_checksum text NOT NULL,
    source_record_count integer NOT NULL CHECK (source_record_count >= 0),
    artifact_count integer NOT NULL CHECK (artifact_count >= 0),
    status text NOT NULL CHECK (
        status IN ('planned', 'running', 'completed', 'failed')
    ),
    counts jsonb NOT NULL DEFAULT '{}'::jsonb,
    actor text,
    reason text,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dictionary_import_runs_manifest_idx
    ON private.dictionary_import_runs (
        dictionary_id,
        identity_scheme_version,
        manifest_checksum
    );

CREATE TABLE IF NOT EXISTS private.source_entry_bindings (
    dictionary_id uuid NOT NULL
        REFERENCES public.dictionaries(id) ON DELETE RESTRICT,
    identity_scheme_version text NOT NULL,
    source_entry_key text NOT NULL,
    source_group_key text NOT NULL,
    sense_ordinal integer NOT NULL CHECK (sense_ordinal > 0),
    word_entry_id uuid
        REFERENCES public.word_entries(id) ON DELETE RESTRICT,
    binding_state text NOT NULL CHECK (
        binding_state IN ('active', 'retired', 'ambiguous', 'rejected')
    ),
    first_seen_run_id uuid NOT NULL
        REFERENCES private.dictionary_import_runs(id) ON DELETE RESTRICT,
    last_seen_run_id uuid NOT NULL
        REFERENCES private.dictionary_import_runs(id) ON DELETE RESTRICT,
    manifest_checksum text NOT NULL,
    content_fingerprint_version text NOT NULL,
    content_fingerprint text NOT NULL,
    identity_evidence jsonb NOT NULL,
    reconciliation_decision jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (
        dictionary_id,
        identity_scheme_version,
        source_entry_key
    ),
    CHECK (
        (
            binding_state IN ('active', 'retired')
            AND word_entry_id IS NOT NULL
        )
        OR (
            binding_state IN ('ambiguous', 'rejected')
            AND word_entry_id IS NULL
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS source_entry_bindings_active_word_idx
    ON private.source_entry_bindings (word_entry_id)
    WHERE binding_state = 'active';

CREATE INDEX IF NOT EXISTS source_entry_bindings_group_idx
    ON private.source_entry_bindings (
        dictionary_id,
        identity_scheme_version,
        source_group_key,
        sense_ordinal
    );

CREATE TABLE IF NOT EXISTS private.source_entry_binding_aliases (
    dictionary_id uuid NOT NULL,
    identity_scheme_version text NOT NULL,
    alias_source_entry_key text NOT NULL,
    canonical_source_entry_key text NOT NULL,
    actor text NOT NULL,
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (
        dictionary_id,
        identity_scheme_version,
        alias_source_entry_key
    ),
    FOREIGN KEY (
        dictionary_id,
        identity_scheme_version,
        canonical_source_entry_key
    )
    REFERENCES private.source_entry_bindings (
        dictionary_id,
        identity_scheme_version,
        source_entry_key
    )
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION private.validate_source_entry_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_entry_dictionary_id uuid;
    v_management_kind text;
BEGIN
    IF NEW.word_entry_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT dictionary_id, management_kind
    INTO v_entry_dictionary_id, v_management_kind
    FROM public.word_entries
    WHERE id = NEW.word_entry_id;

    IF v_entry_dictionary_id IS DISTINCT FROM NEW.dictionary_id
       OR v_management_kind <> 'source' THEN
        RAISE EXCEPTION 'source_binding_entry_mismatch';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_source_entry_binding
    ON private.source_entry_bindings;
CREATE TRIGGER trg_validate_source_entry_binding
BEFORE INSERT OR UPDATE OF dictionary_id, word_entry_id
ON private.source_entry_bindings
FOR EACH ROW
EXECUTE FUNCTION private.validate_source_entry_binding();

REVOKE ALL ON TABLE private.dictionary_import_runs FROM PUBLIC;
REVOKE ALL ON TABLE private.source_entry_bindings FROM PUBLIC;
REVOKE ALL ON TABLE private.source_entry_binding_aliases FROM PUBLIC;

CREATE UNIQUE INDEX IF NOT EXISTS word_entries_user_identity_idx
    ON public.word_entries (
        dictionary_id,
        language_code,
        headword,
        meaning_id
    )
    WHERE management_kind = 'user';

-- Preserve the current copy/idempotency behavior in the user writer space.
CREATE OR REPLACE FUNCTION public.copy_entry_to_user_dictionary(
    p_user_id uuid,
    p_source_entry_id uuid,
    p_target_dictionary_id uuid DEFAULT NULL::uuid,
    p_overrides jsonb DEFAULT '{}'::jsonb
)
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
    IF (select auth.uid()) IS NULL
       OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT * INTO v_source
    FROM word_entries
    WHERE id = p_source_entry_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry_not_found';
    END IF;

    IF v_source.dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(
           p_user_id,
           v_source.dictionary_id,
           'read'
       ) THEN
        RAISE EXCEPTION 'entry_not_accessible';
    END IF;

    v_target_dictionary_id := COALESCE(
        p_target_dictionary_id,
        ensure_user_dictionary(
            p_user_id,
            v_source.language_code,
            'My dictionary'
        )
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
    IF NOT EXISTS (
        SELECT 1 FROM languages WHERE code = v_language_code
    ) THEN
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
        raw,
        management_kind
    )
    VALUES (
        v_target_dictionary_id,
        v_language_code,
        v_headword,
        COALESCE(v_source.meaning_id, 1),
        v_part_of_speech,
        v_gender,
        false,
        v_payload,
        'user'
    )
    ON CONFLICT (dictionary_id, language_code, headword, meaning_id)
    WHERE management_kind = 'user'
    DO UPDATE SET
        part_of_speech = excluded.part_of_speech,
        gender = excluded.gender,
        raw = excluded.raw
    RETURNING id INTO v_copied_entry_id;

    RETURN v_copied_entry_id;
END;
$function$;

DROP INDEX IF EXISTS
    public.word_entries_dictionary_language_headword_meaning_idx;

COMMIT;
