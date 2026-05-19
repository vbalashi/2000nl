-- Training intent metadata for curated and user lists.
-- Lists still contain dictionary entries; these fields describe how a list
-- prefers or restricts card/scenario selection when used for training.

ALTER TABLE word_lists
    ADD COLUMN IF NOT EXISTS default_scenario_id text REFERENCES training_scenarios(id),
    ADD COLUMN IF NOT EXISTS card_policy text NOT NULL DEFAULT 'inherit',
    ADD COLUMN IF NOT EXISTS card_type_ids text[];

ALTER TABLE user_word_lists
    ADD COLUMN IF NOT EXISTS default_scenario_id text REFERENCES training_scenarios(id),
    ADD COLUMN IF NOT EXISTS card_policy text NOT NULL DEFAULT 'inherit',
    ADD COLUMN IF NOT EXISTS card_type_ids text[];

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'word_lists_card_policy_check'
    ) THEN
        ALTER TABLE word_lists
            ADD CONSTRAINT word_lists_card_policy_check
            CHECK (card_policy IN ('inherit', 'prefer', 'restrict'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_word_lists_card_policy_check'
    ) THEN
        ALTER TABLE user_word_lists
            ADD CONSTRAINT user_word_lists_card_policy_check
            CHECK (card_policy IN ('inherit', 'prefer', 'restrict'));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION private.normalize_list_card_policy(
    p_card_policy text,
    p_existing text DEFAULT 'inherit'
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN NULLIF(trim(COALESCE(p_card_policy, '')), '') IS NULL
            THEN COALESCE(p_existing, 'inherit')
        WHEN trim(p_card_policy) IN ('inherit', 'prefer', 'restrict')
            THEN trim(p_card_policy)
        ELSE 'invalid'
    END;
$$;

CREATE OR REPLACE FUNCTION private.validate_list_training_intent(
    p_default_scenario_id text,
    p_card_policy text,
    p_card_type_ids text[]
)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF p_card_policy NOT IN ('inherit', 'prefer', 'restrict') THEN
        RAISE EXCEPTION 'invalid_card_policy';
    END IF;

    IF p_default_scenario_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM training_scenarios
           WHERE id = p_default_scenario_id
       ) THEN
        RAISE EXCEPTION 'scenario_not_found';
    END IF;

    IF p_card_type_ids IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM unnest(p_card_type_ids) AS card_type_id
           WHERE NULLIF(trim(card_type_id), '') IS NULL
       ) THEN
        RAISE EXCEPTION 'invalid_card_type_ids';
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS create_user_word_list(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION create_user_word_list(
    p_user_id uuid,
    p_name text,
    p_description text DEFAULT NULL,
    p_language_code text DEFAULT 'nl',
    p_primary_language_code text DEFAULT NULL,
    p_default_scenario_id text DEFAULT NULL,
    p_card_policy text DEFAULT 'inherit',
    p_card_type_ids text[] DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_list user_word_lists%ROWTYPE;
    v_name text;
    v_language_code text;
    v_primary_language_code text;
    v_default_scenario_id text;
    v_card_policy text;
    v_card_type_ids text[];
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    v_name := NULLIF(trim(p_name), '');
    IF v_name IS NULL THEN
        RAISE EXCEPTION 'invalid_list_name';
    END IF;

    v_language_code := NULLIF(trim(COALESCE(p_language_code, 'nl')), '');
    v_primary_language_code := NULLIF(
        trim(COALESCE(p_primary_language_code, v_language_code)),
        ''
    );
    v_default_scenario_id := NULLIF(trim(COALESCE(p_default_scenario_id, '')), '');
    v_card_policy := private.normalize_list_card_policy(p_card_policy, 'inherit');
    v_card_type_ids := CASE
        WHEN p_card_type_ids IS NULL THEN NULL
        ELSE ARRAY(
            SELECT DISTINCT trim(card_type_id)
            FROM unnest(p_card_type_ids) AS card_type_id
            WHERE NULLIF(trim(card_type_id), '') IS NOT NULL
            ORDER BY trim(card_type_id)
        )
    END;
    IF v_card_type_ids IS NOT NULL AND array_length(v_card_type_ids, 1) IS NULL THEN
        v_card_type_ids := NULL;
    END IF;

    IF v_language_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    IF v_primary_language_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM languages WHERE code = v_primary_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    PERFORM private.validate_list_training_intent(
        v_default_scenario_id,
        v_card_policy,
        v_card_type_ids
    );

    INSERT INTO user_word_lists (
        user_id,
        name,
        description,
        language_code,
        primary_language_code,
        default_scenario_id,
        card_policy,
        card_type_ids
    )
    VALUES (
        p_user_id,
        v_name,
        NULLIF(p_description, ''),
        v_language_code,
        v_primary_language_code,
        v_default_scenario_id,
        v_card_policy,
        v_card_type_ids
    )
    RETURNING * INTO v_list;

    RETURN jsonb_build_object(
        'id', v_list.id,
        'name', v_list.name,
        'description', v_list.description,
        'language_code', v_list.language_code,
        'primary_language_code', v_list.primary_language_code,
        'default_scenario_id', v_list.default_scenario_id,
        'card_policy', v_list.card_policy,
        'card_type_ids', v_list.card_type_ids,
        'created_at', v_list.created_at,
        'user_word_list_items', jsonb_build_array(jsonb_build_object('count', 0))
    );
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'duplicate_user_list';
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp;

DROP FUNCTION IF EXISTS update_user_word_list(uuid, uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION update_user_word_list(
    p_user_id uuid,
    p_list_id uuid,
    p_name text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_language_code text DEFAULT NULL,
    p_primary_language_code text DEFAULT NULL,
    p_default_scenario_id text DEFAULT NULL,
    p_card_policy text DEFAULT NULL,
    p_card_type_ids text[] DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_existing user_word_lists%ROWTYPE;
    v_list user_word_lists%ROWTYPE;
    v_name text;
    v_language_code text;
    v_primary_language_code text;
    v_default_scenario_id text;
    v_card_policy text;
    v_card_type_ids text[];
    v_item_count int;
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT * INTO v_existing
    FROM user_word_lists
    WHERE id = p_list_id
      AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'list_not_found';
    END IF;

    v_name := COALESCE(NULLIF(trim(p_name), ''), v_existing.name);
    IF v_name IS NULL THEN
        RAISE EXCEPTION 'invalid_list_name';
    END IF;

    v_language_code := COALESCE(
        NULLIF(trim(p_language_code), ''),
        v_existing.language_code
    );
    v_primary_language_code := COALESCE(
        NULLIF(trim(p_primary_language_code), ''),
        v_existing.primary_language_code,
        v_language_code
    );
    v_default_scenario_id := COALESCE(
        NULLIF(trim(p_default_scenario_id), ''),
        v_existing.default_scenario_id
    );
    v_card_policy := private.normalize_list_card_policy(
        p_card_policy,
        v_existing.card_policy
    );
    v_card_type_ids := CASE
        WHEN p_card_type_ids IS NULL THEN v_existing.card_type_ids
        ELSE ARRAY(
            SELECT DISTINCT trim(card_type_id)
            FROM unnest(p_card_type_ids) AS card_type_id
            WHERE NULLIF(trim(card_type_id), '') IS NOT NULL
            ORDER BY trim(card_type_id)
        )
    END;
    IF v_card_type_ids IS NOT NULL AND array_length(v_card_type_ids, 1) IS NULL THEN
        v_card_type_ids := NULL;
    END IF;

    IF v_language_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    IF v_primary_language_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM languages WHERE code = v_primary_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    PERFORM private.validate_list_training_intent(
        v_default_scenario_id,
        v_card_policy,
        v_card_type_ids
    );

    UPDATE user_word_lists
    SET name = v_name,
        description = CASE
            WHEN p_description IS NULL THEN description
            ELSE NULLIF(p_description, '')
        END,
        language_code = v_language_code,
        primary_language_code = v_primary_language_code,
        default_scenario_id = v_default_scenario_id,
        card_policy = v_card_policy,
        card_type_ids = v_card_type_ids,
        updated_at = now()
    WHERE id = p_list_id
      AND user_id = p_user_id
    RETURNING * INTO v_list;

    SELECT COUNT(*) INTO v_item_count
    FROM user_word_list_items
    WHERE list_id = v_list.id;

    RETURN jsonb_build_object(
        'id', v_list.id,
        'name', v_list.name,
        'description', v_list.description,
        'language_code', v_list.language_code,
        'primary_language_code', v_list.primary_language_code,
        'default_scenario_id', v_list.default_scenario_id,
        'card_policy', v_list.card_policy,
        'card_type_ids', v_list.card_type_ids,
        'created_at', v_list.created_at,
        'user_word_list_items', jsonb_build_array(jsonb_build_object('count', v_item_count))
    );
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'duplicate_user_list';
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp;

CREATE OR REPLACE FUNCTION get_word_list_summary(
    p_user_id uuid,
    p_list_id uuid,
    p_list_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF p_list_type = 'user' THEN
        SELECT jsonb_build_object(
            'id', l.id,
            'name', l.name,
            'description', l.description,
            'language_code', l.language_code,
            'primary_language_code', l.primary_language_code,
            'default_scenario_id', l.default_scenario_id,
            'card_policy', l.card_policy,
            'card_type_ids', l.card_type_ids,
            'created_at', l.created_at,
            'user_word_list_items', jsonb_build_array(jsonb_build_object(
                'count', (
                    SELECT COUNT(*)::int
                    FROM user_word_list_items item
                    WHERE item.list_id = l.id
                )
            ))
        )
        INTO v_result
        FROM user_word_lists l
        WHERE l.id = p_list_id
          AND l.user_id = p_user_id;

        RETURN v_result;
    END IF;

    SELECT jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'description', l.description,
        'language_code', l.language_code,
        'primary_language_code', l.primary_language_code,
        'default_scenario_id', l.default_scenario_id,
        'card_policy', l.card_policy,
        'card_type_ids', l.card_type_ids,
        'is_primary', l.is_primary,
        'word_list_items', jsonb_build_array(jsonb_build_object(
            'count', (
                SELECT COUNT(*)::int
                FROM word_list_items item
                WHERE item.list_id = l.id
            )
        ))
    )
    INTO v_result
    FROM word_lists l
    WHERE l.id = p_list_id;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION get_available_word_lists(
    p_user_id uuid,
    p_language_code text DEFAULT NULL,
    p_list_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    WITH curated AS (
        SELECT jsonb_build_object(
            'id', l.id,
            'list_type', 'curated',
            'name', l.name,
            'description', l.description,
            'language_code', l.language_code,
            'primary_language_code', l.primary_language_code,
            'default_scenario_id', l.default_scenario_id,
            'card_policy', l.card_policy,
            'card_type_ids', l.card_type_ids,
            'is_primary', l.is_primary,
            'sort_order', l.sort_order,
            'word_list_items', jsonb_build_array(jsonb_build_object(
                'count', (
                    SELECT COUNT(*)::int
                    FROM word_list_items item
                    WHERE item.list_id = l.id
                )
            ))
        ) AS row,
        COALESCE(l.sort_order, 2147483647) AS sort_order,
        l.is_primary,
        l.name,
        NULL::timestamptz AS created_at
        FROM word_lists l
        WHERE (p_list_type IS NULL OR p_list_type = 'curated')
          AND (p_language_code IS NULL OR l.language_code = p_language_code)
    ),
    user_lists AS (
        SELECT jsonb_build_object(
            'id', l.id,
            'list_type', 'user',
            'name', l.name,
            'description', l.description,
            'language_code', l.language_code,
            'primary_language_code', l.primary_language_code,
            'default_scenario_id', l.default_scenario_id,
            'card_policy', l.card_policy,
            'card_type_ids', l.card_type_ids,
            'created_at', l.created_at,
            'user_word_list_items', jsonb_build_array(jsonb_build_object(
                'count', (
                    SELECT COUNT(*)::int
                    FROM user_word_list_items item
                    WHERE item.list_id = l.id
                )
            ))
        ) AS row,
        2147483647 AS sort_order,
        false AS is_primary,
        l.name,
        l.created_at
        FROM user_word_lists l
        WHERE (p_list_type IS NULL OR p_list_type = 'user')
          AND l.user_id = p_user_id
    ),
    combined AS (
        SELECT row, 0 AS group_order, sort_order, is_primary, name, created_at
        FROM curated
        UNION ALL
        SELECT row, 1 AS group_order, sort_order, is_primary, name, created_at
        FROM user_lists
    )
    SELECT COALESCE(
        jsonb_agg(row ORDER BY group_order, sort_order, is_primary DESC, name ASC, created_at DESC),
        '[]'::jsonb
    )
    INTO v_result
    FROM combined;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_user_word_list(uuid, text, text, text, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_word_list(uuid, uuid, text, text, text, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_word_list_summary(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_word_lists(uuid, text, text) TO authenticated;
