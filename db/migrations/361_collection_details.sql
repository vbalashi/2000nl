BEGIN;
ALTER TABLE public.user_word_lists ADD COLUMN source_details jsonb;
ALTER TABLE public.user_word_lists ADD COLUMN details_revision bigint NOT NULL DEFAULT 0;

CREATE FUNCTION private.bump_collection_details_revision_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF (NEW.name,NEW.description,NEW.source_details) IS DISTINCT FROM (OLD.name,OLD.description,OLD.source_details) THEN
  NEW.details_revision := OLD.details_revision + 1;
 ELSE
  NEW.details_revision := OLD.details_revision;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.bump_collection_details_revision_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER collection_details_revision BEFORE UPDATE ON public.user_word_lists
FOR EACH ROW EXECUTE FUNCTION private.bump_collection_details_revision_v1();

CREATE FUNCTION public.read_collection_details_v1(p_collection_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); collection public.user_word_lists%ROWTYPE;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO collection FROM public.user_word_lists WHERE id=p_collection_id;
 IF NOT FOUND OR (collection.user_id<>principal AND NOT EXISTS (
  SELECT 1 FROM private.live_collection_access_paths_v1 WHERE user_id=principal AND collection_id=p_collection_id
 )) THEN RAISE EXCEPTION 'collection_unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',collection.id,'name',collection.name,'description',collection.description,
  'source',collection.source_details,'revision',collection.details_revision::text,'isOwner',collection.user_id=principal);
END;
$$;

CREATE FUNCTION public.update_collection_details_v1(p_collection_id uuid,p_expected_revision text,p_patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); collection public.user_word_lists%ROWTYPE; source jsonb; k text; v jsonb; date_value date;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO collection FROM public.user_word_lists WHERE id=p_collection_id AND user_id=principal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_unavailable' USING ERRCODE='42501'; END IF;
 IF p_expected_revision IS DISTINCT FROM collection.details_revision::text THEN RAISE EXCEPTION 'details_conflict' USING ERRCODE='40001'; END IF;
 IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch-ARRAY['name','description','source'] <> '{}'::jsonb THEN
  RAISE EXCEPTION 'invalid_details' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'name' AND (jsonb_typeof(p_patch->'name') IS DISTINCT FROM 'string' OR length(btrim(p_patch->>'name')) NOT BETWEEN 1 AND 100) THEN
  RAISE EXCEPTION 'invalid_details' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'description' AND (jsonb_typeof(p_patch->'description') NOT IN ('string','null') OR length(p_patch->>'description')>4000) THEN
  RAISE EXCEPTION 'invalid_details' USING ERRCODE='22023'; END IF;
 source:=collection.source_details;
 IF p_patch ? 'source' THEN
  IF p_patch->'source'='null'::jsonb THEN source:=NULL;
  ELSIF jsonb_typeof(p_patch->'source')='object' AND (p_patch->'source')-ARRAY['materialKind','originKind','materialTitle','creatorName','url','fileName','publishedOn']='{}'::jsonb THEN
   source:=COALESCE(source,'{}'::jsonb)||(p_patch->'source');
   FOR k,v IN SELECT * FROM jsonb_each(source) LOOP
    IF jsonb_typeof(v) NOT IN ('string','null') OR length(v#>>'{}')>2048 THEN RAISE EXCEPTION 'invalid_details' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF source->>'materialKind' IS NOT NULL AND source->>'materialKind' NOT IN ('video','article','text','book','other') OR
      source->>'originKind' IS NOT NULL AND source->>'originKind' NOT IN ('youtube','web','local_file','manual','other') OR
      source->>'url' IS NOT NULL AND source->>'url' !~* '^https?://[^[:space:]/?#]+([^[:space:]]*)?$' THEN
    RAISE EXCEPTION 'invalid_details' USING ERRCODE='22023'; END IF;
   IF source->>'publishedOn' IS NOT NULL THEN
    BEGIN
     IF source->>'publishedOn' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid date'; END IF;
     date_value:=(source->>'publishedOn')::date;
     IF to_char(date_value,'YYYY-MM-DD')<>source->>'publishedOn' THEN RAISE EXCEPTION 'invalid date'; END IF;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_details' USING ERRCODE='22023'; END;
   END IF;
  ELSE RAISE EXCEPTION 'invalid_details' USING ERRCODE='22023'; END IF;
 END IF;
 UPDATE public.user_word_lists SET name=CASE WHEN p_patch ? 'name' THEN btrim(p_patch->>'name') ELSE name END,
  description=CASE WHEN p_patch ? 'description' THEN p_patch->>'description' ELSE description END,
  source_details=source,updated_at=now() WHERE id=p_collection_id;
 RETURN public.read_collection_details_v1(p_collection_id);
END;
$$;
REVOKE ALL ON FUNCTION public.read_collection_details_v1(uuid),public.update_collection_details_v1(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_collection_details_v1(uuid),public.update_collection_details_v1(uuid,text,jsonb) TO authenticated;
COMMIT;
