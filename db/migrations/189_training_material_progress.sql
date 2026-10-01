-- Read-only review queue and coverage per learning material for Statistics.
-- Materials: all enabled material, each readable enabled dictionary, and each
-- collection with entries in the language. Cards are meaning cards: coverage counts
-- distinct started meanings; due counts scheduled directions, as the current
-- study-day counters do. Dictionary ACLs stay live; nothing is written.
BEGIN;
CREATE FUNCTION public.get_training_material_progress_v1(p_language_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE
 principal uuid := (select auth.uid());
 v_now timestamptz := clock_timestamp();
 v_timezone text;
 v_start timestamptz;
 v_end timestamptz;
 v_disabled jsonb;
 v_materials jsonb;
BEGIN
 IF principal IS NULL THEN RETURN jsonb_build_object('error','unauthorized'); END IF;
 IF p_language_code IS NULL OR p_language_code !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
  RETURN jsonb_build_object('error','invalid_material_scope'); END IF;
 v_timezone := private.training_user_timezone_v1(principal);
 SELECT bounds.start_at,bounds.end_at INTO v_start,v_end FROM private.training_study_day_bounds_v1(v_now,v_timezone) bounds;
 SELECT settings.material_preferences->'disabledDictionaryIds' INTO v_disabled
  FROM public.user_settings settings WHERE settings.user_id=principal;
 v_disabled := COALESCE(v_disabled,'[]'::jsonb);
 WITH readable AS (
  SELECT d.id,d.name,d.kind FROM public.dictionaries d
  WHERE d.language_code=p_language_code AND public.can_access_dictionary(principal,d.id,'read')
   AND (d.kind='user' OR NOT (v_disabled ? d.id::text))
 ), entries AS (
  SELECT w.id,w.dictionary_id FROM public.word_entries w
  WHERE w.language_code=p_language_code AND (w.dictionary_id IS NULL OR w.dictionary_id IN (SELECT id FROM readable))
 ), card_state AS (
  SELECT s.entry_id,
   bool_or(s.fsrs_enabled) AS started,
   count(*) FILTER (WHERE s.fsrs_enabled AND NOT s.hidden AND s.next_review_at<v_end
    AND (s.frozen_until IS NULL OR s.frozen_until<=v_now)
    AND NOT EXISTS (SELECT 1 FROM public.user_review_log r WHERE r.user_id=principal AND r.word_id=s.entry_id
     AND r.mode=s.card_type_id AND r.review_type='new' AND r.reviewed_at>=v_start AND r.reviewed_at<v_end)) AS due
  FROM public.user_card_status s JOIN entries e ON e.id=s.entry_id
  WHERE s.user_id=principal GROUP BY s.entry_id
 ), members AS (
  SELECT 'all'::text AS kind,NULL::uuid AS id,NULL::text AS list_type,e.id AS entry_id FROM entries e
  UNION ALL SELECT 'dictionary',e.dictionary_id,NULL,e.id FROM entries e WHERE e.dictionary_id IS NOT NULL
  UNION ALL SELECT DISTINCT 'collection',li.list_id,'curated',li.word_id
   FROM public.word_list_items li JOIN entries e ON e.id=li.word_id
  UNION ALL SELECT DISTINCT 'collection',li.list_id,'user',li.word_id
   FROM public.user_word_list_items li JOIN public.user_word_lists l ON l.id=li.list_id AND l.user_id=principal
   JOIN entries e ON e.id=li.word_id
 ), totals AS (
  SELECT m.kind,m.id,m.list_type,count(*)::integer AS total,
   (count(*) FILTER (WHERE c.started))::integer AS started,COALESCE(sum(c.due),0)::integer AS due
  FROM members m LEFT JOIN card_state c ON c.entry_id=m.entry_id GROUP BY m.kind,m.id,m.list_type
 ), named AS (
  SELECT t.*,COALESCE(r.name,cl.name,ul.name) AS name,r.kind AS dictionary_kind,
   CASE t.kind WHEN 'all' THEN 0 WHEN 'dictionary' THEN 1 ELSE 2 END AS rank,cl.sort_order
  FROM totals t
  LEFT JOIN readable r ON t.kind='dictionary' AND r.id=t.id
  LEFT JOIN public.word_lists cl ON t.kind='collection' AND t.list_type='curated' AND cl.id=t.id
  LEFT JOIN public.user_word_lists ul ON t.kind='collection' AND t.list_type='user' AND ul.id=t.id AND ul.user_id=principal
 )
 SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('kind',n.kind,'id',n.id,'listType',n.list_type,
   'name',n.name,'personal',CASE WHEN n.kind='dictionary' THEN n.dictionary_kind='user' WHEN n.kind='collection' THEN n.list_type='user' END,
   'total',n.total,'started',n.started,'due',n.due))
   ORDER BY n.rank,n.list_type NULLS FIRST,n.sort_order NULLS LAST,lower(n.name),n.id),'[]'::jsonb)
 INTO v_materials FROM (SELECT * FROM named WHERE kind='all' OR name IS NOT NULL
  ORDER BY rank,list_type NULLS FIRST,sort_order NULLS LAST,lower(name),id LIMIT 201) n;
 IF NOT v_materials @> '[{"kind":"all"}]'::jsonb THEN
  v_materials := jsonb_build_array(jsonb_build_object('kind','all','total',0,'started',0,'due',0))||v_materials;
 END IF;
 RETURN jsonb_build_object('languageCode',p_language_code,'materials',v_materials);
END;
$$;
ALTER FUNCTION public.get_training_material_progress_v1(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_training_material_progress_v1(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_training_material_progress_v1(text) TO authenticated;
COMMENT ON FUNCTION public.get_training_material_progress_v1(text) IS 'Own review queue and started/total meanings per enabled readable material in one language; read-only.';
COMMIT;
