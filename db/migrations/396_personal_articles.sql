BEGIN;

-- Every personal meaning already owns a durable singleton group. Keep that
-- identity for old links and allow its membership in an explicit article.
ALTER TABLE private.platform_v2_headword_groups ADD COLUMN personal_article_id uuid,
  ADD CONSTRAINT personal_article_owner CHECK (personal_article_id IS NULL OR management_kind='user');
CREATE INDEX personal_article_members ON private.platform_v2_headword_groups
  ((coalesce(personal_article_id,id))) WHERE management_kind='user';

CREATE VIEW private.article_members_v1 AS
  SELECT coalesce(personal_article_id,id) AS id, dictionary_id, management_kind,
    owner_user_id, identity_scheme_version, source_group_key, singleton_entry_id
  FROM private.platform_v2_headword_groups;
REVOKE ALL ON private.article_members_v1 FROM PUBLIC,anon,authenticated;

-- Preserve each reader's per-entry visibility, language, source and training predicates.
DO $$
DECLARE routine regprocedure; definition text;
BEGIN
  FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('private','public') AND p.proname=ANY(ARRAY[
      'library_entry_group_id_v1','lookup_platform_v2_entries_base_v1','lookup_platform_v2_library_entries_base_v1',
      'lookup_platform_v2_library_browse_entries_v1','lookup_platform_v2_library_filtered_entries_base_v1',
      'lookup_platform_v2_library_material_filtered_entries_base_v1','lookup_platform_v2_library_material_browse_entries_v1',
      'platform_v2_training_entry_group_v1','read_current_training_entry_v1','read_platform_v2_library_group_base_v1',
      'read_platform_v2_library_groups','read_platform_v2_presentation_identity_report_base_v1',
      'read_platform_v2_training_group_base_v1','training_headword_group_v1'])
  LOOP
    definition:=pg_get_functiondef(routine);
    IF position('private.platform_v2_headword_groups' in definition)=0 THEN RAISE EXCEPTION 'Unexpected reader %',routine; END IF;
    EXECUTE replace(definition,'private.platform_v2_headword_groups','private.article_members_v1');
  END LOOP;
END $$;

-- Keep display ordinals local to an article, including after a split or join.
CREATE FUNCTION private.personal_meaning_position_v1(p_entry uuid,p_per_part boolean DEFAULT false)
RETURNS integer LANGUAGE sql STABLE SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT count(*)::integer
 FROM private.article_members_v1 self JOIN private.active_word_entries e ON e.id=self.singleton_entry_id
 JOIN private.article_members_v1 m ON m.id=self.id JOIN private.active_word_entries sibling ON sibling.id=m.singleton_entry_id
 WHERE self.management_kind='user' AND self.singleton_entry_id=p_entry
 AND (sibling.meaning_id,sibling.id)<=(e.meaning_id,e.id)
 AND (NOT p_per_part OR (coalesce(private.normalize_training_part_of_speech_v1(sibling.part_of_speech),lower(btrim(sibling.part_of_speech)),'')
   =coalesce(private.normalize_training_part_of_speech_v1(e.part_of_speech),lower(btrim(e.part_of_speech)),'')
   AND NOT private.is_pointer_only_dictionary_entry_v1(sibling.raw)));
$$;
REVOKE ALL ON FUNCTION private.personal_meaning_position_v1(uuid,boolean) FROM PUBLIC,anon,authenticated;

DO $$
DECLARE r record; d text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('private.vocabulary_entry_selected_v1(uuid,jsonb)'::regprocedure,$a$singleton_entry_id=e.id) THEN
  RETURN true;$a$,$a$singleton_entry_id=e.id) THEN
  RETURN private.personal_meaning_position_v1(e.id,true)<=limit_count;$a$),
 ('private.vocabulary_selected_entry_ids_v1(jsonb,uuid[])'::regprocedure,'c.user_singleton OR f.ordinal','(c.user_singleton AND private.personal_meaning_position_v1(c.id,true)<=(p_value->>''meanings'')::integer) OR f.ordinal'),
 ('private.read_platform_v2_presentation_identity_report_base_v1(uuid,uuid[],boolean)'::regprocedure,'COALESCE(binding.sense_ordinal, entry.meaning_id) AS meaning_ordinal','CASE WHEN user_group.id IS NOT NULL THEN private.personal_meaning_position_v1(entry.id) ELSE COALESCE(binding.sense_ordinal, entry.meaning_id) END AS meaning_ordinal')
 ) v(signature, old_sql, new_sql) LOOP
   d:=pg_get_functiondef(r.signature);
   IF position(r.old_sql in d)=0 THEN RAISE EXCEPTION 'Unexpected reader %',r.signature; END IF;
   EXECUTE replace(d,r.old_sql,r.new_sql);
 END LOOP;
