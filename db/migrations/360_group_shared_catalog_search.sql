BEGIN;
-- Fresh-install read projections. Group root timestamps are unavailable; keep
-- direct root created_at and use collection.created_at for group-only rows.
CREATE OR REPLACE FUNCTION public.read_owned_shared_collection_catalog_v1(p_query text DEFAULT ''::text, p_sort text DEFAULT 'recent'::text, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $_$
DECLARE principal uuid:=(select auth.uid()); query text:=btrim(p_query); fingerprint text;
 after_id uuid;after_key text;after_time timestamptz;after_count bigint;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF query IS NULL OR length(query)>100 OR p_sort IS NULL OR p_sort NOT IN('name','recent','count') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid_catalog_request' USING ERRCODE='22023';
 END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array('live-paths-v2',principal,query,p_sort)::text,'UTF8')),'hex');
 IF p_cursor IS NOT NULL THEN
  IF jsonb_typeof(p_cursor) IS DISTINCT FROM 'object' OR p_cursor-ARRAY['id','key','scope']<>'{}'::jsonb OR
   jsonb_typeof(p_cursor->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_cursor->'key') IS DISTINCT FROM 'string' OR
   jsonb_typeof(p_cursor->'scope') IS DISTINCT FROM 'string' OR p_cursor->>'scope' IS DISTINCT FROM fingerprint OR
   length(p_cursor->>'key')>1000 THEN RAISE EXCEPTION 'invalid_catalog_cursor' USING ERRCODE='22023'; END IF;
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
  WITH group_sources AS MATERIALIZED (
   SELECT root.id AS root_id,root.label_id,label.name AS label_name,scope.collection_id
   FROM private.label_sharing_roots root JOIN private.collection_labels label ON label.id=root.label_id
   CROSS JOIN LATERAL private.label_subtree_owned_collections_v1(principal,root.label_id) scope
   WHERE root.owner_user_id=principal AND root.is_open
  ), group_metadata AS MATERIALIZED (
   SELECT collection_id,jsonb_agg(jsonb_build_object('labelId',label_id,'name',label_name) ORDER BY label_id) AS groups
   FROM group_sources GROUP BY collection_id
  ), candidates AS MATERIALIZED (
   SELECT list.id,list.name,COALESCE(root.created_at,list.created_at) AS created_at,
    root.id IS NOT NULL AS direct_publication,COALESCE(metadata.groups,'[]'::jsonb) AS groups,
    lower(list.name) COLLATE "C" AS name_key
   FROM public.user_word_lists list
   LEFT JOIN private.collection_sharing_roots root ON root.collection_id=list.id AND root.owner_user_id=principal AND root.is_open
   LEFT JOIN group_metadata metadata ON metadata.collection_id=list.id
   WHERE list.user_id=principal AND (root.id IS NOT NULL OR metadata.collection_id IS NOT NULL)
    AND strpos(lower(list.name),lower(query))>0
  ), count_scope AS MATERIALIZED (
   SELECT * FROM candidates WHERE p_sort='count'
   UNION ALL
   (SELECT * FROM candidates WHERE p_sort<>'count' AND (after_id IS NULL OR
    (p_sort='name' AND (name_key,id)>(after_key COLLATE "C",after_id)) OR
    (p_sort='recent' AND (created_at<after_time OR (created_at=after_time AND id>after_id))))
    ORDER BY CASE WHEN p_sort='name' THEN name_key END COLLATE "C",CASE WHEN p_sort='recent' THEN created_at END DESC,id LIMIT p_limit+1)
  ), counts AS MATERIALIZED (
   SELECT scope.id AS collection_id,count(entry.id) AS item_count FROM count_scope scope
   LEFT JOIN public.user_word_list_items item ON item.list_id=scope.id
   LEFT JOIN private.active_word_entries entry ON entry.id=item.word_id GROUP BY scope.id
  ), enriched AS MATERIALIZED (
   SELECT scope.*,COALESCE(counts.item_count,0) AS item_count FROM count_scope scope LEFT JOIN counts ON counts.collection_id=scope.id
  ), ordered AS MATERIALIZED (
   SELECT * FROM enriched WHERE p_sort<>'count' OR after_id IS NULL OR item_count<after_count OR (item_count=after_count AND id>after_id)
   ORDER BY CASE WHEN p_sort='name' THEN name_key END COLLATE "C",CASE WHEN p_sort='recent' THEN created_at END DESC,
    CASE WHEN p_sort='count' THEN item_count END DESC,id LIMIT p_limit+1
  ), page AS MATERIALIZED (
   SELECT *,row_number() OVER(ORDER BY CASE WHEN p_sort='name' THEN name_key END COLLATE "C",CASE WHEN p_sort='recent' THEN created_at END DESC,
    CASE WHEN p_sort='count' THEN item_count END DESC,id) AS ordinal FROM ordered
  ), visible AS MATERIALIZED (SELECT * FROM page WHERE ordinal<=p_limit), subscribers AS MATERIALIZED (
   SELECT live.collection_id,count(DISTINCT live.user_id) AS subscriber_count FROM private.live_collection_access_paths_v1 live
   WHERE live.owner_user_id=principal AND live.user_id<>principal AND live.collection_id IN(SELECT id FROM visible)
   GROUP BY live.collection_id
  )
  SELECT jsonb_build_object(
   'collections',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'createdAt',v.created_at,
    'itemCount',v.item_count,'subscriberCount',COALESCE(s.subscriber_count,0),'directPublication',v.direct_publication,'groups',v.groups) ORDER BY v.ordinal)
    FROM visible v LEFT JOIN subscribers s ON s.collection_id=v.id),'[]'::jsonb),
   'nextCursor',CASE WHEN EXISTS(SELECT 1 FROM page WHERE ordinal>p_limit) THEN (
    SELECT jsonb_build_object('id',id,'scope',fingerprint,'key',CASE p_sort WHEN 'name' THEN name_key
     WHEN 'recent' THEN to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ELSE item_count::text END)
    FROM visible ORDER BY ordinal DESC LIMIT 1) ELSE NULL END)
 );
