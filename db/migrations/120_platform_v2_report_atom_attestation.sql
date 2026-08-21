-- Independently verifiable bounded SenseCard source atoms for Diagnostic Reports.

BEGIN;

ALTER TABLE private.platform_v2_content_nodes
    ADD COLUMN IF NOT EXISTS canonical_source_text text,
    ADD COLUMN IF NOT EXISTS source_order integer;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'platform_v2_content_nodes_source_order_check'
          AND conrelid = 'private.platform_v2_content_nodes'::regclass
    ) THEN
        ALTER TABLE private.platform_v2_content_nodes
            ADD CONSTRAINT platform_v2_content_nodes_source_order_check
            CHECK (source_order IS NULL OR source_order > 0);
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS
    platform_v2_content_nodes_active_source_order_idx
ON private.platform_v2_content_nodes (entry_id, source_order)
WHERE binding_state = 'active'
  AND source_order IS NOT NULL;

CREATE OR REPLACE FUNCTION private.platform_v2_text_at_diagnostic_locator(
    p_raw jsonb,
    p_locator text,
    p_kind text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
IMMUTABLE
AS $$
DECLARE
    v_locator text;
    v_path text[];
    v_value jsonb;
    v_text text;
BEGIN
    v_locator := regexp_replace(COALESCE(p_locator, ''), '^raw\.', '');
    v_locator := regexp_replace(v_locator, '\[([0-9]+)\]', '.\1', 'g');
    v_path := regexp_split_to_array(v_locator, '\.');
    v_value := p_raw #> v_path;

    IF jsonb_typeof(v_value) = 'string' THEN
        v_text := v_value #>> '{}';
    ELSIF jsonb_typeof(v_value) = 'object' AND p_kind = 'idiom' THEN
        v_text := v_value->>'expression';
    ELSIF jsonb_typeof(v_value) = 'object' AND p_kind = 'example' THEN
        v_text := COALESCE(v_value->>'source', v_value->>'text');
    ELSE
        v_text := NULL;
    END IF;

    v_text := NULLIF(trim(v_text), '');
    RETURN CASE WHEN v_text IS NULL THEN NULL ELSE normalize(v_text, NFC) END;
END;
$$;

CREATE OR REPLACE FUNCTION private.platform_v2_diagnostic_locator_ordinals(
    p_locator text
)
RETURNS integer[]
LANGUAGE sql
SET search_path = pg_temp
IMMUTABLE
AS $$
    SELECT COALESCE(
        array_agg((matched.value)[1]::integer),
        ARRAY[]::integer[]
    )
    FROM regexp_matches(COALESCE(p_locator, ''), '([0-9]+)', 'g')
        AS matched(value);
$$;

WITH resolved AS (
    SELECT
        node.id,
        private.platform_v2_text_at_diagnostic_locator(
            entry.raw,
            node.diagnostic_locator,
            node.kind
        ) AS source_text,
        row_number() OVER (
            PARTITION BY node.entry_id
            ORDER BY
                private.platform_v2_diagnostic_locator_ordinals(
                    node.diagnostic_locator
                ),
                node.diagnostic_locator,
                node.id
        )::integer AS source_order
    FROM private.platform_v2_content_nodes AS node
    JOIN public.word_entries AS entry ON entry.id = node.entry_id
    WHERE node.binding_state = 'active'
)
UPDATE private.platform_v2_content_nodes AS node
SET canonical_source_text = resolved.source_text,
    source_order = resolved.source_order,
    updated_at = now()
FROM resolved
WHERE resolved.id = node.id
  AND resolved.source_text IS NOT NULL;

DO $$
BEGIN
    IF to_regprocedure(
        'private.reconcile_platform_v2_content_nodes_identity_v1(uuid,text,jsonb)'
    ) IS NULL THEN
        ALTER FUNCTION private.reconcile_platform_v2_content_nodes(uuid,text,jsonb)
            RENAME TO reconcile_platform_v2_content_nodes_identity_v1;
    END IF;
END;
$$;

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
    v_result jsonb;
BEGIN
    IF jsonb_typeof(p_nodes) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'platform_v2_invalid_content_nodes';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_nodes) AS node(value)
        WHERE node.value ? 'sourceText'
          AND (
              jsonb_typeof(node.value->'sourceText') IS DISTINCT FROM 'string'
              OR NULLIF(trim(node.value->>'sourceText'), '') IS NULL
          )
    ) THEN
        RAISE EXCEPTION 'platform_v2_invalid_content_node_text';
    END IF;

    v_result := private.reconcile_platform_v2_content_nodes_identity_v1(
        p_entry_id,
        p_source_revision,
        p_nodes
    );

    UPDATE private.platform_v2_content_nodes
    SET source_order = NULL,
        updated_at = now()
    WHERE entry_id = p_entry_id
      AND binding_state = 'active';

    WITH incoming AS (
        SELECT
            node.ordinality::integer AS source_order,
            node.value->>'inputKey' AS input_key,
            CASE
                WHEN node.value ? 'sourceText'
                    THEN normalize(trim(node.value->>'sourceText'), NFC)
                ELSE NULL
            END AS source_text
        FROM jsonb_array_elements(p_nodes) WITH ORDINALITY AS node(value, ordinality)
    ), resolved AS (
        SELECT
            (result_node.value->>'contentNodeId')::uuid AS content_node_id,
            incoming.source_order,
            incoming.source_text
        FROM jsonb_array_elements(v_result->'nodes') AS result_node(value)
        JOIN incoming
          ON incoming.input_key = result_node.value->>'inputKey'
    )
    UPDATE private.platform_v2_content_nodes AS node
    SET canonical_source_text = resolved.source_text,
        source_order = resolved.source_order,
        updated_at = now()
    FROM resolved
    WHERE node.id = resolved.content_node_id;

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
                encode(digest('definition' || chr(31) || v_text, 'sha256'), 'hex'),
            'sourceText', normalize(v_text, NFC)
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
                encode(digest('example' || chr(31) || v_text, 'sha256'), 'hex'),
            'sourceText', normalize(v_text, NFC)
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
                encode(digest('usage-note' || chr(31) || v_text, 'sha256'), 'hex'),
            'sourceText', normalize(v_text, NFC)
        ));
    END IF;

    RETURN v_nodes;
