-- Return presentation identity in the same internal RPC payload as Platform V2
-- lookup. This removes a second PostgREST round trip from every non-empty
-- Library and Training lookup while preserving the existing public RPC names.

BEGIN;

DO $$
BEGIN
    IF to_regprocedure(
        'public.lookup_platform_v2_entries_base_v1(uuid,boolean,text,text,text,integer,integer)'
    ) IS NULL THEN
        ALTER FUNCTION public.lookup_platform_v2_entries(
            uuid,
            boolean,
            text,
            text,
            text,
            integer,
            integer
        ) RENAME TO lookup_platform_v2_entries_base_v1;
    END IF;

    IF to_regprocedure(
        'public.read_platform_v2_training_group_base_v1(uuid,uuid,integer)'
    ) IS NULL THEN
        ALTER FUNCTION public.read_platform_v2_training_group(
            uuid,
            uuid,
            integer
        ) RENAME TO read_platform_v2_training_group_base_v1;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.attach_platform_v2_presentation_identity_v1(
    p_payload jsonb,
    p_user_id uuid,
    p_catalog boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_entry_ids uuid[];
    v_identity_payload jsonb;
    v_enriched_items jsonb;
    v_item_count integer;
    v_identity_count integer;
BEGIN
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_payload->'items') = 0 THEN
        RETURN p_payload;
    END IF;

    SELECT
        array_agg((item.value->>'id')::uuid ORDER BY item.ordinality),
        count(*)::integer
    INTO v_entry_ids, v_item_count
    FROM jsonb_array_elements(p_payload->'items') WITH ORDINALITY
        AS item(value, ordinality);

    v_identity_payload := public.read_platform_v2_presentation_identity(
        p_user_id,
        v_entry_ids,
        p_catalog
    );

    WITH identity_rows AS MATERIALIZED (
        SELECT identity.value
        FROM jsonb_array_elements(
            COALESCE(v_identity_payload->'entries', '[]'::jsonb)
        ) AS identity(value)
    ),
    enriched AS (
        SELECT
            item.ordinality,
            item.value || jsonb_build_object(
                'platform_v2_identity',
                identity.value
            ) AS value
        FROM jsonb_array_elements(p_payload->'items') WITH ORDINALITY
            AS item(value, ordinality)
        JOIN identity_rows AS identity
          ON identity.value->>'entryId' = item.value->>'id'
    )
    SELECT
        count(*)::integer,
        jsonb_agg(value ORDER BY ordinality)
    INTO v_identity_count, v_enriched_items
    FROM enriched;

    IF v_identity_count <> v_item_count THEN
        RETURN jsonb_build_object(
            'error',
            'presentation_identity_incomplete'
        );
    END IF;

    RETURN jsonb_set(p_payload, '{items}', v_enriched_items, false);
END;
$$;

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
    v_payload jsonb;
BEGIN
    v_payload := public.lookup_platform_v2_entries_base_v1(
        p_user_id,
        p_catalog,
        p_query,
        p_language_code,
        p_cursor,
        p_group_limit,
        p_group_entry_bound
    );

    RETURN private.attach_platform_v2_presentation_identity_v1(
        v_payload,
        p_user_id,
        p_catalog
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.read_platform_v2_training_group(
    p_user_id uuid,
    p_entry_id uuid,
    p_group_entry_bound integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_payload jsonb;
BEGIN
    v_payload := public.read_platform_v2_training_group_base_v1(
        p_user_id,
        p_entry_id,
        p_group_entry_bound
    );

    RETURN private.attach_platform_v2_presentation_identity_v1(
        v_payload,
        p_user_id,
        false
    );
END;
$$;

REVOKE ALL ON FUNCTION private.attach_platform_v2_presentation_identity_v1(
    jsonb,
    uuid,
    boolean
) FROM PUBLIC, anon, authenticated;

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

REVOKE EXECUTE ON FUNCTION public.read_platform_v2_training_group(
    uuid,
    uuid,
    integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_training_group(
    uuid,
    uuid,
    integer
) TO service_role;

COMMIT;
