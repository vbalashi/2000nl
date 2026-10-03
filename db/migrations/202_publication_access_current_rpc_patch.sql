-- Make the current Platform V2 authenticated path use the canonical access
-- helper. Public catalog paths intentionally remain general-public only.
BEGIN;

DO $patch$
DECLARE
  signature text := 'private.lookup_platform_v2_entries_base_v1(uuid,boolean,text,text,text,integer,integer)';
  definition text;
  eligible_start text := 'eligible_dictionaries AS MATERIALIZED (';
  next_cte text := 'indexed_headword_matches AS MATERIALIZED (';
BEGIN
  IF to_regprocedure(signature) IS NULL THEN
    RAISE NOTICE 'Platform V2 base function not installed; skipping publication patch';
    RETURN;
  END IF;
  definition := pg_get_functiondef(signature::regprocedure);
  IF strpos(definition, eligible_start) = 0 OR strpos(definition, next_cte) = 0 THEN
    RAISE EXCEPTION 'Platform V2 eligible-dictionary CTE anchors missing';
  END IF;
  IF strpos(definition, 'can_browse_dictionary(p_user_id, dictionary.id)') > 0 THEN
    RAISE NOTICE 'Platform V2 browse policy already installed; skipping';
    RETURN;
  END IF;
  definition := overlay(
    definition placing
    $$eligible_dictionaries AS MATERIALIZED (
        SELECT
            dictionary.*,
            CASE
                WHEN NOT p_catalog AND dictionary.kind = 'user'
                     AND dictionary.owner_user_id = p_user_id THEN 0
                WHEN dictionary.kind = 'curated' THEN 1
                ELSE 2
            END AS dictionary_rank
        FROM public.dictionaries AS dictionary
        WHERE (p_catalog
               AND dictionary.visibility IN ('system', 'public')
               AND dictionary.kind <> 'user')
           OR (NOT p_catalog
               AND public.can_browse_dictionary(p_user_id, dictionary.id))
    ),
    indexed_headword_matches AS MATERIALIZED ($$
    from strpos(definition, eligible_start)
    for strpos(definition, next_cte) + length(next_cte) - strpos(definition, eligible_start)
  );
  EXECUTE definition;
END;
$patch$;

-- Change publication and, when supplied, its audience in one transaction.
CREATE OR REPLACE FUNCTION public.set_dictionary_publication(
  p_dictionary_id uuid,
  p_publication_state text,
  p_group_keys text[] DEFAULT NULL,
  p_user_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dictionary public.dictionaries%rowtype;
  v_audience jsonb;
BEGIN
  IF p_publication_state IS NULL OR p_publication_state NOT IN ('unpublished', 'restricted', 'general') THEN
    RAISE EXCEPTION 'invalid_publication_state';
  END IF;
  IF (p_group_keys IS NULL) IS DISTINCT FROM (p_user_ids IS NULL) THEN
    RAISE EXCEPTION 'incomplete_dictionary_audience';
  END IF;
  SELECT * INTO v_dictionary FROM public.dictionaries WHERE id = p_dictionary_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.dictionaries
     SET publication_state = p_publication_state, updated_at = now()
   WHERE id = p_dictionary_id;

  IF p_group_keys IS NOT NULL THEN
    v_audience := public.replace_dictionary_audience(p_dictionary_id, p_group_keys, p_user_ids);
  END IF;
  RETURN jsonb_build_object(
    'dictionaryId', p_dictionary_id,
    'publicationState', p_publication_state,
    'audience', v_audience
  );
END;
$$;
REVOKE ALL ON FUNCTION public.set_dictionary_publication(uuid, text, text[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_dictionary_publication(uuid, text, text[], uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.replace_dictionary_access_group(
  p_key text,
  p_name text,
  p_member_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text := lower(btrim(COALESCE(p_key, '')));
  v_name text := btrim(COALESCE(p_name, ''));
  v_group_id uuid;
  v_members uuid[] := ARRAY(
    SELECT DISTINCT user_id
    FROM unnest(COALESCE(p_member_ids, ARRAY[]::uuid[])) AS requested(user_id)
    ORDER BY user_id
  );
BEGIN
  IF v_key = '' OR length(v_key) > 64 OR v_name = '' OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_dictionary_access_group';
  END IF;
  INSERT INTO public.dictionary_access_groups(key, name, updated_at)
    VALUES (v_key, v_name, now())
    ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
    RETURNING id INTO v_group_id;

  DELETE FROM public.dictionary_access_group_members WHERE group_id = v_group_id;
  INSERT INTO public.dictionary_access_group_members(group_id, user_id)
    SELECT v_group_id, user_id FROM unnest(v_members) AS requested(user_id);
  RETURN jsonb_build_object('id', v_group_id, 'key', v_key, 'name', v_name, 'memberIds', v_members);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_dictionary_access_group(text, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_dictionary_access_group(text, text, uuid[]) TO service_role;

COMMIT;