END;
$_$;
CREATE OR REPLACE FUNCTION public.read_received_collection_catalog_v1(p_query text DEFAULT ''::text, p_sort text DEFAULT 'recent'::text, p_scope text DEFAULT 'all'::text, p_label_id uuid DEFAULT NULL::uuid, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $_$
DECLARE principal uuid:=(select auth.uid()); query text:=btrim(p_query); fingerprint text;
 after_id uuid; after_key text; after_time timestamptz; after_count bigint;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF query IS NULL OR length(query)>100 OR p_sort IS NULL OR p_sort NOT IN('name','recent','count')
  OR p_scope IS NULL OR p_scope NOT IN('all','unlabelled','label') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
  OR (p_scope='label') IS DISTINCT FROM (p_label_id IS NOT NULL) THEN
  RAISE EXCEPTION 'invalid_catalog_request' USING ERRCODE='22023';
 END IF;
 IF p_scope='label' AND NOT EXISTS(SELECT 1 FROM private.collection_labels WHERE user_id=principal AND id=p_label_id) THEN
  RAISE EXCEPTION 'label_not_found' USING ERRCODE='22023';
 END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array('live-paths-v2',principal,query,p_sort,p_scope,p_label_id)::text,'UTF8')),'hex');
 IF p_cursor IS NOT NULL THEN
  IF jsonb_typeof(p_cursor) IS DISTINCT FROM 'object' OR
    p_cursor-ARRAY['id','key','scope']<>'{}'::jsonb OR
    jsonb_typeof(p_cursor->'id') IS DISTINCT FROM 'string' OR
    jsonb_typeof(p_cursor->'key') IS DISTINCT FROM 'string' OR
    jsonb_typeof(p_cursor->'scope') IS DISTINCT FROM 'string' OR
    p_cursor->>'scope' IS DISTINCT FROM fingerprint OR length(p_cursor->>'key')>1000 THEN
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
  ), paths AS MATERIALIZED (
   SELECT path.*,COALESCE(subscription.accepted_at,group_subscription.accepted_at) AS accepted_at,
    label.id AS label_id,label.name AS label_name
   FROM private.collection_access_paths_for_user_v1(principal) path
   LEFT JOIN private.collection_sharing_subscriptions subscription
    ON path.root_kind='collection' AND subscription.user_id=principal AND subscription.root_id=path.root_id
   LEFT JOIN private.label_sharing_subscriptions group_subscription
    ON path.root_kind='label' AND group_subscription.user_id=principal AND group_subscription.root_id=path.root_id
   LEFT JOIN private.label_sharing_roots group_root ON path.root_kind='label' AND group_root.id=path.root_id
   LEFT JOIN private.collection_labels label ON label.id=group_root.label_id
   WHERE path.owner_user_id<>principal
  ), grants AS MATERIALIZED (
   SELECT collection_id,owner_user_id,max(accepted_at) AS accepted_at,bool_or(root_kind='collection') AS direct_subscription
   FROM paths GROUP BY collection_id,owner_user_id
  ), group_metadata AS MATERIALIZED (
   SELECT collection_id,jsonb_agg(jsonb_build_object('labelId',label_id,'name',label_name) ORDER BY label_id) AS groups
   FROM (SELECT DISTINCT collection_id,label_id,label_name FROM paths WHERE label_id IS NOT NULL) labels GROUP BY collection_id
  ), candidates AS MATERIALIZED (
   SELECT l.id,l.name,l.created_at,s.owner_user_id,s.accepted_at,s.direct_subscription,COALESCE(metadata.groups,'[]'::jsonb) AS groups,
    lower(l.name) COLLATE "C" AS name_key
   FROM grants s JOIN public.user_word_lists l ON l.id=s.collection_id AND l.user_id=s.owner_user_id
   LEFT JOIN group_metadata metadata ON metadata.collection_id=l.id
   WHERE strpos(lower(l.name),lower(query))>0
    AND (p_scope='all' OR (p_scope='unlabelled' AND NOT EXISTS(
     SELECT 1 FROM private.received_collection_label_placements placement WHERE placement.user_id=principal AND placement.collection_id=l.id
    )) OR (p_scope='label' AND EXISTS(
     SELECT 1 FROM private.received_collection_label_placements placement JOIN labels ON labels.id=placement.label_id
     WHERE placement.user_id=principal AND placement.collection_id=l.id
    )))
  ), count_scope AS MATERIALIZED (
   SELECT * FROM candidates WHERE p_sort='count'
   UNION ALL
   (SELECT * FROM candidates WHERE p_sort<>'count' AND (after_id IS NULL OR
     (p_sort='name' AND (name_key,id)>(after_key COLLATE "C",after_id)) OR
     (p_sort='recent' AND (accepted_at<after_time OR (accepted_at=after_time AND id>after_id))))
    ORDER BY CASE WHEN p_sort='name' THEN name_key END COLLATE "C",CASE WHEN p_sort='recent' THEN accepted_at END DESC,id
    LIMIT p_limit+1)
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
  ), enriched AS MATERIALIZED (
   SELECT scope.*,COALESCE(counts.item_count,0) AS item_count FROM count_scope scope LEFT JOIN counts ON counts.collection_id=scope.id
  ), ordered AS MATERIALIZED (
   SELECT * FROM enriched WHERE p_sort<>'count' OR after_id IS NULL OR item_count<after_count OR (item_count=after_count AND id>after_id)
   ORDER BY CASE WHEN p_sort='name' THEN name_key END COLLATE "C",CASE WHEN p_sort='recent' THEN accepted_at END DESC,
    CASE WHEN p_sort='count' THEN item_count END DESC,id LIMIT p_limit+1
  ), page AS MATERIALIZED (
   SELECT *,row_number() OVER(ORDER BY CASE WHEN p_sort='name' THEN name_key END COLLATE "C",CASE WHEN p_sort='recent' THEN accepted_at END DESC,
    CASE WHEN p_sort='count' THEN item_count END DESC,id) AS ordinal FROM ordered
  ), visible AS MATERIALIZED (SELECT * FROM page WHERE ordinal<=p_limit)
  SELECT jsonb_build_object('revision',COALESCE((SELECT revision FROM private.collection_label_catalogs WHERE user_id=principal),0),
   'collections',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',v.id,'name',v.name,'createdAt',v.created_at,'addedAt',v.accepted_at,'ownerUserId',v.owner_user_id,'role','viewer','itemCount',v.item_count,'directSubscription',v.direct_subscription,'groups',v.groups,
    'labelIds',COALESCE((SELECT jsonb_agg(label_id ORDER BY label_id) FROM private.received_collection_label_placements placement
      WHERE placement.user_id=principal AND placement.collection_id=v.id),'[]'::jsonb)) ORDER BY v.ordinal) FROM visible v),'[]'::jsonb),
   'nextCursor',CASE WHEN EXISTS(SELECT 1 FROM page WHERE ordinal>p_limit) THEN (
    SELECT jsonb_build_object('id',id,'scope',fingerprint,'key',CASE p_sort WHEN 'name' THEN name_key
      WHEN 'recent' THEN to_char(accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ELSE item_count::text END)
    FROM visible ORDER BY ordinal DESC LIMIT 1) ELSE NULL END)
 );
END;
$_$;
CREATE OR REPLACE FUNCTION public.read_collection_sharing_overview_v1() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid();
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'sharedByMe',(SELECT count(*) FROM (
   SELECT list.id FROM private.collection_sharing_roots root JOIN public.user_word_lists list ON list.id=root.collection_id
    WHERE root.owner_user_id=principal AND list.user_id=principal AND root.is_open
   UNION
   SELECT scope.collection_id FROM private.label_sharing_roots root
    CROSS JOIN LATERAL private.label_subtree_owned_collections_v1(principal,root.label_id) scope
    WHERE root.owner_user_id=principal AND root.is_open
  ) published),
  'addedByMe',(SELECT count(DISTINCT path.collection_id) FROM private.collection_access_paths_for_user_v1(principal) path
   JOIN public.user_word_lists list ON list.id=path.collection_id AND list.user_id=path.owner_user_id WHERE path.owner_user_id<>principal));
END;
$$;
COMMIT;
