BEGIN;
-- Source ownership is an authority-backed query dimension, applied before
-- paging. Shared publication of an own collection never makes it received.
CREATE OR REPLACE FUNCTION public.read_personal_collection_catalog_v2(p_query text DEFAULT ''::text, p_sort text DEFAULT 'recent'::text, p_scope text DEFAULT 'all'::text, p_label_id uuid DEFAULT NULL::uuid, p_language_code text DEFAULT NULL::text, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 50, p_ownership text DEFAULT 'all'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $_$
DECLARE principal uuid:=(select auth.uid()); query text:=btrim(p_query); language text:=NULLIF(btrim(p_language_code),'');
 fingerprint text;after_id uuid;after_key text;after_time timestamptz;after_count bigint;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_ownership IS NULL OR p_ownership NOT IN('all','owned','received') THEN RAISE EXCEPTION 'invalid_catalog_request' USING ERRCODE='22023'; END IF;
 IF query IS NULL OR length(query)>100 OR p_sort IS NULL OR p_sort NOT IN('name','recent','count')
  OR p_scope IS NULL OR p_scope NOT IN('all','unlabelled','label') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
  OR (p_scope='label') IS DISTINCT FROM (p_label_id IS NOT NULL) OR length(language)>16 THEN
  RAISE EXCEPTION 'invalid_catalog_request' USING ERRCODE='22023';
 END IF;
 IF p_scope='label' AND NOT EXISTS(SELECT 1 FROM private.collection_labels WHERE user_id=principal AND id=p_label_id) THEN
  RAISE EXCEPTION 'label_not_found' USING ERRCODE='22023';
 END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array('ownership-v2',principal,query,p_sort,p_scope,p_label_id,language,p_ownership)::text,'UTF8')),'hex');
 IF p_cursor IS NOT NULL THEN
  IF jsonb_typeof(p_cursor) IS DISTINCT FROM 'object' OR p_cursor-ARRAY['id','key','scope']<>'{}'::jsonb
   OR jsonb_typeof(p_cursor->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_cursor->'key') IS DISTINCT FROM 'string'
   OR p_cursor->>'scope' IS DISTINCT FROM fingerprint OR length(p_cursor->>'key')>1000 THEN
   RAISE EXCEPTION 'invalid_catalog_cursor' USING ERRCODE='22023';
  END IF;
  BEGIN
   after_id:=(p_cursor->>'id')::uuid;after_key:=p_cursor->>'key';
   IF p_sort='recent' THEN
    IF after_key !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$' THEN RAISE EXCEPTION 'invalid_catalog_cursor'; END IF;
    after_time:=after_key::timestamptz;
   ELSIF p_sort='count' THEN
    IF after_key !~ '^(0|[1-9][0-9]{0,18})$' THEN RAISE EXCEPTION 'invalid_catalog_cursor'; END IF;
    after_count:=after_key::bigint;
   END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_catalog_cursor' USING ERRCODE='22023'; END;
 END IF;
 RETURN (
  WITH RECURSIVE labels AS (
   SELECT id FROM private.collection_labels WHERE user_id=principal AND p_scope='label' AND id=p_label_id
   UNION SELECT child.id FROM private.collection_labels child JOIN labels ON child.parent_id=labels.id WHERE child.user_id=principal
  ), placements AS MATERIALIZED (
   SELECT collection_id,label_id FROM private.collection_label_assignments WHERE user_id=principal
   UNION ALL SELECT collection_id,label_id FROM private.received_collection_label_placements WHERE user_id=principal
  ), received_paths AS MATERIALIZED (
   SELECT path.collection_id,path.owner_user_id,max(COALESCE(direct.accepted_at,group_subscription.accepted_at)) AS accepted_at
   FROM private.collection_access_paths_for_user_v1(principal) path
   LEFT JOIN private.collection_sharing_subscriptions direct ON path.root_kind='collection' AND direct.user_id=principal AND direct.root_id=path.root_id
   LEFT JOIN private.label_sharing_subscriptions group_subscription ON path.root_kind='label' AND group_subscription.user_id=principal AND group_subscription.root_id=path.root_id
   WHERE path.owner_user_id<>principal AND p_ownership IN('all','received')
   GROUP BY path.collection_id,path.owner_user_id
  ), resources AS MATERIALIZED (
   SELECT list.id,list.name,list.created_at,list.user_id AS owner_id,list.language_code,list.primary_language_code,
    list.created_at AS sort_time,'owned'::text AS ownership,(COALESCE(root.is_open,false) OR EXISTS(SELECT 1 FROM private.label_sharing_roots label_root CROSS JOIN LATERAL private.label_subtree_owned_collections_v1(principal,label_root.label_id) scope WHERE label_root.owner_user_id=principal AND label_root.is_open AND scope.collection_id=list.id)) AS is_shared
   FROM public.user_word_lists list LEFT JOIN private.collection_sharing_roots root ON root.collection_id=list.id
   WHERE list.user_id=principal AND p_ownership IN('all','owned')
   UNION ALL
   SELECT list.id,list.name,list.created_at,scope.owner_user_id,list.language_code,list.primary_language_code,
    scope.accepted_at,'received',true
   FROM received_paths scope JOIN public.user_word_lists list ON list.id=scope.collection_id AND list.user_id=scope.owner_user_id
  ), language_members AS MATERIALIZED (
   SELECT resource.id AS collection_id,entry.id,entry.dictionary_id,entry.language_code
   FROM resources resource JOIN public.user_word_list_items item ON item.list_id=resource.id
   JOIN private.active_word_entries entry ON entry.id=item.word_id
   WHERE language IS NOT NULL AND COALESCE(resource.primary_language_code,resource.language_code) IS DISTINCT FROM language
    AND strpos(lower(resource.name),lower(query))>0
  ), language_dictionaries AS MATERIALIZED (
   SELECT dictionary.id,dictionary.kind,dictionary.owner_user_id,
    CASE WHEN dictionary.kind<>'user' THEN public.can_browse_dictionary(principal,dictionary.id) ELSE false END AS readable
   FROM (SELECT DISTINCT dictionary_id FROM language_members) selected JOIN public.dictionaries dictionary ON dictionary.id=selected.dictionary_id
  ), language_shared AS MATERIALIZED (
   SELECT DISTINCT granted.entry_id FROM private.shared_author_entry_memberships_v1 granted
   WHERE granted.user_id=principal AND granted.entry_id IN(SELECT id FROM language_members)
  ), mixed_language AS MATERIALIZED (
   SELECT member.collection_id FROM language_members member LEFT JOIN language_dictionaries dictionary ON dictionary.id=member.dictionary_id
   WHERE member.dictionary_id IS NULL OR dictionary.readable OR
    (dictionary.kind='user' AND (dictionary.owner_user_id=principal OR member.id IN(SELECT entry_id FROM language_shared)))
   GROUP BY member.collection_id HAVING count(DISTINCT member.language_code)>1
  ), candidates AS MATERIALIZED (
   SELECT resource.*,lower(name) COLLATE "C" AS name_key FROM resources resource
   WHERE strpos(lower(name),lower(query))>0
    AND (language IS NULL OR COALESCE(primary_language_code,language_code)=language OR resource.id IN(SELECT collection_id FROM mixed_language))
    AND (p_scope='all' OR (p_scope='unlabelled' AND NOT EXISTS(SELECT 1 FROM placements WHERE collection_id=resource.id)) OR
     (p_scope='label' AND EXISTS(SELECT 1 FROM placements JOIN labels ON labels.id=placements.label_id WHERE collection_id=resource.id)))
  ), count_scope AS MATERIALIZED (
   SELECT * FROM candidates WHERE p_sort='count'
   UNION ALL
   (SELECT * FROM candidates WHERE p_sort<>'count' AND (after_id IS NULL OR
    (p_sort='name' AND (name_key,id)>(after_key COLLATE "C",after_id)) OR
    (p_sort='recent' AND (sort_time<after_time OR (sort_time=after_time AND id>after_id))))
    ORDER BY CASE WHEN p_sort='name' THEN name_key END COLLATE "C",CASE WHEN p_sort='recent' THEN sort_time END DESC,id LIMIT p_limit+1)
  ), members AS MATERIALIZED (
   SELECT scope.id AS collection_id,entry.id,entry.dictionary_id FROM count_scope scope
   JOIN public.user_word_list_items item ON item.list_id=scope.id JOIN private.active_word_entries entry ON entry.id=item.word_id
  ), dictionaries AS MATERIALIZED (
   SELECT dictionary.id,dictionary.kind,dictionary.owner_user_id,
    CASE WHEN dictionary.kind<>'user' THEN public.can_browse_dictionary(principal,dictionary.id) ELSE false END AS readable
   FROM (SELECT DISTINCT dictionary_id FROM members) selected JOIN public.dictionaries dictionary ON dictionary.id=selected.dictionary_id
  ), shared AS MATERIALIZED (
   SELECT DISTINCT granted.entry_id FROM private.shared_author_entry_memberships_v1 granted
   WHERE granted.user_id=principal AND granted.entry_id IN(SELECT id FROM members)
  ), counts AS MATERIALIZED (
   SELECT member.collection_id,count(*) AS item_count FROM members member LEFT JOIN dictionaries dictionary ON dictionary.id=member.dictionary_id
   WHERE member.dictionary_id IS NULL OR dictionary.readable OR
    (dictionary.kind='user' AND (dictionary.owner_user_id=principal OR member.id IN(SELECT entry_id FROM shared)))
   GROUP BY member.collection_id
  ), ordered AS MATERIALIZED (
   SELECT scope.*,COALESCE(counts.item_count,0) AS item_count FROM count_scope scope LEFT JOIN counts ON counts.collection_id=scope.id
   WHERE p_sort<>'count' OR after_id IS NULL OR COALESCE(counts.item_count,0)<after_count OR (COALESCE(counts.item_count,0)=after_count AND id>after_id)
   ORDER BY CASE WHEN p_sort='name' THEN name_key END COLLATE "C",CASE WHEN p_sort='recent' THEN sort_time END DESC,
    CASE WHEN p_sort='count' THEN COALESCE(counts.item_count,0) END DESC,id LIMIT p_limit+1
  ), page AS MATERIALIZED (
   SELECT *,row_number() OVER(ORDER BY CASE WHEN p_sort='name' THEN name_key END COLLATE "C",CASE WHEN p_sort='recent' THEN sort_time END DESC,
    CASE WHEN p_sort='count' THEN item_count END DESC,id) AS ordinal FROM ordered
  ), visible AS MATERIALIZED (SELECT * FROM page WHERE ordinal<=p_limit)
  SELECT jsonb_build_object('revision',COALESCE((SELECT revision FROM private.collection_label_catalogs WHERE user_id=principal),0),
   'collections',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'createdAt',v.created_at,
    'ownership',v.ownership,'isShared',v.is_shared,'itemCount',v.item_count,
    'labelIds',COALESCE((SELECT jsonb_agg(label_id ORDER BY label_id) FROM placements WHERE collection_id=v.id),'[]'::jsonb)) ORDER BY ordinal) FROM visible v),'[]'::jsonb),
   'nextCursor',CASE WHEN EXISTS(SELECT 1 FROM page WHERE ordinal>p_limit) THEN (
    SELECT jsonb_build_object('id',id,'scope',fingerprint,'key',CASE p_sort WHEN 'name' THEN name_key
     WHEN 'recent' THEN to_char(sort_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ELSE item_count::text END)
    FROM visible ORDER BY ordinal DESC LIMIT 1) ELSE NULL END)
 );
