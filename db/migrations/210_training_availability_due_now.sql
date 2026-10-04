-- Due today is the actionable backlog, including overdue cards. Future
-- repetitions remain in totalReviews and require explicit Review ahead.
BEGIN;
CREATE OR REPLACE FUNCTION public.read_training_recipe_availability_v1(
 p_user_id uuid,p_card_type_ids text[],p_list_id uuid DEFAULT NULL,p_list_type text DEFAULT 'curated',
 p_training_filter jsonb DEFAULT '{}',p_exercise_family text DEFAULT 'meaning')
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,private,pg_temp AS $$
DECLARE
 v_filter jsonb:=COALESCE(p_training_filter,'{}')-'reviewTiming';
 v_modes text[]:=COALESCE(p_card_type_ids,ARRAY[]::text[]);
 v_now timestamptz:=private.training_reference_now_v1();
 v_timezone text:=private.training_user_timezone_v1(p_user_id);
 v_study_day date;
 v_due bigint:=0; v_reviews bigint:=0; v_new bigint:=0;
BEGIN
 IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
  RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
 END IF;
 IF jsonb_typeof(v_filter)<>'object' OR cardinality(v_modes)=0 OR p_exercise_family IS NULL
   OR p_exercise_family NOT IN ('meaning','idiom') OR p_list_type IS NULL OR p_list_type NOT IN ('curated','user') THEN
  RAISE EXCEPTION 'invalid_training_recipe';
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(v_modes) m WHERE m IS NULL OR
   CASE WHEN p_exercise_family='meaning' THEN m NOT IN ('word-to-definition','definition-to-word')
    ELSE m NOT IN ('idiom:direct','idiom:reverse') END) THEN RAISE EXCEPTION 'invalid_training_recipe'; END IF;
 IF v_filter->>'presentationMode'='word-in-context' AND (p_exercise_family<>'meaning' OR v_modes<>ARRAY['definition-to-word']) THEN
  RAISE EXCEPTION 'word_context_requires_reverse_mode';
 END IF;
 IF p_list_id IS NOT NULL AND NOT (CASE WHEN p_list_type='user' THEN EXISTS(
   SELECT 1 FROM user_word_lists WHERE id=p_list_id AND user_id=p_user_id)
   ELSE EXISTS(SELECT 1 FROM word_lists WHERE id=p_list_id) END) THEN RAISE EXCEPTION 'training_material_unavailable'; END IF;
 IF v_filter ? 'dictionaryScope' AND (p_list_id IS NOT NULL OR
    v_filter#>>'{dictionaryScope,mode}' IS NULL OR v_filter#>>'{dictionaryScope,mode}' NOT IN ('all','selected') OR
    NULLIF(v_filter#>>'{dictionaryScope,languageCode}','') IS NULL) THEN RAISE EXCEPTION 'training_material_unavailable'; END IF;
 IF v_filter ? 'dictionaryScope' AND NOT EXISTS (
  SELECT 1 FROM dictionaries d WHERE d.language_code=v_filter#>>'{dictionaryScope,languageCode}'
   AND public.can_access_dictionary(p_user_id,d.id,'read')
   AND (v_filter#>>'{dictionaryScope,mode}'='all' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter#>'{dictionaryScope,dictionaryIds}')='array'
      THEN v_filter#>'{dictionaryScope,dictionaryIds}' ELSE '[]'::jsonb END) requested(id)
    WHERE requested.id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     AND requested.id::uuid=d.id))) THEN RAISE EXCEPTION 'training_material_unavailable'; END IF;
 v_timezone:=private.training_schedule_timezone_v1(v_timezone);
 v_study_day:=((v_now AT TIME ZONE v_timezone)-interval '4 hours')::date;
 IF p_exercise_family='meaning' THEN
  SELECT count(*) FILTER(WHERE fsrs_enabled AND introduced AND next_review_at<=v_now),
   count(*) FILTER(WHERE fsrs_enabled AND introduced),
   count(*) FILTER(WHERE intrinsic_source='new')
   INTO v_due,v_reviews,v_new
   FROM private.training_recipe_eligible_cards_v1(p_user_id,v_modes,p_list_id,p_list_type,'both','auto',ARRAY[]::uuid[],ARRAY[]::text[],v_filter,
    private.training_filter_target_date(v_filter) IS NOT NULL OR NULLIF(v_filter->>'sourceId','') IS NOT NULL
      OR NULLIF(trim(v_filter->>'sourceKind'),'') IS NOT NULL OR NULLIF(trim(v_filter->>'externalId'),'') IS NOT NULL,false);
 ELSE
  WITH selected AS (SELECT DISTINCT split_part(m,':',2) direction FROM unnest(v_modes) m),
  eligible AS (
   SELECT state.fsrs_enabled,COALESCE(state.fsrs_reps,0)>0 OR state.last_reviewed_at IS NOT NULL introduced,state.next_review_at
   FROM selected CROSS JOIN LATERAL private.training_idiom_source_nodes_v1(p_user_id,selected.direction,p_list_id,p_list_type,v_filter) source
   LEFT JOIN private.platform_v2_training_exercise_targets target ON target.entry_id=source.entry_id AND target.content_node_id=source.content_node_id AND target.family='idiom' AND target.direction=selected.direction
   LEFT JOIN user_training_exercise_state state ON state.user_id=p_user_id AND state.target_id=target.id
   WHERE NOT COALESCE(state.hidden,false) AND (state.frozen_until IS NULL OR state.frozen_until<=v_now)
    AND NOT private.training_pair_excluded_v1(p_user_id,'idiom',source.entry_id,source.content_node_id,source.source_text_fingerprint,NULL)
  ) SELECT count(*) FILTER(WHERE fsrs_enabled AND introduced AND next_review_at<=v_now),
   count(*) FILTER(WHERE fsrs_enabled AND introduced),count(*) FILTER(WHERE NOT COALESCE(fsrs_enabled,false))
   INTO v_due,v_reviews,v_new FROM eligible;
 END IF;
 RETURN jsonb_build_object('dueToday',v_due,'totalReviews',v_reviews,'newCards',v_new,
   'studyDay',v_study_day,'timezone',v_timezone,'asOf',v_now);
END;
$$;
COMMIT;