END $$;

CREATE FUNCTION public.save_personal_article_v1(p_language text,p_headword text,p_part text,p_senses jsonb,p_anchor uuid DEFAULT NULL,p_header jsonb DEFAULT '{}')
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); dict uuid; article uuid; item jsonb; entry uuid; ids uuid[]:='{}';
  payload jsonb; original jsonb; next_number integer; fields jsonb; content jsonb; member_count integer; before_number integer; noun_article text; article_kind text;
BEGIN
  IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF nullif(trim(p_headword),'') IS NULL OR length(p_headword)>300 OR jsonb_typeof(p_senses) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_senses) NOT BETWEEN 1 AND 50 OR octet_length(p_senses::text)>262144 THEN RAISE EXCEPTION 'invalid_user_entry'; END IF;
  IF p_anchor IS NULL THEN
    dict:=public.ensure_user_dictionary(principal,p_language,'My dictionary');
  ELSE
    SELECT g.dictionary_id INTO STRICT dict FROM private.article_members_v1 g
      JOIN private.active_word_entries e ON e.id=g.singleton_entry_id
      WHERE e.id=p_anchor AND e.language_code=p_language AND g.owner_user_id=principal;
  END IF;
  PERFORM public.assert_editable_user_dictionary(principal,dict);
  PERFORM pg_advisory_xact_lock(hashtextextended(dict::text,396));
  IF p_anchor IS NOT NULL THEN
    SELECT m.id,e.gender,e.raw->>'personalKind' INTO STRICT article,noun_article,article_kind
    FROM private.article_members_v1 m JOIN private.active_word_entries e ON e.id=m.singleton_entry_id WHERE e.id=p_anchor;
  END IF;
  IF jsonb_typeof(p_header) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_personal_header'; END IF;
  IF p_header ? 'article' THEN noun_article:=p_header->>'article'; END IF;
  IF p_header ? 'kind' THEN article_kind:=p_header->>'kind'; END IF;
  IF noun_article IS NOT NULL AND (noun_article NOT IN ('de','het') OR p_language<>'nl' OR coalesce(p_part,'') NOT IN ('zn','noun'))
    THEN RAISE EXCEPTION 'invalid_noun_article'; END IF;
  article_kind:=coalesce(article_kind,'word');
  IF article_kind NOT IN ('word','expression') OR (article_kind='expression' AND (p_part IS NOT NULL OR noun_article IS NOT NULL)) THEN RAISE EXCEPTION 'invalid_personal_kind'; END IF;
  FOREACH entry IN ARRAY ARRAY(SELECT (s->>'entryId')::uuid FROM jsonb_array_elements(p_senses) s WHERE s->>'entryId' IS NOT NULL) LOOP
    IF article IS NULL OR NOT EXISTS(SELECT 1 FROM private.article_members_v1 m JOIN private.active_word_entries e ON e.id=m.singleton_entry_id
      WHERE e.id=entry AND m.dictionary_id=dict AND m.id=article AND m.owner_user_id=principal) THEN RAISE EXCEPTION 'entry_not_accessible'; END IF;
  END LOOP;
  -- Saving one meaning can also change its article header. Update only header
  -- fields on siblings. Preserve all content and its meaning/exercise UUIDs.
  IF article IS NOT NULL THEN
    SELECT coalesce(max(meaning_id),0) INTO next_number FROM public.word_entries
      WHERE dictionary_id=dict AND language_code=p_language AND headword=trim(p_headword);
    WITH renamed AS (
      SELECT e.id,next_number+row_number() OVER (ORDER BY e.meaning_id,e.id) AS new_number
      FROM private.article_members_v1 m JOIN private.active_word_entries e ON e.id=m.singleton_entry_id
      WHERE m.id=article AND e.headword<>trim(p_headword)
    ), changed AS (
      SELECT e.id,coalesce(r.new_number,e.meaning_id) AS new_number
      FROM private.article_members_v1 m JOIN private.active_word_entries e ON e.id=m.singleton_entry_id
      LEFT JOIN renamed r ON r.id=e.id
      WHERE m.id=article AND (r.id IS NOT NULL OR e.part_of_speech IS DISTINCT FROM p_part OR e.gender IS DISTINCT FROM noun_article OR coalesce(e.raw->>'personalKind','word')<>article_kind)
    )
    UPDATE public.word_entries e SET headword=trim(p_headword),meaning_id=c.new_number,part_of_speech=p_part,gender=noun_article,
      raw=(e.raw-'headword'-'partOfSpeech'-'gender')||jsonb_strip_nulls(jsonb_build_object('headword',trim(p_headword),'partOfSpeech',p_part,'gender',noun_article,'personalKind',article_kind))
    FROM changed c WHERE e.id=c.id;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_senses) LOOP
    entry:=(item->>'entryId')::uuid;
    IF entry=ANY(ids) OR nullif(trim(item->>'definition'),'') IS NULL THEN RAISE EXCEPTION 'invalid_user_entry'; END IF;
    original:='{}';
    IF entry IS NOT NULL THEN SELECT raw INTO STRICT original FROM private.active_word_entries WHERE id=entry FOR UPDATE; END IF;
    IF original ? 'meanings' AND NOT original ? 'personalFields' THEN RAISE EXCEPTION 'rich_entry_edit_requires_content'; END IF;
    fields:=coalesce(item->'fields',original->'personalFields','[]'::jsonb);
    IF original ? 'example' AND original#>>'{example,translation}' IS NOT NULL AND NOT original ? 'personalFields' THEN
      RAISE EXCEPTION 'rich_entry_edit_requires_content';
    END IF;
    payload:=original||jsonb_build_object('languageCode',p_language,'headword',trim(p_headword),'partOfSpeech',p_part,'gender',noun_article,'definition',trim(item->>'definition'));
    IF original ? 'meanings' AND jsonb_array_length(original->'meanings')<>1 THEN RAISE EXCEPTION 'rich_entry_edit_requires_content'; END IF;
    content:=coalesce(original#>'{meanings,0}','{}'::jsonb)||jsonb_build_object('definition',trim(item->>'definition'));
    IF fields IS NOT NULL THEN
      IF jsonb_typeof(fields)<>'array' OR jsonb_array_length(fields)>100 THEN RAISE EXCEPTION 'invalid_fields'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(fields) f WHERE coalesce(f->>'kind','') NOT IN ('expression','example','note','reference','synonym')
        OR jsonb_typeof(f->'text') IS DISTINCT FROM 'string' OR length(f->>'text')>8000
        OR (f ? 'children' AND (f->>'kind'<>'expression' OR jsonb_typeof(f->'children') IS DISTINCT FROM 'array'))) THEN RAISE EXCEPTION 'invalid_fields'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(fields) f CROSS JOIN LATERAL jsonb_array_elements(f->'children') c
        WHERE coalesce(c->>'kind','') NOT IN ('example','explanation') OR jsonb_typeof(c->'text') IS DISTINCT FROM 'string'
        OR length(c->>'text')>8000 OR jsonb_array_length(f->'children')>100) THEN RAISE EXCEPTION 'invalid_fields'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(fields) f WHERE f ? 'targetEntryId'
        AND (f->>'kind'<>'reference' OR NOT EXISTS(SELECT 1 FROM private.active_word_entries target
          WHERE target.id=(f->>'targetEntryId')::uuid AND target.language_code=p_language
            AND private.entry_access_v1(principal,target.id,'browse')))) THEN RAISE EXCEPTION 'reference_not_accessible'; END IF;
      content:=content||jsonb_build_object(
        'examples',ARRAY(SELECT f->>'text' FROM jsonb_array_elements(fields) f WHERE f->>'kind'='example'),
        'synonyms',ARRAY(SELECT f->>'text' FROM jsonb_array_elements(fields) f WHERE f->>'kind'='synonym'),
        'cross_references',ARRAY(SELECT f->>'text' FROM jsonb_array_elements(fields) f WHERE f->>'kind'='reference'),
        'idioms',ARRAY(SELECT jsonb_build_object('expression',f->>'text',
          'examples',ARRAY(SELECT c->>'text' FROM jsonb_array_elements(f->'children') c WHERE c->>'kind'='example'),
          'explanation',(SELECT string_agg(c->>'text',E'\n') FROM jsonb_array_elements(f->'children') c WHERE c->>'kind'='explanation'))
          FROM jsonb_array_elements(fields) f WHERE f->>'kind'='expression'));
      payload:=(payload-'example'-'notes')||jsonb_build_object('notes',(SELECT string_agg(f->>'text',E'\n') FROM jsonb_array_elements(fields) f WHERE f->>'kind'='note'));
    END IF;
    payload:=public.validate_user_entry_v1_payload(payload||jsonb_build_object('meanings',jsonb_build_array(content)),p_language)
      ||jsonb_strip_nulls(jsonb_build_object('personalKind',article_kind,'personalFields',coalesce(fields,original->'personalFields')));
    SELECT coalesce(max(meaning_id),0)+1 INTO next_number FROM public.word_entries WHERE dictionary_id=dict AND language_code=p_language AND headword=trim(p_headword);
    IF entry IS NULL THEN
      IF item->>'insertBeforeEntryId' IS NOT NULL THEN
        SELECT e.meaning_id INTO STRICT before_number FROM private.article_members_v1 m
        JOIN private.active_word_entries e ON e.id=m.singleton_entry_id
        WHERE m.id=article AND m.owner_user_id=principal AND e.id=(item->>'insertBeforeEntryId')::uuid;
        -- Reserve consecutive, unused ordering numbers for the moved tail.
        -- Readers use their relative order; review/collection IDs remain intact.
        WITH tail AS (
          SELECT e.id,row_number() OVER (ORDER BY e.meaning_id,e.id) AS offset_number
          FROM private.article_members_v1 m JOIN private.active_word_entries e ON e.id=m.singleton_entry_id
          WHERE m.id=article AND e.meaning_id>=before_number
        )
        UPDATE public.word_entries e SET meaning_id=next_number+tail.offset_number FROM tail WHERE e.id=tail.id;
      END IF;
      INSERT INTO public.word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,gender,is_nt2_2000,raw)
        VALUES(dict,p_language,trim(p_headword),next_number,p_part,noun_article,false,payload) RETURNING id INTO entry;
    ELSE
      UPDATE public.word_entries SET meaning_id=CASE WHEN headword=trim(p_headword) THEN meaning_id ELSE next_number END,
        headword=trim(p_headword),part_of_speech=p_part,gender=noun_article,raw=payload WHERE id=entry;
    END IF;
    IF article IS NULL THEN SELECT id INTO STRICT article FROM private.article_members_v1 WHERE singleton_entry_id=entry; END IF;
    UPDATE private.platform_v2_headword_groups SET personal_article_id=article WHERE singleton_entry_id=entry;
    ids:=array_append(ids,entry);
  END LOOP;
  SELECT count(*) INTO member_count FROM private.article_members_v1 m JOIN private.active_word_entries e ON e.id=m.singleton_entry_id WHERE m.id=article;
  IF member_count>50 THEN RAISE EXCEPTION 'article_too_large'; END IF;
  RETURN ids;
