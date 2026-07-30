-- Durable Content Node identity and fail-closed reconciliation for Platform V2.

BEGIN;

CREATE TABLE IF NOT EXISTS private.platform_v2_content_nodes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id uuid NOT NULL
        REFERENCES public.word_entries(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (
        kind IN (
            'definition',
            'usage-pattern',
            'example',
            'idiom',
            'idiom-explanation',
            'usage-note'
        )
    ),
    parent_content_node_id uuid
        REFERENCES private.platform_v2_content_nodes(id) ON DELETE RESTRICT,
    binding_state text NOT NULL CHECK (
        binding_state IN ('active', 'retired')
    ),
    first_source_revision text NOT NULL,
    last_source_revision text NOT NULL,
    source_native_key text,
    source_text_fingerprint text NOT NULL,
    diagnostic_locator text NOT NULL,
    identity_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    reconciliation_decision jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS
    platform_v2_content_nodes_native_identity_idx
ON private.platform_v2_content_nodes (
    entry_id,
    kind,
    source_native_key
)
WHERE source_native_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS
    platform_v2_content_nodes_active_fingerprint_idx
ON private.platform_v2_content_nodes (
    entry_id,
    kind,
    source_text_fingerprint
)
WHERE binding_state = 'active'
  AND source_native_key IS NULL;

CREATE OR REPLACE FUNCTION private.validate_platform_v2_content_node()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_parent_entry_id uuid;
BEGIN
    IF NEW.parent_content_node_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT entry_id
    INTO v_parent_entry_id
    FROM private.platform_v2_content_nodes
    WHERE id = NEW.parent_content_node_id;

    IF NOT FOUND
       OR v_parent_entry_id IS DISTINCT FROM NEW.entry_id
       OR NEW.parent_content_node_id = NEW.id THEN
        RAISE EXCEPTION 'platform_v2_content_node_parent_mismatch';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_platform_v2_content_node
    ON private.platform_v2_content_nodes;
CREATE TRIGGER trg_validate_platform_v2_content_node
BEFORE INSERT OR UPDATE OF entry_id, parent_content_node_id
ON private.platform_v2_content_nodes
FOR EACH ROW
EXECUTE FUNCTION private.validate_platform_v2_content_node();

CREATE OR REPLACE FUNCTION private.reconcile_platform_v2_content_nodes(
    p_entry_id uuid,
    p_source_revision text,
    p_nodes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_node record;
    v_existing_id uuid;
    v_candidate_count integer;
    v_parent_id uuid;
    v_decision text;
    v_result jsonb;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.word_entries
        WHERE id = p_entry_id
    ) THEN
        RAISE EXCEPTION 'platform_v2_entry_not_found';
    END IF;
    IF NULLIF(trim(p_source_revision), '') IS NULL
       OR jsonb_typeof(p_nodes) <> 'array' THEN
        RAISE EXCEPTION 'platform_v2_invalid_content_nodes';
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS pg_temp.platform_v2_incoming_nodes (
        sequence_number integer NOT NULL,
        input_key text PRIMARY KEY,
        kind text NOT NULL,
        source_path text NOT NULL,
        source_native_key text,
        source_text_fingerprint text NOT NULL,
        parent_input_key text,
        content_node_id uuid,
        decision text
    ) ON COMMIT DROP;
    TRUNCATE pg_temp.platform_v2_incoming_nodes;

    INSERT INTO pg_temp.platform_v2_incoming_nodes (
        sequence_number,
        input_key,
        kind,
        source_path,
        source_native_key,
        source_text_fingerprint,
        parent_input_key
    )
    SELECT
        node.ordinality::integer,
        NULLIF(trim(node.value->>'inputKey'), ''),
        NULLIF(trim(node.value->>'kind'), ''),
        NULLIF(trim(node.value->>'sourcePath'), ''),
        NULLIF(trim(node.value->>'sourceNativeKey'), ''),
        NULLIF(trim(node.value->>'sourceTextFingerprint'), ''),
        NULLIF(trim(node.value->>'parentInputKey'), '')
    FROM jsonb_array_elements(p_nodes) WITH ORDINALITY AS node(value, ordinality);

    IF EXISTS (
        SELECT 1
        FROM pg_temp.platform_v2_incoming_nodes
        WHERE input_key IS NULL
           OR source_path IS NULL
           OR source_text_fingerprint IS NULL
           OR kind NOT IN (
                'definition',
                'usage-pattern',
                'example',
                'idiom',
                'idiom-explanation',
                'usage-note'
           )
    ) THEN
        RAISE EXCEPTION 'platform_v2_invalid_content_node';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_temp.platform_v2_incoming_nodes
        WHERE source_native_key IS NOT NULL
        GROUP BY kind, source_native_key
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'platform_v2_duplicate_native_content_identity';
    END IF;

    FOR v_node IN
        SELECT *
        FROM pg_temp.platform_v2_incoming_nodes
        ORDER BY sequence_number
    LOOP
        v_existing_id := NULL;
        v_candidate_count := 0;

        IF v_node.source_native_key IS NOT NULL THEN
            SELECT id
            INTO v_existing_id
            FROM private.platform_v2_content_nodes
            WHERE entry_id = p_entry_id
              AND kind = v_node.kind
              AND source_native_key = v_node.source_native_key;
            v_decision := CASE
                WHEN v_existing_id IS NULL THEN 'new-native'
                ELSE 'preserve-native'
            END;
        ELSE
            SELECT count(*), min(id::text)::uuid
            INTO v_candidate_count, v_existing_id
            FROM private.platform_v2_content_nodes
            WHERE entry_id = p_entry_id
              AND kind = v_node.kind
              AND source_native_key IS NULL
              AND source_text_fingerprint =
                  v_node.source_text_fingerprint
              AND binding_state = 'active'
              AND id NOT IN (
                  SELECT content_node_id
                  FROM pg_temp.platform_v2_incoming_nodes
                  WHERE content_node_id IS NOT NULL
              );

            IF (
                SELECT count(*)
                FROM pg_temp.platform_v2_incoming_nodes
                WHERE kind = v_node.kind
                  AND source_native_key IS NULL
                  AND source_text_fingerprint =
                      v_node.source_text_fingerprint
            ) > 1 THEN
                v_existing_id := NULL;
                v_decision := 'new-ambiguous-duplicate';
            ELSIF v_candidate_count = 1 THEN
                v_decision := 'preserve-unambiguous-fingerprint';
            ELSE
                v_existing_id := NULL;
                v_decision := CASE
                    WHEN v_candidate_count > 1
                        THEN 'new-ambiguous-existing'
                    ELSE 'new-unmatched'
                END;
            END IF;
        END IF;

        IF v_existing_id IS NULL THEN
            INSERT INTO private.platform_v2_content_nodes (
                entry_id,
                kind,
                binding_state,
                first_source_revision,
                last_source_revision,
                source_native_key,
                source_text_fingerprint,
                diagnostic_locator,
                identity_evidence,
                reconciliation_decision
            )
            VALUES (
                p_entry_id,
                v_node.kind,
                'active',
                p_source_revision,
                p_source_revision,
                v_node.source_native_key,
                v_node.source_text_fingerprint,
                v_node.source_path,
                jsonb_strip_nulls(jsonb_build_object(
                    'sourceNativeKey', v_node.source_native_key,
                    'sourceTextFingerprint',
                        v_node.source_text_fingerprint
                )),
                jsonb_build_object('decision', v_decision)
            )
            RETURNING id INTO v_existing_id;
        ELSE
            UPDATE private.platform_v2_content_nodes
            SET binding_state = 'active',
                last_source_revision = p_source_revision,
                source_text_fingerprint =
                    v_node.source_text_fingerprint,
                diagnostic_locator = v_node.source_path,
                reconciliation_decision =
                    jsonb_build_object('decision', v_decision),
                updated_at = now()
            WHERE id = v_existing_id;
        END IF;

        UPDATE pg_temp.platform_v2_incoming_nodes
        SET content_node_id = v_existing_id,
            decision = v_decision
        WHERE input_key = v_node.input_key;
    END LOOP;

    FOR v_node IN
        SELECT *
        FROM pg_temp.platform_v2_incoming_nodes
    LOOP
        v_parent_id := NULL;
        IF v_node.parent_input_key IS NOT NULL THEN
            SELECT content_node_id
            INTO v_parent_id
            FROM pg_temp.platform_v2_incoming_nodes
            WHERE input_key = v_node.parent_input_key;

            IF v_parent_id IS NULL THEN
                RAISE EXCEPTION 'platform_v2_content_node_parent_not_found';
            END IF;
        END IF;

        UPDATE private.platform_v2_content_nodes
        SET parent_content_node_id = v_parent_id,
            updated_at = now()
        WHERE id = v_node.content_node_id;
    END LOOP;

    UPDATE private.platform_v2_content_nodes
    SET binding_state = 'retired',
        last_source_revision = p_source_revision,
        reconciliation_decision =
            jsonb_build_object('decision', 'retire-missing'),
        updated_at = now()
    WHERE entry_id = p_entry_id
      AND binding_state = 'active'
      AND id NOT IN (
          SELECT content_node_id
          FROM pg_temp.platform_v2_incoming_nodes
      );

    SELECT jsonb_build_object(
        'entryId', p_entry_id,
        'sourceRevision', p_source_revision,
        'nodes',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'inputKey', input_key,
                    'contentNodeId', content_node_id,
                    'decision', decision
                )
                ORDER BY sequence_number
            ),
            '[]'::jsonb
        )
    )
    INTO v_result
    FROM pg_temp.platform_v2_incoming_nodes;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION private.platform_v2_user_entry_content_nodes(
    p_raw jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
IMMUTABLE
AS $$
DECLARE
    v_nodes jsonb := '[]'::jsonb;
    v_text text;
BEGIN
    v_text := NULLIF(trim(p_raw->>'definition'), '');
    IF v_text IS NOT NULL THEN
        v_nodes := v_nodes || jsonb_build_array(jsonb_build_object(
            'inputKey', 'definition',
            'kind', 'definition',
            'sourcePath', 'raw.definition',
            'sourceNativeKey', 'user-entry-v1:definition',
            'sourceTextFingerprint',
                encode(digest('definition' || chr(31) || v_text, 'sha256'), 'hex')
        ));
    END IF;

    v_text := NULLIF(trim(p_raw#>>'{example,source}'), '');
    IF v_text IS NOT NULL THEN
        v_nodes := v_nodes || jsonb_build_array(jsonb_build_object(
            'inputKey', 'example',
            'kind', 'example',
            'sourcePath', 'raw.example.source',
            'sourceNativeKey', 'user-entry-v1:example',
            'sourceTextFingerprint',
                encode(digest('example' || chr(31) || v_text, 'sha256'), 'hex')
        ));
    END IF;

    v_text := NULLIF(trim(p_raw->>'notes'), '');
    IF v_text IS NOT NULL THEN
        v_nodes := v_nodes || jsonb_build_array(jsonb_build_object(
            'inputKey', 'notes',
            'kind', 'usage-note',
            'sourcePath', 'raw.notes',
            'sourceNativeKey', 'user-entry-v1:notes',
            'sourceTextFingerprint',
                encode(digest('usage-note' || chr(31) || v_text, 'sha256'), 'hex')
        ));
    END IF;

    RETURN v_nodes;
END;
$$;

CREATE OR REPLACE FUNCTION private.reconcile_platform_v2_user_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
    IF NEW.management_kind = 'user' THEN
        PERFORM private.reconcile_platform_v2_content_nodes(
            NEW.id,
            'user-entry-v1:'
                || encode(digest(NEW.raw::text, 'sha256'), 'hex'),
            private.platform_v2_user_entry_content_nodes(NEW.raw)
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconcile_platform_v2_user_entry
    ON public.word_entries;
CREATE TRIGGER trg_reconcile_platform_v2_user_entry
AFTER INSERT OR UPDATE OF raw, management_kind
ON public.word_entries
FOR EACH ROW
EXECUTE FUNCTION private.reconcile_platform_v2_user_entry();

DO $$
DECLARE
    v_entry record;
BEGIN
    FOR v_entry IN
        SELECT id, raw
        FROM public.word_entries
        WHERE management_kind = 'user'
    LOOP
        PERFORM private.reconcile_platform_v2_content_nodes(
            v_entry.id,
            'user-entry-v1:'
                || encode(digest(v_entry.raw::text, 'sha256'), 'hex'),
            private.platform_v2_user_entry_content_nodes(v_entry.raw)
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.read_platform_v2_content_node_bindings(
    p_entry_id uuid
)
RETURNS jsonb
LANGUAGE sql
SET search_path = public, private, pg_temp
STABLE
AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'contentNodeId', node.id,
                'sourcePath', node.diagnostic_locator,
                'kind', node.kind,
                'parentContentNodeId', node.parent_content_node_id,
                'sourceTextFingerprint', node.source_text_fingerprint
            )
            ORDER BY node.created_at, node.id
        ),
        '[]'::jsonb
    )
    FROM private.platform_v2_content_nodes AS node
    WHERE node.entry_id = p_entry_id
      AND node.binding_state = 'active';
$$;

CREATE OR REPLACE FUNCTION public.read_platform_v2_presentation_identity(
    p_user_id uuid,
    p_entry_ids uuid[],
    p_catalog boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_requested_count integer;
    v_visible_count integer;
    v_identity_count integer;
    v_entries jsonb;
BEGIN
    IF p_entry_ids IS NULL
       OR cardinality(p_entry_ids) = 0 THEN
        RETURN jsonb_build_object('entries', '[]'::jsonb);
    END IF;

    IF p_catalog AND p_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'platform_v2_invalid_principal';
    END IF;
    IF NOT p_catalog AND p_user_id IS NULL THEN
        RAISE EXCEPTION 'platform_v2_invalid_principal';
    END IF;

    SELECT count(DISTINCT requested.entry_id)
    INTO v_requested_count
    FROM unnest(p_entry_ids) AS requested(entry_id);

    SELECT count(DISTINCT entry.id)
    INTO v_visible_count
    FROM unnest(p_entry_ids) AS requested(entry_id)
    JOIN public.word_entries AS entry
      ON entry.id = requested.entry_id
    JOIN public.dictionaries AS dictionary
      ON dictionary.id = entry.dictionary_id
    WHERE (
        p_catalog
        AND dictionary.kind <> 'user'
        AND dictionary.visibility IN ('system', 'public')
    )
    OR (
        NOT p_catalog
        AND public.can_access_dictionary(
            p_user_id,
            dictionary.id,
            'read'
        )
    );

    IF v_visible_count <> v_requested_count THEN
        RAISE EXCEPTION 'platform_v2_entry_not_accessible';
    END IF;

    WITH requested AS (
        SELECT entry_id, ordinal
        FROM unnest(p_entry_ids) WITH ORDINALITY
            AS requested(entry_id, ordinal)
    ),
    resolved AS (
        SELECT
            requested.ordinal,
            entry.id AS entry_id,
            COALESCE(source_group.id, user_group.id) AS headword_group_id,
            COALESCE(binding.sense_ordinal, entry.meaning_id) AS meaning_ordinal
        FROM requested
        JOIN public.word_entries AS entry
          ON entry.id = requested.entry_id
        LEFT JOIN private.source_entry_bindings AS binding
          ON binding.word_entry_id = entry.id
         AND binding.binding_state = 'active'
        LEFT JOIN private.platform_v2_headword_groups AS source_group
          ON source_group.management_kind = 'source'
         AND source_group.dictionary_id = binding.dictionary_id
         AND source_group.identity_scheme_version =
             binding.identity_scheme_version
         AND source_group.source_group_key = binding.source_group_key
        LEFT JOIN private.platform_v2_headword_groups AS user_group
          ON user_group.management_kind = 'user'
         AND user_group.singleton_entry_id = entry.id
    )
    SELECT
        count(*) FILTER (WHERE headword_group_id IS NOT NULL),
        jsonb_agg(
            jsonb_build_object(
                'entryId', entry_id,
                'headwordGroupId', headword_group_id,
                'meaningOrdinal', meaning_ordinal,
                'contentNodeBindings',
                    private.read_platform_v2_content_node_bindings(entry_id)
            )
            ORDER BY ordinal
        )
    INTO v_identity_count, v_entries
    FROM resolved;

    IF v_identity_count <> cardinality(p_entry_ids) THEN
        RAISE EXCEPTION 'platform_v2_identity_missing';
    END IF;

    RETURN jsonb_build_object('entries', COALESCE(v_entries, '[]'::jsonb));
END;
$$;

REVOKE ALL ON TABLE private.platform_v2_content_nodes FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
    public.read_platform_v2_presentation_identity(uuid, uuid[], boolean)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
    public.read_platform_v2_presentation_identity(uuid, uuid[], boolean)
TO service_role;

COMMIT;
