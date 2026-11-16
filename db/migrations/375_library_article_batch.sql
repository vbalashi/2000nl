BEGIN;
-- Keep the existing selector/cursor/count contract; add canonical identities only
-- to already-authorized hits. This is not another search or a content read.
ALTER FUNCTION public.search_library_category_v1(uuid,text,text,uuid[],jsonb,jsonb,text,integer,text)
  RENAME TO search_library_category_pre375;
ALTER FUNCTION public.search_library_category_pre375(uuid,text,text,uuid[],jsonb,jsonb,text,integer,text) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.search_library_category_pre375(uuid,text,text,uuid[],jsonb,jsonb,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.search_library_category_v1(
 p_user_id uuid,p_query text,p_language_code text DEFAULT NULL,p_dictionary_ids uuid[] DEFAULT NULL,
 p_filters jsonb DEFAULT '{}'::jsonb,p_material jsonb DEFAULT NULL,p_group text DEFAULT 'headwords',
 p_limit integer DEFAULT 100,p_cursor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE payload jsonb; hits jsonb;
BEGIN
 payload:=private.search_library_category_pre375(p_user_id,p_query,p_language_code,p_dictionary_ids,p_filters,p_material,p_group,p_limit,p_cursor);
 IF payload ? 'error' OR p_group NOT IN ('headwords','alphabetical') THEN RETURN payload; END IF;
 SELECT coalesce(jsonb_agg(hit.value || jsonb_build_object('headwordGroupId',private.library_entry_group_id_v1((hit.value#>>'{entry,id}')::uuid)) ORDER BY hit.ordinality),'[]'::jsonb)
 INTO hits FROM jsonb_array_elements(payload#>'{groups,0,items}') WITH ORDINALITY hit(value,ordinality);
 RETURN jsonb_set(payload,'{groups,0,items}',hits);
END;
$$;
REVOKE ALL ON FUNCTION public.search_library_category_v1(uuid,text,text,uuid[],jsonb,jsonb,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.search_library_category_v1(uuid,text,text,uuid[],jsonb,jsonb,text,integer,text) TO service_role;

-- First-party server-only adapter. The principal is supplied by the authenticated
-- route, never by its JSON body. Every representative and sibling is checked with
-- the exact Library reader's current browse authority (including live shares).
CREATE FUNCTION public.read_platform_v2_library_groups(p_user_id uuid,p_entry_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE requested_count integer; accessible_count integer; group_count integer; max_group_size integer;
 payload jsonb; items jsonb;
BEGIN
 IF p_user_id IS NULL OR p_entry_ids IS NULL OR cardinality(p_entry_ids)<1 OR cardinality(p_entry_ids)>25
  OR array_position(p_entry_ids,NULL) IS NOT NULL THEN RETURN jsonb_build_object('error','invalid_article_batch'); END IF;
 WITH requested AS MATERIALIZED (
  SELECT id,min(ordinality) ord FROM unnest(p_entry_ids) WITH ORDINALITY r(id,ordinality) GROUP BY id
 ), authorized AS MATERIALIZED (
  SELECT r.*,private.library_entry_group_id_v1(e.id) group_id FROM requested r
  JOIN private.active_word_entries e ON e.id=r.id WHERE private.entry_access_v1(p_user_id,e.id,'browse')
 ), groups AS MATERIALIZED (
  SELECT group_id,min(ord) ord FROM authorized WHERE group_id IS NOT NULL GROUP BY group_id
 ), members AS MATERIALIZED (
  SELECT g.group_id,g.ord,e.*,d AS dictionary_record,b.sense_ordinal AS presentation_ordinal
  FROM groups g JOIN private.platform_v2_headword_groups hg ON hg.id=g.group_id AND hg.management_kind='source'
  JOIN private.source_entry_bindings b ON b.binding_state='active' AND b.dictionary_id=hg.dictionary_id
   AND b.identity_scheme_version=hg.identity_scheme_version AND b.source_group_key=hg.source_group_key
  JOIN private.active_word_entries e ON e.id=b.word_entry_id JOIN public.dictionaries d ON d.id=e.dictionary_id
  WHERE private.entry_access_v1(p_user_id,e.id,'browse')
  UNION ALL
  SELECT g.group_id,g.ord,e.*,d AS dictionary_record,e.meaning_id AS presentation_ordinal
  FROM groups g JOIN private.platform_v2_headword_groups hg ON hg.id=g.group_id AND hg.management_kind='user'
  JOIN private.active_word_entries e ON e.id=hg.singleton_entry_id JOIN public.dictionaries d ON d.id=e.dictionary_id
  WHERE private.entry_access_v1(p_user_id,e.id,'browse')
 ), sizes AS MATERIALIZED (SELECT group_id,count(*) n FROM members GROUP BY group_id)
 SELECT (SELECT count(*) FROM requested),(SELECT count(*) FROM authorized),
  (SELECT count(*) FROM authorized WHERE group_id IS NOT NULL),(SELECT max(n) FROM sizes),
  (SELECT coalesce(jsonb_agg(
    private.entry_payload_for_reader_v1(p_user_id,to_jsonb(m)-'group_id'-'ord')-'dictionary_record'-'presentation_ordinal'
     ||jsonb_build_object('dictionary',private.dictionary_metadata_for_entry_read_v1(p_user_id,m.dictionary_record))
    ORDER BY m.ord,m.presentation_ordinal,m.id),'[]'::jsonb)
   FROM members m WHERE NOT EXISTS(SELECT 1 FROM sizes WHERE n>50))
 INTO requested_count,accessible_count,group_count,max_group_size,items;
 IF accessible_count<>requested_count THEN RETURN jsonb_build_object('error','entry_not_accessible'); END IF;
 IF group_count<>requested_count OR max_group_size IS NULL THEN RETURN jsonb_build_object('error','presentation_identity_incomplete'); END IF;
 IF max_group_size>50 THEN RETURN jsonb_build_object('error','group-too-large'); END IF;
 IF octet_length(items::text)>2097152 THEN RETURN jsonb_build_object('error','article_batch_too_large'); END IF;
 payload:=private.attach_platform_v2_presentation_identity_v1(jsonb_build_object('items',items,
  'page',jsonb_build_object('selectedTierComplete',true,'nextGroupCursor',NULL)),p_user_id,false);
 IF octet_length(payload::text)>4194304 THEN RETURN jsonb_build_object('error','article_batch_too_large'); END IF;
 RETURN payload;
END;
$$;
REVOKE ALL ON FUNCTION public.read_platform_v2_library_groups(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_library_groups(uuid,uuid[]) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