END $$;

CREATE FUNCTION public.move_personal_meaning_v1(p_entry uuid,p_target uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); dict uuid; destination uuid; word text;
BEGIN
  SELECT m.dictionary_id,e.headword INTO STRICT dict,word FROM private.article_members_v1 m JOIN private.active_word_entries e ON e.id=m.singleton_entry_id
    WHERE m.owner_user_id=principal AND e.id=p_entry;
  PERFORM public.assert_editable_user_dictionary(principal,dict);
  PERFORM pg_advisory_xact_lock(hashtextextended(dict::text,396));
  IF p_target IS NULL THEN destination:=gen_random_uuid();
  ELSE
    SELECT m.id INTO STRICT destination FROM private.article_members_v1 m JOIN private.active_word_entries e ON e.id=m.singleton_entry_id
      WHERE m.dictionary_id=dict AND m.owner_user_id=principal AND e.id=p_target AND e.headword=word;
    IF (SELECT count(*) FROM private.article_members_v1 m JOIN private.active_word_entries e ON e.id=m.singleton_entry_id WHERE m.id=destination AND e.id<>p_entry)>=50 THEN RAISE EXCEPTION 'article_too_large'; END IF;
  END IF;
  UPDATE private.platform_v2_headword_groups SET personal_article_id=destination WHERE singleton_entry_id=p_entry;
