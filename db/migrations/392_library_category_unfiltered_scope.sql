-- The authorized CTE already contains unique, active entry IDs. Only filtered
-- requests need to read entry attributes again for batch selection.
BEGIN;
CREATE OR REPLACE FUNCTION private.library_category_entry_ids_v1(p_user uuid,p_selection jsonb)
RETURNS TABLE(entry_id uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private','pg_temp' AS $$
  WITH dictionaries AS MATERIALIZED (
    SELECT d.id,d.kind,d.owner_user_id,
      CASE WHEN d.kind<>'user' THEN public.can_browse_dictionary(p_user,d.id) ELSE false END readable
    FROM public.dictionaries d
    WHERE private.training_material_entry_selected_v1(d.language_code,CASE WHEN d.kind='user' THEN NULL ELSE d.id END,p_selection)
      AND (p_selection->'dictionaryIds'='null'::jsonb OR (p_selection->'dictionaryIds') ? d.id::text)
  ), shared AS MATERIALIZED (
    SELECT DISTINCT entry_id FROM private.shared_author_entry_memberships_v1 WHERE user_id=p_user
  ), material AS MATERIALIZED (
    SELECT entry_id FROM private.readable_material_entry_ids_v1(p_user,p_selection->'material')
    WHERE p_selection ? 'material'
  ), authorized AS MATERIALIZED (
    SELECT e.id FROM private.active_word_entries e JOIN dictionaries d ON d.id=e.dictionary_id
    WHERE (d.readable OR (d.kind='user' AND (d.owner_user_id=p_user OR e.id IN (SELECT entry_id FROM shared))))
      AND (NOT (p_selection ? 'material') OR e.id IN (SELECT entry_id FROM material))
  ), selection AS MATERIALIZED (
    SELECT COALESCE(p_selection->'parts','[]'::jsonb)='[]'::jsonb
      AND p_selection->>'article' IS NULL
      AND (p_selection->'vocabulary' IS NULL OR p_selection->'vocabulary'='null'::jsonb
        OR private.valid_vocabulary_selection_v1(p_selection->'vocabulary'))
      AND NOT private.vocabulary_has_selection_v1(p_selection->'vocabulary') AS unfiltered
  )
  SELECT id FROM authorized WHERE (SELECT unfiltered FROM selection) IS TRUE
  UNION ALL
  SELECT chosen.entry_id FROM private.library_selected_entry_ids_v1(p_selection,
    ARRAY(SELECT id FROM authorized)) chosen
  WHERE (SELECT unfiltered FROM selection) IS NOT TRUE;
$$;

-- Each candidate arm joins its search document to selected_entries. That very
-- row also witnesses membership of its dictionary, including for form matches.
-- Keep the catalog visibility, principal and dictionary ID checks.
DO $migration$
DECLARE
  signature constant regprocedure :=
    'private.search_library_headwords_v1(uuid,boolean,text,text,uuid[],integer,text,jsonb)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  membership constant text := $old$ELSE p_user_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM dictionary_search_documents document
                JOIN selected_entries chosen ON chosen.entry_id=document.entry_id
                WHERE document.dictionary_id=d.id
            )$old$;
  candidate_join constant text := 'JOIN selected_entries chosen ON chosen.entry_id=s.entry_id';
BEGIN
  IF cardinality(string_to_array(definition, membership)) <> 2
     OR cardinality(string_to_array(definition, candidate_join)) <> 6 THEN
    RAISE EXCEPTION 'Unexpected headword search candidate or dictionary scope';
  END IF;
  -- Register the extension GUC before replaying the function's SET clauses.
  PERFORM public.similarity('a', 'a');
  EXECUTE replace(definition, membership, 'ELSE p_user_id IS NOT NULL');
END;
$migration$;
COMMIT;