END;
$_$;

CREATE FUNCTION private.training_collection_catalog_cohort_v2(p_user_id uuid, p_query text, p_language_code text, p_after_id uuid, p_after_key text, p_limit integer, p_collection_ids uuid[] DEFAULT NULL::uuid[], p_ownership text DEFAULT 'all'::text) RETURNS TABLE(collection_id uuid, collection_name text, ownership text, available_item_count bigint, name_key text, eligible boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
 WITH resources AS MATERIALIZED (
  SELECT list.id,list.name,list.user_id AS owner_id,COALESCE(list.primary_language_code,list.language_code) AS language_code,
   'owned'::text AS ownership,lower(list.name) COLLATE "C" AS name_key
  FROM public.user_word_lists list WHERE list.user_id=p_user_id AND p_ownership IN('all','owned') AND (p_collection_ids IS NULL OR list.id=ANY(p_collection_ids))
  UNION ALL
  SELECT DISTINCT list.id,list.name,scope.owner_user_id,COALESCE(list.primary_language_code,list.language_code),
   'received',lower(list.name) COLLATE "C"
  FROM private.live_collection_access_paths_v1 scope
  JOIN public.user_word_lists list ON list.id=scope.collection_id
  WHERE scope.user_id=p_user_id AND scope.owner_user_id<>p_user_id AND p_ownership IN('all','received') AND list.user_id=scope.owner_user_id AND (p_collection_ids IS NULL OR list.id=ANY(p_collection_ids))
 ), cohort AS MATERIALIZED (
  SELECT * FROM resources WHERE strpos(lower(name),lower(p_query))>0
   AND (p_after_id IS NULL OR (name_key,id)>(p_after_key COLLATE "C",p_after_id))
  ORDER BY name_key COLLATE "C",id LIMIT p_limit
 ), members AS MATERIALIZED (
  SELECT cohort.id AS collection_id,cohort.owner_id,cohort.ownership,entry.id,entry.dictionary_id,entry.management_kind,entry.language_code
  FROM cohort JOIN public.user_word_list_items item ON item.list_id=cohort.id
  JOIN private.active_word_entries entry ON entry.id=item.word_id
 ), dictionaries AS MATERIALIZED (
  SELECT dictionary.id,dictionary.kind,dictionary.owner_user_id,
   CASE WHEN dictionary.kind<>'user' THEN public.can_access_dictionary(p_user_id,dictionary.id,'read') ELSE false END AS readable
  FROM (SELECT DISTINCT dictionary_id FROM members) selected JOIN public.dictionaries dictionary ON dictionary.id=selected.dictionary_id
 ), borrowed AS MATERIALIZED (
  SELECT DISTINCT member.id FROM members member JOIN dictionaries dictionary ON dictionary.id=member.dictionary_id
  WHERE dictionary.kind='user' AND dictionary.owner_user_id<>p_user_id
   AND NOT(member.ownership='received' AND dictionary.owner_user_id=member.owner_id AND member.management_kind='user')
 ), borrowed_shared AS MATERIALIZED (
  SELECT DISTINCT grant_entry.entry_id FROM private.shared_author_entry_memberships_v1 grant_entry
  WHERE grant_entry.user_id=p_user_id AND grant_entry.entry_id IN(SELECT id FROM borrowed)
 ), counts AS MATERIALIZED (
  SELECT member.collection_id,count(*) FILTER(WHERE p_language_code IS NULL OR member.language_code=p_language_code) AS item_count,
   count(DISTINCT member.language_code) AS language_count
  FROM members member LEFT JOIN dictionaries dictionary ON dictionary.id=member.dictionary_id
  WHERE member.dictionary_id IS NULL OR dictionary.readable OR (dictionary.kind='user' AND
   (dictionary.owner_user_id=p_user_id OR
    (member.ownership='received' AND dictionary.owner_user_id=member.owner_id AND member.management_kind='user') OR
    member.id IN(SELECT entry_id FROM borrowed_shared)))
  GROUP BY member.collection_id
 ) SELECT cohort.id,cohort.name,cohort.ownership,COALESCE(counts.item_count,0),cohort.name_key,
   CASE WHEN cohort.ownership='received' THEN COALESCE(counts.item_count,0)>0
    ELSE p_language_code IS NULL OR cohort.language_code=p_language_code OR
     (COALESCE(counts.language_count,0)>1 AND COALESCE(counts.item_count,0)>0) END
 FROM cohort LEFT JOIN counts ON counts.collection_id=cohort.id
 ORDER BY cohort.name_key COLLATE "C",cohort.id
$$;


CREATE FUNCTION public.read_training_collection_catalog_v2(p_query text DEFAULT ''::text, p_language_code text DEFAULT NULL::text, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 50, p_ownership text DEFAULT 'all'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE principal uuid:=(select auth.uid()); query text:=btrim(p_query);
 language text:=NULLIF(btrim(p_language_code),'');fingerprint text;after_id uuid;after_key text;
 batch jsonb;candidate jsonb;collected jsonb:='[]'::jsonb;scanned integer;cohort_limit constant integer:=100;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_ownership IS NULL OR p_ownership NOT IN('all','owned','received') THEN RAISE EXCEPTION 'invalid_catalog_request' USING ERRCODE='22023'; END IF;
 IF query IS NULL OR length(query)>100 OR length(language)>16 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid_catalog_request' USING ERRCODE='22023'; END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array('ownership-v2',principal,query,language,p_ownership)::text,'UTF8')),'hex');
 IF p_cursor IS NOT NULL THEN
  IF jsonb_typeof(p_cursor) IS DISTINCT FROM 'object' OR p_cursor-ARRAY['id','key','scope']<>'{}'::jsonb
   OR jsonb_typeof(p_cursor->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_cursor->'key') IS DISTINCT FROM 'string'
   OR jsonb_typeof(p_cursor->'scope') IS DISTINCT FROM 'string' OR p_cursor->>'scope' IS DISTINCT FROM fingerprint
   OR length(p_cursor->>'key')>1000 THEN RAISE EXCEPTION 'invalid_catalog_cursor' USING ERRCODE='22023'; END IF;
  BEGIN after_id:=(p_cursor->>'id')::uuid;after_key:=p_cursor->>'key';
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_catalog_cursor' USING ERRCODE='22023'; END;
 END IF;
 LOOP
  WITH cohort AS MATERIALIZED (
   SELECT collection_id AS id,collection_name AS name,ownership,available_item_count AS item_count,name_key,eligible
   FROM private.training_collection_catalog_cohort_v2(principal,query,language,after_id,after_key,cohort_limit,NULL,p_ownership)
  ) SELECT jsonb_build_object('scanned',(SELECT count(*) FROM cohort),
    'last',(SELECT jsonb_build_object('id',id,'key',name_key) FROM cohort ORDER BY name_key COLLATE "C" DESC,id DESC LIMIT 1),
    'rows',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'ownership',ownership,
      'availableItemCount',item_count,'key',name_key) ORDER BY name_key COLLATE "C",id) FROM cohort WHERE eligible),'[]'::jsonb))
   INTO batch;
  scanned:=(batch->>'scanned')::integer;
  EXIT WHEN scanned=0;
  FOR candidate IN SELECT value FROM jsonb_array_elements(batch->'rows') LOOP
   collected:=collected||jsonb_build_array(candidate);
   EXIT WHEN jsonb_array_length(collected)>p_limit;
  END LOOP;
  EXIT WHEN jsonb_array_length(collected)>p_limit OR scanned<cohort_limit;
  after_id:=(batch#>>'{last,id}')::uuid;after_key:=batch#>>'{last,key}';
 END LOOP;
 RETURN jsonb_build_object('collections',COALESCE((SELECT jsonb_agg(row.value-'key' ORDER BY row.ordinality)
   FROM jsonb_array_elements(collected) WITH ORDINALITY row(value,ordinality) WHERE row.ordinality<=p_limit),'[]'::jsonb),
  'nextCursor',CASE WHEN jsonb_array_length(collected)>p_limit THEN jsonb_build_object(
   'id',collected->(p_limit-1)->>'id','key',collected->(p_limit-1)->>'key','scope',fingerprint) ELSE NULL END);
END;
$$;

-- Separate RPC names avoid optional-argument overload ambiguity. Retain the
-- existing signatures for PostgREST callers and deployment signature gates.
CREATE OR REPLACE FUNCTION public.read_personal_collection_catalog_v1(p_query text DEFAULT '',p_sort text DEFAULT 'recent',p_scope text DEFAULT 'all',p_label_id uuid DEFAULT NULL,p_language_code text DEFAULT NULL,p_cursor jsonb DEFAULT NULL,p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 RETURN public.read_personal_collection_catalog_v2(p_query,p_sort,p_scope,p_label_id,p_language_code,p_cursor,p_limit,'all');
END;
$$;
CREATE OR REPLACE FUNCTION public.read_training_collection_catalog_v1(p_query text DEFAULT '',p_language_code text DEFAULT NULL,p_cursor jsonb DEFAULT NULL,p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 RETURN public.read_training_collection_catalog_v2(p_query,p_language_code,p_cursor,p_limit,'all');
END;
$$;
REVOKE ALL ON FUNCTION private.training_collection_catalog_cohort_v2(uuid,text,text,uuid,text,integer,uuid[],text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_personal_collection_catalog_v2(text,text,text,uuid,text,jsonb,integer,text), public.read_training_collection_catalog_v2(text,text,jsonb,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_personal_collection_catalog_v2(text,text,text,uuid,text,jsonb,integer,text), public.read_training_collection_catalog_v2(text,text,jsonb,integer,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
