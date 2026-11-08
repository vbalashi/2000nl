-- Fresh-install foundation for live group sharing. This function does not grant
-- access; callers must establish an independently authorised group subscription.
BEGIN;

CREATE FUNCTION private.label_subtree_owned_collections_v1(p_owner uuid, p_label uuid)
RETURNS TABLE(collection_id uuid)
LANGUAGE sql STABLE
SET search_path = pg_catalog, public, private, pg_temp
AS $$
  WITH RECURSIVE subtree(id) AS (
    SELECT id FROM private.collection_labels
    WHERE user_id = p_owner AND id = p_label
    UNION
    SELECT child.id FROM private.collection_labels child
    JOIN subtree parent ON child.parent_id = parent.id
    WHERE child.user_id = p_owner
  )
  SELECT DISTINCT assignment.collection_id
  FROM subtree
  JOIN private.collection_label_assignments assignment
    ON assignment.user_id = p_owner AND assignment.label_id = subtree.id
  JOIN public.user_word_lists list
    ON list.id = assignment.collection_id AND list.user_id = p_owner;
$$;

REVOKE ALL ON FUNCTION private.label_subtree_owned_collections_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Publishing an owned collection cannot silently pass on a third party's
-- private entry. The existing independent-copy flow resolves these sources.
CREATE FUNCTION private.label_subtree_borrowed_entries_v1(p_owner uuid, p_label uuid)
RETURNS TABLE(collection_id uuid, entry_id uuid)
LANGUAGE sql STABLE
SET search_path = pg_catalog, public, private, pg_temp
AS $$
  SELECT DISTINCT scope.collection_id, item.word_id
  FROM private.label_subtree_owned_collections_v1(p_owner, p_label) scope
  JOIN public.user_word_list_items item ON item.list_id = scope.collection_id
  JOIN public.word_entries entry ON entry.id = item.word_id
  JOIN public.dictionaries dictionary ON dictionary.id = entry.dictionary_id
  WHERE dictionary.kind = 'user' AND dictionary.owner_user_id IS DISTINCT FROM p_owner;
$$;

REVOKE ALL ON FUNCTION private.label_subtree_borrowed_entries_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
