-- Fresh-install history projection; managed installations require a separate forward migration.
CREATE INDEX training_headword_events_recent_idx ON private.training_headword_exclusion_events (user_id, created_at DESC, id DESC);
CREATE INDEX training_pair_events_recent_idx ON private.training_pair_exclusion_events (user_id, created_at DESC, id DESC);
CREATE INDEX training_known_events_recent_idx ON public.user_card_action_events (user_id, created_at DESC, id DESC) WHERE action IN ('mark-known','undo-known');

-- The known-choice rollout can convert old exclusions into two technical marks.
-- Their original exclusion remains the user action; do not invent new history.
CREATE FUNCTION private.training_history_is_conversion_event_v1(p_user uuid,p_entry uuid,p_event uuid,p_action text,p_created timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $$
DECLARE converted boolean := false;
BEGIN
 IF to_regclass('private.meaning_exclusion_known_conversions') IS NOT NULL THEN
  EXECUTE $query$
   SELECT EXISTS (SELECT 1 FROM private.meaning_exclusion_known_conversions c
    JOIN public.user_card_known_marks k ON k.id=ANY(c.introduced_mark_ids)
    WHERE c.user_id=$1 AND c.entry_id=$2 AND k.user_id=$1 AND k.entry_id=$2
      AND (($4='mark-known' AND k.mark_event_id=$3)
        OR ($4='undo-known' AND k.undo_event_id=$3 AND c.undone_at=$5)))
  $query$ INTO converted USING p_user,p_entry,p_event,p_action,p_created;
 END IF;
 RETURN converted;
END $$;
REVOKE ALL ON FUNCTION private.training_history_is_conversion_event_v1(uuid,uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
 IF to_regclass('private.meaning_exclusion_known_conversions') IS NOT NULL THEN
  EXECUTE 'CREATE INDEX IF NOT EXISTS meaning_exclusion_conversions_history_idx ON private.meaning_exclusion_known_conversions (user_id,entry_id)';
 END IF;
END $$;

CREATE FUNCTION public.get_recent_training_activity_v2(p_limit integer DEFAULT 50)
RETURNS TABLE(activity_id text, entry_id uuid, headword text, part_of_speech text,
  review_result text, card_type_id text, exercise_family text, exercise_direction text,
  target_id uuid, exercise_text text, reviewed_at timestamptz, has_more boolean, meaning_text text, content_language_code text, meaning_ordinal integer, meaning_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog, public, private, pg_temp AS $$
DECLARE v_user uuid := (SELECT auth.uid()); v_limit integer := LEAST(GREATEST(COALESCE(p_limit,50),1),50);
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized: authenticated user required'; END IF;
 RETURN QUERY
 WITH old_activity AS MATERIALIZED (SELECT * FROM public.get_recent_training_activity_v1(50)),
 activity AS MATERIALIZED (
  SELECT a.activity_id,a.entry_id,a.headword,a.part_of_speech,a.review_result,a.card_type_id,a.exercise_family,a.exercise_direction,a.target_id,a.exercise_text,a.reviewed_at
  FROM old_activity a
  UNION ALL
  (SELECT 'known:'||e.id::text,w.id,w.headword,w.part_of_speech,
    CASE e.action WHEN 'mark-known' THEN 'known' ELSE 'restored' END,
    CASE WHEN (SELECT count(DISTINCT k.card_type_id) FROM public.user_card_known_marks k
      WHERE k.user_id=e.user_id AND k.entry_id=e.entry_id AND k.mark_scope='meaning'
        AND CASE WHEN e.action='mark-known' THEN k.mark_event_id=e.id ELSE k.undo_event_id=e.id END) = 2
      THEN 'both-directions' ELSE e.card_type_id END,
    'meaning'::text,NULL::text,NULL::uuid,NULL::text,e.created_at
   FROM public.user_card_action_events e JOIN public.word_entries w ON w.id=e.entry_id
   WHERE e.user_id=v_user AND e.action IN ('mark-known','undo-known')
    AND NOT private.training_history_is_conversion_event_v1(e.user_id,e.entry_id,e.id,e.action,e.created_at)
    AND (w.dictionary_id IS NULL OR public.can_access_dictionary(v_user,w.dictionary_id,'read'))
   ORDER BY e.created_at DESC,e.id DESC LIMIT v_limit+1)
  UNION ALL
  (SELECT 'headword-exclusion:'||e.id::text,w.id,w.headword,w.part_of_speech,
    CASE e.action WHEN 'exclude-headword' THEN 'known' ELSE 'restored' END,
    'both-directions'::text,'meaning'::text,NULL::text,NULL::uuid,NULL::text,e.created_at
   FROM private.training_headword_exclusion_events e
   JOIN private.training_headword_exclusions x ON x.id=e.exclusion_id AND x.user_id=e.user_id
   JOIN public.word_entries w ON w.id=x.entry_id
   WHERE e.user_id=v_user AND (w.dictionary_id IS NULL OR public.can_access_dictionary(v_user,w.dictionary_id,'read'))
   ORDER BY e.created_at DESC,e.id DESC LIMIT v_limit+1)
  UNION ALL
  (SELECT 'pair-exclusion:'||e.id::text,w.id,w.headword,w.part_of_speech,
    CASE e.action WHEN 'exclude-pair' THEN CASE WHEN x.family='meaning' THEN 'known' ELSE 'excluded' END ELSE 'restored' END,
    CASE WHEN x.family='meaning' THEN CASE
      WHEN x.pair_key LIKE '%:recall' THEN 'both-directions'
      WHEN x.pair_key LIKE '%:listen-recognize' THEN 'listen-recognize'
      WHEN x.pair_key LIKE '%:listen-type' THEN 'listen-type' END END,
    CASE WHEN x.family='meaning' THEN 'meaning' ELSE x.family END,
    NULL::text,NULL::uuid,
    CASE WHEN w.archived_at IS NULL AND n.source_text_fingerprint=x.source_text_fingerprint
      THEN NULLIF(btrim(n.canonical_source_text),'') END,e.created_at
   FROM private.training_pair_exclusion_events e
   JOIN private.training_pair_exclusions x ON x.id=e.exclusion_id AND x.user_id=e.user_id
   JOIN public.word_entries w ON w.id=x.entry_id
   LEFT JOIN private.platform_v2_content_nodes n ON n.id=x.content_node_id AND n.entry_id=w.id
   WHERE e.user_id=v_user AND (w.dictionary_id IS NULL OR public.can_access_dictionary(v_user,w.dictionary_id,'read'))
   ORDER BY e.created_at DESC,e.id DESC LIMIT v_limit+1)
 ), bounded AS MATERIALIZED (SELECT * FROM activity a ORDER BY a.reviewed_at DESC,a.activity_id DESC LIMIT v_limit+1),
 more AS (SELECT count(*)>v_limit OR COALESCE((SELECT bool_or(a.has_more) FROM old_activity a),false) AS value FROM bounded),
 -- Only complete, accessible source groups with unambiguous source ordinals
 -- can provide a meaning badge. Never derive it from the history order.
 source_groups AS MATERIALIZED (
   SELECT DISTINCT g.id,g.dictionary_id,g.identity_scheme_version,g.source_group_key
   FROM bounded b JOIN private.source_entry_bindings bind ON bind.word_entry_id=b.entry_id AND bind.binding_state='active'
   JOIN private.platform_v2_headword_groups g ON g.management_kind='source' AND g.dictionary_id=bind.dictionary_id
      AND g.identity_scheme_version=bind.identity_scheme_version AND g.source_group_key=bind.source_group_key
 ), group_members AS MATERIALIZED (
   SELECT g.id AS group_id,bind.word_entry_id,bind.sense_ordinal,
     private.entry_access_v1(v_user,bind.word_entry_id,'browse') AS readable
   FROM source_groups g JOIN private.source_entry_bindings bind ON bind.dictionary_id=g.dictionary_id
    AND bind.identity_scheme_version=g.identity_scheme_version AND bind.source_group_key=g.source_group_key AND bind.binding_state='active'
   JOIN private.active_word_entries entry ON entry.id=bind.word_entry_id
 ), valid_groups AS (
   SELECT group_id,count(*)::integer AS total FROM group_members
   GROUP BY group_id HAVING count(*) BETWEEN 2 AND 50 AND bool_and(readable IS TRUE)
    AND count(DISTINCT sense_ordinal)=count(*) AND min(sense_ordinal)=1 AND max(sense_ordinal)=count(*)
 ), badges AS (
   SELECT m.word_entry_id,min(m.sense_ordinal)::integer AS ordinal,min(g.total)::integer AS total
   FROM group_members m JOIN valid_groups g ON g.group_id=m.group_id
   GROUP BY m.word_entry_id HAVING count(*)=1
 )
 SELECT b.activity_id,b.entry_id,b.headword,b.part_of_speech,b.review_result,b.card_type_id,
 b.exercise_family,b.exercise_direction,b.target_id,b.exercise_text,b.reviewed_at,more.value,
 CASE WHEN w.archived_at IS NULL THEN left(COALESCE(NULLIF(btrim(w.raw#>>'{meanings,0,definition}'),''),NULLIF(btrim(w.raw->>'definition'),'')),240) END, w.language_code, badge.ordinal, badge.total
 FROM bounded b JOIN public.word_entries w ON w.id=b.entry_id LEFT JOIN badges badge ON badge.word_entry_id=b.entry_id CROSS JOIN more
 ORDER BY b.reviewed_at DESC,b.activity_id DESC LIMIT v_limit;
END $$;
REVOKE ALL ON FUNCTION public.get_recent_training_activity_v2(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_training_activity_v2(integer) TO authenticated;