END;
$$;

CREATE OR REPLACE FUNCTION private.platform_v2_report_atom_source(
    p_entry_id uuid
)
RETURNS TABLE (
    atom_order integer,
    role text,
    content_node_id uuid,
    source_text text
)
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
STABLE
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM private.platform_v2_content_nodes AS node
        WHERE node.entry_id = p_entry_id
          AND node.binding_state = 'active'
          AND (node.canonical_source_text IS NULL OR node.source_order IS NULL)
    ) THEN
        RAISE EXCEPTION 'report_atom_projection_unverifiable';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM private.platform_v2_content_nodes AS node
        LEFT JOIN private.platform_v2_content_nodes AS parent
          ON parent.id = node.parent_content_node_id
        WHERE node.entry_id = p_entry_id
          AND node.binding_state = 'active'
          AND (
              (node.kind = 'idiom-explanation' AND node.parent_content_node_id IS NULL)
              OR (
                node.parent_content_node_id IS NOT NULL
                AND node.kind IN ('idiom-explanation', 'example')
                AND (
                    parent.entry_id IS DISTINCT FROM p_entry_id
                    OR parent.binding_state IS DISTINCT FROM 'active'
                    OR parent.kind IS DISTINCT FROM 'idiom'
                )
              )
          )
    ) THEN
        RAISE EXCEPTION 'report_atom_projection_unverifiable';
    END IF;

    RETURN QUERY
    WITH entry_atom AS (
        SELECT
            '0000000000'::text AS ordering,
            'headword'::text AS role,
            NULL::uuid AS content_node_id,
            normalize(trim(entry.headword), NFC) AS source_text
        FROM public.word_entries AS entry
        WHERE entry.id = p_entry_id
    ), node_atoms AS (
        SELECT
            CASE
                WHEN node.kind = 'definition' THEN
                    '10|' || lpad(node.source_order::text, 10, '0')
                WHEN node.kind = 'usage-pattern' THEN
                    '20|' || lpad(node.source_order::text, 10, '0')
                WHEN node.kind = 'idiom' THEN
                    '30|' || lpad(node.source_order::text, 10, '0') || '|0|0000000000'
                WHEN parent.kind = 'idiom' AND node.kind = 'idiom-explanation' THEN
                    '30|' || lpad(parent.source_order::text, 10, '0') || '|1|'
                        || lpad(node.source_order::text, 10, '0')
                WHEN parent.kind = 'idiom' AND node.kind = 'example' THEN
                    '30|' || lpad(parent.source_order::text, 10, '0') || '|2|'
                        || lpad(node.source_order::text, 10, '0')
                WHEN node.kind = 'example' AND node.parent_content_node_id IS NULL THEN
                    '40|' || lpad(node.source_order::text, 10, '0')
                WHEN node.kind = 'usage-note' THEN
                    '50|' || lpad(node.source_order::text, 10, '0')
                ELSE NULL
            END AS ordering,
            node.kind AS role,
            node.id AS content_node_id,
            node.canonical_source_text AS source_text
        FROM private.platform_v2_content_nodes AS node
        LEFT JOIN private.platform_v2_content_nodes AS parent
          ON parent.id = node.parent_content_node_id
        WHERE node.entry_id = p_entry_id
          AND node.binding_state = 'active'
    ), ordered AS (
        SELECT * FROM entry_atom
        UNION ALL
        SELECT * FROM node_atoms WHERE ordering IS NOT NULL
    )
    SELECT
        row_number() OVER (ORDER BY ordering)::integer,
        ordered.role,
        ordered.content_node_id,
        ordered.source_text
    FROM ordered
    ORDER BY ordering;