END $$;
REVOKE ALL ON FUNCTION public.save_personal_article_v1(text,text,text,jsonb,uuid,jsonb),public.move_personal_meaning_v1(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_personal_article_v1(text,text,text,jsonb,uuid,jsonb),public.move_personal_meaning_v1(uuid,uuid) TO authenticated;
CREATE FUNCTION public.list_personal_move_targets_v1(p_entry uuid)
RETURNS TABLE(entry_id uuid,definitions text[]) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
  WITH origin AS (
    SELECT m.id AS article_id,m.dictionary_id,e.headword
    FROM private.article_members_v1 m JOIN private.active_word_entries e ON e.id=m.singleton_entry_id
    WHERE m.singleton_entry_id=p_entry AND m.owner_user_id=(select auth.uid())
  )
  SELECT (array_agg(e.id ORDER BY e.meaning_id,e.id))[1],
    array_agg(coalesce(e.raw->>'definition',e.raw#>>'{meanings,0,definition}','') ORDER BY e.meaning_id,e.id)
  FROM origin o JOIN private.article_members_v1 m ON m.dictionary_id=o.dictionary_id AND m.id<>o.article_id
  JOIN private.active_word_entries e ON e.id=m.singleton_entry_id AND e.headword=o.headword
  WHERE m.owner_user_id=(select auth.uid())
  GROUP BY m.id HAVING count(*)<50
  ORDER BY min(e.meaning_id),m.id;
$$;
REVOKE ALL ON FUNCTION public.list_personal_move_targets_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_personal_move_targets_v1(uuid) TO authenticated;
-- The personal editor mirrors the first structured definition at raw.definition.
-- Index the structured field once, preserving distinct entry-level definitions.
DO $$
DECLARE
  original text := pg_get_functiondef('public.refresh_dictionary_search_document(uuid,integer)'::regprocedure);
  marker text := $field$            s.raw#>>'{definition}',
            70,
            NULL,
            NULL,
            NULL
        FROM source_entry s$field$;
BEGIN
  IF position(marker IN original)=0 THEN RAISE EXCEPTION 'Unexpected entry-definition extractor'; END IF;
  EXECUTE replace(original, marker, marker || $predicate$
        WHERE s.management_kind IS DISTINCT FROM 'user'
           OR s.raw->>'definition' IS DISTINCT FROM s.raw#>>'{meanings,0,definition}'$predicate$);
END $$;

-- Personal writes are interactive. Make them searchable in the same transaction.
CREATE FUNCTION private.index_personal_dictionary_entry_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM public.refresh_dictionary_search_document(NEW.id,2);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.index_personal_dictionary_entry_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER index_personal_dictionary_entry AFTER INSERT OR UPDATE OF
  dictionary_id,language_code,headword,meaning_id,part_of_speech,raw,archived_at
  ON public.word_entries FOR EACH ROW WHEN (NEW.management_kind='user')
  EXECUTE FUNCTION private.index_personal_dictionary_entry_v1();
-- Forms can change independently after their headword was indexed. Refresh
-- each affected personal entry once per statement, including the old owner
-- of a moved form. Imported dictionary forms retain their normal batch path.
CREATE FUNCTION private.index_personal_word_forms_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE affected record;
BEGIN
  IF TG_OP='DELETE' THEN
    FOR affected IN SELECT DISTINCT e.id FROM old_forms f JOIN public.word_entries e ON e.id=f.word_id WHERE e.management_kind='user'
    LOOP PERFORM public.refresh_dictionary_search_document(affected.id,2); END LOOP;
  ELSIF TG_OP='INSERT' THEN
    FOR affected IN SELECT DISTINCT e.id FROM new_forms f JOIN public.word_entries e ON e.id=f.word_id WHERE e.management_kind='user'
    LOOP PERFORM public.refresh_dictionary_search_document(affected.id,2); END LOOP;
  ELSE
    FOR affected IN SELECT e.id FROM (SELECT word_id FROM new_forms UNION SELECT word_id FROM old_forms) f
      JOIN public.word_entries e ON e.id=f.word_id WHERE e.management_kind='user'
    LOOP PERFORM public.refresh_dictionary_search_document(affected.id,2); END LOOP;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.index_personal_word_forms_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER index_personal_forms_insert AFTER INSERT ON public.word_forms
  REFERENCING NEW TABLE AS new_forms FOR EACH STATEMENT EXECUTE FUNCTION private.index_personal_word_forms_v1();
CREATE TRIGGER index_personal_forms_update AFTER UPDATE ON public.word_forms
  REFERENCING OLD TABLE AS old_forms NEW TABLE AS new_forms FOR EACH STATEMENT EXECUTE FUNCTION private.index_personal_word_forms_v1();
CREATE TRIGGER index_personal_forms_delete AFTER DELETE ON public.word_forms
  REFERENCING OLD TABLE AS old_forms FOR EACH STATEMENT EXECUTE FUNCTION private.index_personal_word_forms_v1();
DO $$
DECLARE item uuid;
BEGIN
  FOR item IN SELECT e.id FROM public.word_entries e LEFT JOIN public.dictionary_search_documents doc ON doc.entry_id=e.id
    WHERE e.management_kind='user' AND (doc.entry_id IS NOT NULL OR e.archived_at IS NULL)
  LOOP
    PERFORM public.refresh_dictionary_search_document(item,2);
  END LOOP;
END $$;
-- Some dictionaries explicitly encode absent conjugation data as JSON null.
-- Retain the structural validation for every non-null conjugation table.
DO $$
DECLARE d text; old_body text:=$old$IF key='conjugation_table' THEN
        IF jsonb_typeof(field_value)<>'object'$old$;
BEGIN
  d:=pg_get_functiondef('private.portable_owned_entry_content_v1(jsonb,text)'::regprocedure);
  IF position(old_body in d)=0 THEN RAISE EXCEPTION 'Unexpected portable content validator'; END IF;
  EXECUTE replace(d,old_body,$new$IF key='conjugation_table' THEN
        IF field_value='null'::jsonb THEN CONTINUE; END IF;
        IF jsonb_typeof(field_value)<>'object'$new$);
END $$;

-- A single portable meaning can enter this editor when its editable sections
-- are fully representable. Leave complex copies on their existing read path.
CREATE FUNCTION private.editable_personal_copy_v1(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE m jsonb; f jsonb; fields jsonb:='[]'; section text;
BEGIN
  IF jsonb_typeof(payload->'meanings') IS DISTINCT FROM 'array' THEN RETURN payload; END IF;
  IF jsonb_array_length(payload->'meanings')<>1 OR payload ? 'personalFields' THEN RETURN payload; END IF;
  m:=payload#>'{meanings,0}';
  IF nullif(trim(m->>'definition'),'') IS NULL OR payload ? 'example' OR payload ? 'translation' THEN RETURN payload; END IF;
  FOREACH section IN ARRAY ARRAY['idioms','cross_references'] LOOP
    IF coalesce(m->section,'[]'::jsonb)<>'[]'::jsonb THEN RETURN payload; END IF;
  END LOOP;
  FOREACH section IN ARRAY ARRAY['examples','synonyms'] LOOP
    IF jsonb_typeof(coalesce(m->section,'[]'::jsonb))<>'array' THEN RETURN payload; END IF;
    FOR f IN SELECT value FROM jsonb_array_elements(m->section) LOOP
      IF jsonb_typeof(f)<>'string' OR length(f#>>'{}')>8000 THEN RETURN payload; END IF;
      fields:=fields||jsonb_build_array(jsonb_build_object('kind',CASE section WHEN 'examples' THEN 'example' ELSE 'synonym' END,'text',f));
    END LOOP;
  END LOOP;
  IF nullif(payload->>'notes','') IS NOT NULL THEN fields:=fields||jsonb_build_array(jsonb_build_object('kind','note','text',payload->>'notes')); END IF;
  IF jsonb_array_length(fields)>100 THEN RETURN payload; END IF;
  RETURN payload||jsonb_build_object('definition',m->>'definition','personalFields',fields);
END $$;
REVOKE ALL ON FUNCTION private.editable_personal_copy_v1(jsonb) FROM PUBLIC,anon,authenticated;

DO $$
DECLARE d text; assign text:=$old$payload:=snapshot->'content';$old$;
BEGIN
  d:=pg_get_functiondef('private.commit_independent_copy_snapshot_v1(uuid,uuid,uuid,text,uuid,boolean,jsonb)'::regprocedure);
  IF position(assign in d)=0 THEN RAISE EXCEPTION 'Unexpected copy writer'; END IF;
  EXECUTE replace(d,assign,$new$payload:=private.editable_personal_copy_v1(snapshot->'content');$new$);
END $$;
UPDATE public.word_entries e SET raw=private.editable_personal_copy_v1(e.raw)
FROM private.independent_entry_copy_receipts r
WHERE e.id=r.copied_entry_id AND e.management_kind='user' AND NOT e.raw ? 'personalFields'
 AND private.editable_personal_copy_v1(e.raw) IS DISTINCT FROM e.raw;
COMMIT;
