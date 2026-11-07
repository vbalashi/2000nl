BEGIN;
-- Resolve only explicitly selected article identities through the same authoritative
-- Library search and filter predicates. The cursor walk is bounded and fails closed.
CREATE OR REPLACE FUNCTION private.words_bulk_resolve_v1(p_user uuid, p_groups uuid[], p_query text,
 p_language text, p_dictionaries uuid[], p_filters jsonb, p_material jsonb, p_all boolean, p_category text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE cursor_value text := NULL; page jsonb; item jsonb; group_id uuid;
 found_groups uuid[] := ARRAY[]::uuid[]; excluded_found uuid[] := ARRAY[]::uuid[]; candidate_ids uuid[] := ARRAY[]::uuid[];
 result_ids uuid[]; page_ids uuid[]; identity_payload jsonb; iteration integer := 0; next_cursor text;
BEGIN
 IF p_user IS NULL OR p_user IS DISTINCT FROM (SELECT auth.uid()) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_all IS NULL OR p_groups IS NULL OR array_position(p_groups,NULL) IS NOT NULL
   OR (p_all AND cardinality(p_groups)>200) OR (NOT p_all AND cardinality(p_groups) NOT BETWEEN 1 AND 200)
   OR cardinality(p_groups)<>(SELECT count(DISTINCT x) FROM unnest(p_groups) x)
   OR p_language IS NULL OR p_language !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'
   OR length(COALESCE(p_query,''))>200 OR p_category NOT IN ('browse','headwords')
   OR (p_category='headwords' AND NULLIF(btrim(p_query),'') IS NULL) THEN RAISE EXCEPTION 'invalid_selection' USING ERRCODE='22023'; END IF;
 LOOP
  iteration:=iteration+1;
  IF iteration>100 THEN RAISE EXCEPTION 'selection_too_broad' USING ERRCODE='22023'; END IF;
  IF p_category='headwords' THEN
   page:=public.search_library_category_v1(p_user,p_query,p_language,p_dictionaries,p_filters,p_material,'headwords',100,cursor_value);
   IF page ? 'error' OR jsonb_typeof(page#>'{groups,0,items}') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'selection_unavailable' USING ERRCODE='22023'; END IF;
   SELECT COALESCE(array_agg((value#>>'{entry,id}')::uuid),ARRAY[]::uuid[]) INTO page_ids FROM jsonb_array_elements(page#>'{groups,0,items}');
   identity_payload:=public.read_platform_v2_presentation_identity(p_user,page_ids,false);
   IF jsonb_array_length(COALESCE(identity_payload->'entries','[]'::jsonb))<>cardinality(page_ids) THEN RAISE EXCEPTION 'selection_unavailable' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(identity_payload->'entries') LOOP
    group_id:=(item->>'headwordGroupId')::uuid;
    IF p_all AND group_id=ANY(p_groups) THEN excluded_found:=array_append(excluded_found,group_id); END IF;
    IF (p_all AND NOT group_id=ANY(p_groups)) OR (NOT p_all AND group_id=ANY(p_groups)) THEN
     found_groups:=array_append(found_groups,group_id);candidate_ids:=array_append(candidate_ids,(item->>'entryId')::uuid);
    END IF;
   END LOOP;
   next_cursor:=page#>>'{groups,0,page,nextCursor}';
  ELSE
   IF p_material IS NULL THEN
    page:=public.lookup_platform_v2_library_filtered_entries(p_user,COALESCE(p_query,''),p_language,p_dictionaries,cursor_value,25,100,p_filters);
   ELSE
    page:=public.lookup_platform_v2_library_material_entries(p_user,COALESCE(p_query,''),p_language,p_dictionaries,cursor_value,25,100,p_filters,p_material);
   END IF;
   IF page ? 'error' OR jsonb_typeof(page->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'selection_unavailable' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(page->'items') LOOP
    group_id := (item#>>'{platform_v2_identity,headwordGroupId}')::uuid;
    IF p_all AND group_id=ANY(p_groups) THEN excluded_found:=array_append(excluded_found,group_id); END IF;
    IF (p_all AND NOT group_id=ANY(p_groups)) OR (NOT p_all AND group_id=ANY(p_groups)) THEN
     found_groups:=array_append(found_groups,group_id);candidate_ids:=array_append(candidate_ids,(item->>'id')::uuid);
    END IF;
   END LOOP;
   next_cursor:=page#>>'{page,nextGroupCursor}';
  END IF;
  IF NOT p_all AND p_category='browse' AND (SELECT count(DISTINCT x) FROM unnest(found_groups) x)=cardinality(p_groups) THEN EXIT; END IF;
  IF cardinality(candidate_ids)>100000 OR (p_all AND (SELECT count(DISTINCT x) FROM unnest(found_groups) x)>2500) THEN RAISE EXCEPTION 'selection_too_broad' USING ERRCODE='22023'; END IF;
  IF next_cursor IS NULL THEN EXIT; END IF;
  IF next_cursor=cursor_value THEN RAISE EXCEPTION 'cursor_did_not_advance' USING ERRCODE='22023'; END IF;
  cursor_value:=next_cursor;
 END LOOP;
 IF (NOT p_all AND (SELECT count(DISTINCT x) FROM unnest(found_groups) x)<>cardinality(p_groups)) OR
    (p_all AND (SELECT count(DISTINCT x) FROM unnest(excluded_found) x)<>cardinality(p_groups)) THEN RAISE EXCEPTION 'selection_changed' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg(chosen.entry_id ORDER BY chosen.entry_id),ARRAY[]::uuid[]) INTO result_ids
 FROM private.library_selected_entry_ids_v1(p_filters,candidate_ids) chosen
 JOIN private.active_word_entries e ON e.id=chosen.entry_id
 WHERE NOT private.is_pointer_only_dictionary_entry_v1(e.raw)
   AND (p_material IS NULL OR chosen.entry_id IN (SELECT entry_id FROM private.readable_material_entry_ids_v1(p_user,p_material)));
 RETURN jsonb_build_object('entryIds',to_jsonb(result_ids),'articleCount',(SELECT count(DISTINCT x) FROM unnest(found_groups) x),'groupFingerprint',(SELECT md5(COALESCE(string_agg(DISTINCT x::text,',' ORDER BY x::text),'')) FROM unnest(found_groups) x));
END;
$$;
REVOKE ALL ON FUNCTION private.words_bulk_resolve_v1(uuid,uuid[],text,text,uuid[],jsonb,jsonb,boolean,text) FROM PUBLIC,anon,authenticated,service_role;

-- A separate, expiring plan stores the server-resolved operation and its audience.
-- The sharing authority helpers are installed by the sharing migrations. Until
-- they exist, preparation fails closed rather than bypassing shared audiences.
CREATE TABLE private.words_bulk_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 collection_id uuid NOT NULL, groups uuid[] NOT NULL, query text NOT NULL, language text NOT NULL,
 dictionaries uuid[], filters jsonb NOT NULL, material jsonb, select_all boolean NOT NULL, category text NOT NULL,
 entry_ids uuid[] NOT NULL, article_count integer NOT NULL, group_fingerprint text NOT NULL,
 source_scope jsonb NOT NULL, cohort uuid[] NOT NULL, audience jsonb NOT NULL, revision text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes', committed boolean NOT NULL DEFAULT false,
 added_count integer
);
ALTER TABLE private.words_bulk_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.words_bulk_plans FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.words_bulk_material_sources_v1(p_user uuid,p_material jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_material IS NULL OR (p_material->>'kind'='collection' AND p_material->>'collectionType'='curated') THEN RETURN '[]'::jsonb; END IF;
 IF to_regclass('private.received_collection_label_placements') IS NULL OR to_regclass('private.live_collection_access_paths_v1') IS NULL THEN
  RAISE EXCEPTION 'collection_audience_unavailable' USING ERRCODE='55000'; END IF;
 EXECUTE $q$
 WITH RECURSIVE labels AS (
  SELECT id FROM private.collection_labels WHERE user_id=$1 AND id=($2->>'id')::uuid AND $2->>'kind'='label'
  UNION SELECT child.id FROM private.collection_labels child JOIN labels parent ON child.parent_id=parent.id WHERE child.user_id=$1
 ), collections AS (
  SELECT list.id FROM public.user_word_lists list WHERE $2->>'kind'='collection' AND $2->>'collectionType'='user' AND list.id=($2->>'id')::uuid
  UNION SELECT assignment.collection_id FROM private.collection_label_assignments assignment JOIN labels ON labels.id=assignment.label_id WHERE assignment.user_id=$1
  UNION SELECT placement.collection_id FROM private.received_collection_label_placements placement JOIN labels ON labels.id=placement.label_id
   JOIN private.live_collection_access_paths_v1 path ON path.collection_id=placement.collection_id AND path.user_id=placement.user_id WHERE placement.user_id=$1
 ) SELECT COALESCE(jsonb_agg(jsonb_build_object('id',list.id,'owner',list.user_id) ORDER BY list.id),'[]'::jsonb)
 FROM collections JOIN public.user_word_lists list ON list.id=collections.id
 $q$ INTO result USING p_user,p_material;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION private.words_bulk_material_sources_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.words_bulk_cohort_v1(p_user uuid,p_sources jsonb,p_entries uuid[]) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT COALESCE(array_agg(DISTINCT author ORDER BY author),ARRAY[]::uuid[]) FROM (
  SELECT p_user author UNION SELECT (item->>'owner')::uuid FROM jsonb_array_elements(p_sources) item
  UNION SELECT dictionary.owner_user_id FROM private.active_word_entries entry
   JOIN public.dictionaries dictionary ON dictionary.id=entry.dictionary_id
   WHERE entry.id=ANY(p_entries) AND dictionary.kind='user' AND dictionary.owner_user_id IS NOT NULL
 ) authors WHERE author IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION private.words_bulk_cohort_v1(uuid,jsonb,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.prepare_words_bulk_collection_v1(p_groups uuid[],p_query text,p_language text,
 p_dictionaries uuid[],p_filters jsonb,p_material jsonb,p_list_id uuid,p_all boolean,p_category text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=(SELECT auth.uid()); resolved jsonb; again jsonb; ids uuid[]; sources jsonb; cohort uuid[]; author uuid;
 audience jsonb; revision text; plan_id uuid;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('private.collection_audience_recipients_v1(uuid,uuid)') IS NULL OR to_regprocedure('private.collection_composition_revision_v1(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'collection_audience_unavailable' USING ERRCODE='55000'; END IF;
 resolved:=private.words_bulk_resolve_v1(principal,p_groups,p_query,p_language,p_dictionaries,p_filters,p_material,p_all,p_category);
 SELECT COALESCE(array_agg(value::uuid ORDER BY value::uuid),ARRAY[]::uuid[]) INTO ids FROM jsonb_array_elements_text(resolved->'entryIds');
 sources:=private.words_bulk_material_sources_v1(principal,p_material);cohort:=private.words_bulk_cohort_v1(principal,sources,ids);
 FOREACH author IN ARRAY cohort LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended('collection-author-scope:'||author::text,0)) THEN RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
 END LOOP;
 PERFORM 1 FROM public.user_word_lists WHERE id=p_list_id AND user_id=principal FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.user_word_list_items WHERE list_id=p_list_id ORDER BY word_id FOR UPDATE NOWAIT;
 again:=private.words_bulk_resolve_v1(principal,p_groups,p_query,p_language,p_dictionaries,p_filters,p_material,p_all,p_category);
 IF again IS DISTINCT FROM resolved OR private.words_bulk_material_sources_v1(principal,p_material) IS DISTINCT FROM sources OR private.words_bulk_cohort_v1(principal,sources,ids) IS DISTINCT FROM cohort THEN
  RAISE EXCEPTION 'selection_changed' USING ERRCODE='40001'; END IF;
 EXECUTE 'SELECT private.collection_audience_recipients_v1($1,$2),private.collection_composition_revision_v1($1,$2)' INTO audience,revision USING principal,p_list_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('words-bulk-plans:'||principal::text,0));
 DELETE FROM private.words_bulk_plans WHERE user_id=principal AND expires_at<now();
 IF (SELECT count(*) FROM private.words_bulk_plans WHERE user_id=principal)>=100 THEN RAISE EXCEPTION 'collection_plan_limit' USING ERRCODE='22023'; END IF;
 INSERT INTO private.words_bulk_plans(user_id,collection_id,groups,query,language,dictionaries,filters,material,select_all,category,entry_ids,article_count,group_fingerprint,source_scope,cohort,audience,revision)
 VALUES(principal,p_list_id,p_groups,COALESCE(p_query,''),p_language,p_dictionaries,p_filters,p_material,p_all,p_category,ids,(resolved->>'articleCount')::integer,resolved->>'groupFingerprint',sources,cohort,audience,revision) RETURNING id INTO plan_id;
 RETURN jsonb_build_object('planId',plan_id,'collectionId',p_list_id,'articleCount',(resolved->>'articleCount')::integer,'meaningCount',cardinality(ids),'audience',audience);
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001';
END;
$$;

CREATE FUNCTION public.confirm_words_bulk_collection_v1(p_plan_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=(SELECT auth.uid()); plan private.words_bulk_plans%rowtype; author uuid; resolved jsonb; ids uuid[]; sources jsonb; revision text; entry_row record; locked integer:=0; added integer;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO plan FROM private.words_bulk_plans WHERE id=p_plan_id AND user_id=principal;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_plan_unavailable' USING ERRCODE='42501'; END IF;
 FOREACH author IN ARRAY plan.cohort LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended('collection-author-scope:'||author::text,0)) THEN RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
 END LOOP;
 SELECT * INTO plan FROM private.words_bulk_plans WHERE id=p_plan_id AND user_id=principal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_plan_unavailable' USING ERRCODE='42501'; END IF;
 IF plan.committed THEN RETURN jsonb_build_object('planId',plan.id,'collectionId',plan.collection_id,'status','committed','addedCount',plan.added_count); END IF;
 IF plan.expires_at<now() THEN RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM public.user_word_lists WHERE id=plan.collection_id AND user_id=principal FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.user_word_list_items WHERE list_id=plan.collection_id ORDER BY word_id FOR UPDATE NOWAIT;
 EXECUTE 'SELECT private.collection_composition_revision_v1($1,$2)' INTO revision USING principal,plan.collection_id;
 IF revision IS DISTINCT FROM plan.revision THEN RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
 sources:=private.words_bulk_material_sources_v1(principal,plan.material);
 resolved:=private.words_bulk_resolve_v1(principal,plan.groups,plan.query,plan.language,plan.dictionaries,plan.filters,plan.material,plan.select_all,plan.category);
 SELECT COALESCE(array_agg(value::uuid ORDER BY value::uuid),ARRAY[]::uuid[]) INTO ids FROM jsonb_array_elements_text(resolved->'entryIds');
 IF sources IS DISTINCT FROM plan.source_scope OR private.words_bulk_cohort_v1(principal,sources,ids) IS DISTINCT FROM plan.cohort
  OR ids IS DISTINCT FROM plan.entry_ids OR (resolved->>'articleCount')::integer IS DISTINCT FROM plan.article_count OR resolved->>'groupFingerprint' IS DISTINCT FROM plan.group_fingerprint THEN
  RAISE EXCEPTION 'selection_changed' USING ERRCODE='40001'; END IF;
 FOR entry_row IN SELECT e.id,e.dictionary_id FROM private.active_word_entries e WHERE e.id=ANY(ids) ORDER BY e.id FOR SHARE NOWAIT LOOP
  locked:=locked+1;
  IF entry_row.dictionary_id IS NOT NULL AND NOT public.can_access_dictionary(principal,entry_row.dictionary_id,'read') THEN RAISE EXCEPTION 'entry_not_accessible' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF locked<>cardinality(ids) THEN RAISE EXCEPTION 'selection_changed' USING ERRCODE='40001'; END IF;
 INSERT INTO public.user_word_list_items(list_id,word_id) SELECT plan.collection_id,selected FROM unnest(ids) selected ON CONFLICT(list_id,word_id) DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 UPDATE private.words_bulk_plans SET committed=true,added_count=added WHERE id=plan.id;
 RETURN jsonb_build_object('planId',plan.id,'collectionId',plan.collection_id,'status','committed','addedCount',added);
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001';
END;
$$;

CREATE FUNCTION public.read_words_bulk_collection_plan_v1(p_plan_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); plan private.words_bulk_plans%rowtype;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO plan FROM private.words_bulk_plans WHERE id=p_plan_id AND user_id=principal;
 IF NOT FOUND THEN RETURN jsonb_build_object('planId',p_plan_id,'status','unknown'); END IF;
 IF plan.committed THEN RETURN jsonb_build_object('planId',plan.id,'collectionId',plan.collection_id,'status','committed','addedCount',plan.added_count); END IF;
 RETURN jsonb_build_object('planId',plan.id,'collectionId',plan.collection_id,'status',CASE WHEN plan.expires_at<now() THEN 'expired' ELSE 'pending' END);
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_words_bulk_collection_v1(uuid[],text,text,uuid[],jsonb,jsonb,uuid,boolean,text),public.confirm_words_bulk_collection_v1(uuid),public.read_words_bulk_collection_plan_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_words_bulk_collection_v1(uuid[],text,text,uuid[],jsonb,jsonb,uuid,boolean,text),public.confirm_words_bulk_collection_v1(uuid),public.read_words_bulk_collection_plan_v1(uuid) TO authenticated;
COMMIT;