END;
$$;

CREATE OR REPLACE FUNCTION private.platform_v2_report_atom_revision(
    p_entry_id uuid
)
RETURNS text
LANGUAGE sql
SET search_path = public, private, extensions, pg_temp
STABLE
AS $$
    SELECT encode(
        digest(
            'platform-v2-report-atoms-v1:' || COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'atomOrder', atom.atom_order,
                        'role', atom.role,
                        'contentNodeId', atom.content_node_id,
                        'text', atom.source_text
                    ) ORDER BY atom.atom_order
                )::text,
                '[]'
            ),
            'sha256'
        ),
        'hex'
    )
    FROM private.platform_v2_report_atom_source(p_entry_id) AS atom;
$$;

CREATE OR REPLACE FUNCTION private.platform_v2_report_atom_revision_or_null(
    p_entry_id uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
STABLE
AS $$
BEGIN
    RETURN private.platform_v2_report_atom_revision(p_entry_id);
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

DO $$
BEGIN
    IF to_regprocedure(
        'private.read_platform_v2_presentation_identity_report_base_v1(uuid,uuid[],boolean)'
    ) IS NULL THEN
        ALTER FUNCTION public.read_platform_v2_presentation_identity(uuid,uuid[],boolean)
            RENAME TO read_platform_v2_presentation_identity_report_base_v1;
        ALTER FUNCTION public.read_platform_v2_presentation_identity_report_base_v1(uuid,uuid[],boolean)
            SET SCHEMA private;
    END IF;
END;
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
    v_base jsonb;
    v_entries jsonb;
BEGIN
    v_base := private.read_platform_v2_presentation_identity_report_base_v1(
        p_user_id,
        p_entry_ids,
        p_catalog
    );
    SELECT COALESCE(
        jsonb_agg(
            entry.value || jsonb_build_object(
                'reportContentRevision',
                private.platform_v2_report_atom_revision_or_null(
                    (entry.value->>'entryId')::uuid
                )
            )
            ORDER BY entry.ordinality
        ),
        '[]'::jsonb
    )
    INTO v_entries
    FROM jsonb_array_elements(COALESCE(v_base->'entries', '[]'::jsonb))
        WITH ORDINALITY AS entry(value, ordinality);
    RETURN jsonb_set(v_base, '{entries}', v_entries, false);
END;
$$;

CREATE OR REPLACE FUNCTION private.platform_v2_report_card_content_canonical(
    p_atoms jsonb,
    p_omitted_atom_count integer
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
IMMUTABLE
AS $$
DECLARE
    v_atom jsonb;
    v_parts text[] := ARRAY[]::text[];
BEGIN
    FOR v_atom IN SELECT value FROM jsonb_array_elements(p_atoms) LOOP
        v_parts := array_append(
            v_parts,
            '{"contentNodeId":'
            || CASE
                WHEN v_atom->'contentNodeId' = 'null'::jsonb THEN 'null'
                ELSE to_json(v_atom->>'contentNodeId')::text
            END
            || ',"role":' || to_json(v_atom->>'role')::text
            || ',"text":' || to_json(v_atom->>'text')::text
            || ',"truncated":' || lower((v_atom->>'truncated')::boolean::text)
            || '}'
        );
    END LOOP;
    RETURN '{"atoms":[' || array_to_string(v_parts, ',')
        || '],"omittedAtomCount":' || p_omitted_atom_count::text || '}';
END;
$$;

CREATE OR REPLACE FUNCTION private.project_platform_v2_bounded_report_atoms(
    p_user_id uuid,
    p_entry_id uuid,
    p_content_revision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
STABLE
AS $$
DECLARE
    v_current_revision text;
    v_total integer;
    v_included integer := 0;
    v_atoms jsonb := '[]'::jsonb;
    v_candidate_atoms jsonb;
    v_atom jsonb;
    v_text text;
    v_truncated boolean;
    v_source record;
BEGIN
    PERFORM public.read_platform_v2_presentation_identity(
        p_user_id,
        ARRAY[p_entry_id],
        false
    );
    v_current_revision := private.platform_v2_report_atom_revision(p_entry_id);
    IF p_content_revision IS DISTINCT FROM v_current_revision THEN
        RAISE EXCEPTION 'stale_report_content_revision';
    END IF;
    SELECT count(*)::integer INTO v_total
    FROM private.platform_v2_report_atom_source(p_entry_id);

    FOR v_source IN
        SELECT *
        FROM private.platform_v2_report_atom_source(p_entry_id)
        ORDER BY atom_order
    LOOP
        EXIT WHEN v_included >= 32;
        v_text := substring(normalize(v_source.source_text, NFC) FROM 1 FOR 1500);
        v_truncated := v_text IS DISTINCT FROM normalize(v_source.source_text, NFC);
        v_atom := jsonb_build_object(
            'role', v_source.role,
            'contentNodeId', v_source.content_node_id,
            'text', v_text,
            'truncated', v_truncated
        );
        v_candidate_atoms := v_atoms || jsonb_build_array(v_atom);
        EXIT WHEN octet_length(convert_to(
            private.platform_v2_report_card_content_canonical(
                v_candidate_atoms,
                v_total - (v_included + 1)
            ),
            'UTF8'
        )) > 49152;
        v_atoms := v_candidate_atoms;
        v_included := v_included + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'atoms', v_atoms,
        'omittedAtomCount', v_total - v_included
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.read_platform_v2_report_atom_attestation(
    p_user_id uuid,
    p_entry_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_role text := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
    );
    v_revision text;
BEGIN
    IF v_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    PERFORM public.read_platform_v2_presentation_identity(
        p_user_id,
        ARRAY[p_entry_id],
        false
    );
    v_revision := private.platform_v2_report_atom_revision(p_entry_id);
    RETURN jsonb_build_object(
        'contentRevision', v_revision,
        'cardContent', private.project_platform_v2_bounded_report_atoms(
            p_user_id,
            p_entry_id,
            v_revision
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_platform_v2_bounded_report_atoms_as_principal(
    p_user_id uuid,
    p_entry_id uuid,
    p_content_revision text,
    p_card_content jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_role text := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
    );
    v_expected jsonb;
BEGIN
    IF v_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    v_expected := private.project_platform_v2_bounded_report_atoms(
        p_user_id,
        p_entry_id,
        p_content_revision
    );
    IF p_card_content IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION 'report_atoms_mismatch';
    END IF;
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.platform_v2_text_at_diagnostic_locator(jsonb,text,text)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.platform_v2_diagnostic_locator_ordinals(text)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.reconcile_platform_v2_content_nodes_identity_v1(uuid,text,jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.reconcile_platform_v2_content_nodes(uuid,text,jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.platform_v2_report_atom_source(uuid)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.platform_v2_report_atom_revision(uuid)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.platform_v2_report_atom_revision_or_null(uuid)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.read_platform_v2_presentation_identity_report_base_v1(uuid,uuid[],boolean)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.platform_v2_report_card_content_canonical(jsonb,integer)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.project_platform_v2_bounded_report_atoms(uuid,uuid,text)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_platform_v2_report_atom_attestation(uuid,uuid)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_platform_v2_bounded_report_atoms_as_principal(uuid,uuid,text,jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_report_atom_attestation(uuid,uuid)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_platform_v2_bounded_report_atoms_as_principal(uuid,uuid,text,jsonb)
    TO service_role;
REVOKE ALL ON FUNCTION public.read_platform_v2_presentation_identity(uuid,uuid[],boolean)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_presentation_identity(uuid,uuid[],boolean)
    TO service_role;

COMMIT;
