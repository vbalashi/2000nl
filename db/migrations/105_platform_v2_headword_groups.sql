-- Durable, opaque Headword Group identity for Platform V2.
--
-- Source-managed groups are backed by the versioned source binding ledger.
-- User-owned entries receive one private group at writer time. Lookup remains
-- read-only and never derives identity from spelling or result order.

BEGIN;

CREATE TABLE IF NOT EXISTS private.platform_v2_headword_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dictionary_id uuid NOT NULL
        REFERENCES public.dictionaries(id) ON DELETE CASCADE,
    management_kind text NOT NULL CHECK (
        management_kind IN ('source', 'user')
    ),
    owner_user_id uuid
        REFERENCES auth.users(id) ON DELETE CASCADE,
    identity_scheme_version text,
    source_group_key text,
    singleton_entry_id uuid
        REFERENCES public.word_entries(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (
            management_kind = 'source'
            AND owner_user_id IS NULL
            AND identity_scheme_version IS NOT NULL
            AND source_group_key IS NOT NULL
            AND singleton_entry_id IS NULL
        )
        OR (
            management_kind = 'user'
            AND owner_user_id IS NOT NULL
            AND identity_scheme_version IS NULL
            AND source_group_key IS NULL
            AND singleton_entry_id IS NOT NULL
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS
    platform_v2_headword_groups_source_identity_idx
ON private.platform_v2_headword_groups (
    dictionary_id,
    identity_scheme_version,
    source_group_key
)
WHERE management_kind = 'source';

CREATE UNIQUE INDEX IF NOT EXISTS
    platform_v2_headword_groups_user_entry_idx
ON private.platform_v2_headword_groups (singleton_entry_id)
WHERE management_kind = 'user';

CREATE OR REPLACE FUNCTION private.validate_platform_v2_headword_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_dictionary public.dictionaries%rowtype;
    v_entry public.word_entries%rowtype;
BEGIN
    SELECT *
    INTO v_dictionary
    FROM public.dictionaries
    WHERE id = NEW.dictionary_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'platform_v2_group_dictionary_not_found';
    END IF;

    IF NEW.management_kind = 'source' THEN
        IF v_dictionary.kind = 'user' THEN
            RAISE EXCEPTION 'platform_v2_group_management_mismatch';
        END IF;
        RETURN NEW;
    END IF;

    SELECT *
    INTO v_entry
    FROM public.word_entries
    WHERE id = NEW.singleton_entry_id;

    IF NOT FOUND
       OR v_entry.dictionary_id IS DISTINCT FROM NEW.dictionary_id
       OR v_entry.management_kind <> 'user'
       OR v_dictionary.kind <> 'user'
       OR v_dictionary.owner_user_id IS DISTINCT FROM NEW.owner_user_id THEN
        RAISE EXCEPTION 'platform_v2_group_entry_mismatch';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_platform_v2_headword_group
    ON private.platform_v2_headword_groups;
CREATE TRIGGER trg_validate_platform_v2_headword_group
BEFORE INSERT OR UPDATE
ON private.platform_v2_headword_groups
FOR EACH ROW
EXECUTE FUNCTION private.validate_platform_v2_headword_group();

CREATE OR REPLACE FUNCTION private.ensure_platform_v2_source_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
    IF NEW.binding_state = 'active' THEN
        INSERT INTO private.platform_v2_headword_groups (
            dictionary_id,
            management_kind,
            identity_scheme_version,
            source_group_key
        )
        VALUES (
            NEW.dictionary_id,
            'source',
            NEW.identity_scheme_version,
            NEW.source_group_key
        )
        ON CONFLICT (
            dictionary_id,
            identity_scheme_version,
            source_group_key
        ) WHERE management_kind = 'source'
        DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_platform_v2_source_group
    ON private.source_entry_bindings;
CREATE TRIGGER trg_ensure_platform_v2_source_group
AFTER INSERT OR UPDATE OF binding_state, source_group_key,
    identity_scheme_version
ON private.source_entry_bindings
FOR EACH ROW
EXECUTE FUNCTION private.ensure_platform_v2_source_group();

CREATE OR REPLACE FUNCTION private.ensure_platform_v2_user_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_owner_user_id uuid;
BEGIN
    IF NEW.management_kind <> 'user' THEN
        RETURN NEW;
    END IF;

    SELECT owner_user_id
    INTO v_owner_user_id
    FROM public.dictionaries
    WHERE id = NEW.dictionary_id;

    IF v_owner_user_id IS NULL THEN
        RAISE EXCEPTION 'platform_v2_user_group_owner_missing';
    END IF;

    INSERT INTO private.platform_v2_headword_groups (
        dictionary_id,
        management_kind,
        owner_user_id,
        singleton_entry_id
    )
    VALUES (
        NEW.dictionary_id,
        'user',
        v_owner_user_id,
        NEW.id
    )
    ON CONFLICT (singleton_entry_id)
        WHERE management_kind = 'user'
    DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_platform_v2_user_group
    ON public.word_entries;
CREATE TRIGGER trg_ensure_platform_v2_user_group
AFTER INSERT
ON public.word_entries
FOR EACH ROW
EXECUTE FUNCTION private.ensure_platform_v2_user_group();

INSERT INTO private.platform_v2_headword_groups (
    dictionary_id,
    management_kind,
    identity_scheme_version,
    source_group_key
)
SELECT DISTINCT
    binding.dictionary_id,
    'source',
    binding.identity_scheme_version,
    binding.source_group_key
FROM private.source_entry_bindings AS binding
WHERE binding.binding_state = 'active'
ON CONFLICT (
    dictionary_id,
    identity_scheme_version,
    source_group_key
) WHERE management_kind = 'source'
DO NOTHING;

INSERT INTO private.platform_v2_headword_groups (
    dictionary_id,
    management_kind,
    owner_user_id,
    singleton_entry_id
)
SELECT
    entry.dictionary_id,
    'user',
    dictionary.owner_user_id,
    entry.id
FROM public.word_entries AS entry
JOIN public.dictionaries AS dictionary
  ON dictionary.id = entry.dictionary_id
WHERE entry.management_kind = 'user'
  AND dictionary.owner_user_id IS NOT NULL
ON CONFLICT (singleton_entry_id)
    WHERE management_kind = 'user'
DO NOTHING;

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
        AND (
            (
                dictionary.kind = 'user'
                AND dictionary.owner_user_id = p_user_id
            )
            OR (
                dictionary.kind <> 'user'
                AND public.can_access_dictionary(
                    p_user_id,
                    dictionary.id,
                    'read'
                )
            )
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
                'contentNodeBindings', '[]'::jsonb
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

REVOKE ALL ON TABLE private.platform_v2_headword_groups FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
    public.read_platform_v2_presentation_identity(uuid, uuid[], boolean)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
    public.read_platform_v2_presentation_identity(uuid, uuid[], boolean)
TO service_role;

COMMIT;
