BEGIN;

-- Product information only. API roles cannot read or edit the underlying rows.
CREATE TABLE private.app_release_notes (
 version text PRIMARY KEY CHECK (version ~ '^(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})$'),
 version_key bigint[] GENERATED ALWAYS AS (string_to_array(version,'.')::bigint[]) STORED,
 commit_sha text NOT NULL CHECK (commit_sha ~ '^[0-9a-f]{40}$'),
 released_at timestamptz NOT NULL CHECK (isfinite(released_at)),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX app_release_notes_version_key_idx ON private.app_release_notes(version_key DESC);
CREATE TABLE private.app_release_note_translations (
 version text NOT NULL REFERENCES private.app_release_notes(version) ON DELETE CASCADE,
 locale text NOT NULL CHECK (locale IN ('en','ru','nl')),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 100 AND title !~ '[[:cntrl:]]'),
 summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 240 AND summary !~ '[[:cntrl:]]'),
 details text NOT NULL DEFAULT '' CHECK (length(details) <= 6000),
 details_url text CHECK (length(details_url) <= 2048 AND details_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'),
 PRIMARY KEY(version,locale)
);
ALTER TABLE private.app_release_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.app_release_note_translations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.app_release_notes,private.app_release_note_translations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.write_app_release_notes_v1(
 p_version text,p_commit text,p_released_at timestamptz,p_translations jsonb,
 p_expected_revision integer DEFAULT NULL,p_create_only boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,private,pg_temp AS $$
DECLARE current_note private.app_release_notes%rowtype; translation record; created boolean;
BEGIN
 IF p_version IS NULL OR p_version !~ '^(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})$'
 OR p_commit IS NULL OR p_commit !~ '^[0-9a-f]{40}$' OR p_released_at IS NULL
 OR NOT isfinite(p_released_at) OR p_create_only IS NULL
 OR p_translations IS NULL OR jsonb_typeof(p_translations)<>'object'
 OR octet_length(p_translations::text)>24000 THEN RAISE EXCEPTION 'invalid_release_notes' USING ERRCODE='22023'; END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_translations) key) IS DISTINCT FROM ARRAY['en','nl','ru'] THEN
  RAISE EXCEPTION 'release_notes_languages_required' USING ERRCODE='22023'; END IF;
 FOR translation IN SELECT key locale,value content FROM jsonb_each(p_translations) LOOP
  IF jsonb_typeof(translation.content)<>'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(translation.content) key WHERE key NOT IN ('title','summary','details','detailsUrl'))
   OR jsonb_typeof(translation.content->'title') IS DISTINCT FROM 'string'
   OR jsonb_typeof(translation.content->'summary') IS DISTINCT FROM 'string'
   OR (translation.content ? 'details' AND jsonb_typeof(translation.content->'details')<>'string')
   OR (translation.content ? 'detailsUrl' AND jsonb_typeof(translation.content->'detailsUrl')<>'string') THEN
   RAISE EXCEPTION 'invalid_release_translation' USING ERRCODE='22023'; END IF;
 END LOOP;
 INSERT INTO private.app_release_notes(version,commit_sha,released_at)
 VALUES(p_version,p_commit,p_released_at) ON CONFLICT(version) DO NOTHING;
 created:=FOUND;
 IF created AND p_expected_revision IS NOT NULL THEN RAISE EXCEPTION 'release_notes_revision_conflict' USING ERRCODE='40001'; END IF;
 SELECT * INTO current_note FROM private.app_release_notes WHERE version=p_version FOR UPDATE;
 IF current_note.commit_sha<>p_commit THEN RAISE EXCEPTION 'release_version_commit_conflict' USING ERRCODE='22023'; END IF;
 -- Reinstalling the same image must preserve live editorial corrections.
 IF NOT created AND p_create_only THEN RETURN jsonb_build_object('version',p_version,'revision',current_note.revision,'created',false); END IF;
 IF NOT created THEN
  IF p_expected_revision IS DISTINCT FROM current_note.revision THEN RAISE EXCEPTION 'release_notes_revision_conflict' USING ERRCODE='40001'; END IF;
  UPDATE private.app_release_notes SET released_at=p_released_at,revision=revision+1,updated_at=clock_timestamp()
   WHERE version=p_version RETURNING * INTO current_note;
 END IF;
 FOR translation IN SELECT key locale,value content FROM jsonb_each(p_translations) LOOP
  INSERT INTO private.app_release_note_translations(version,locale,title,summary,details,details_url)
   VALUES(p_version,translation.locale,translation.content->>'title',translation.content->>'summary',
    COALESCE(translation.content->>'details',''),translation.content->>'detailsUrl')
   ON CONFLICT(version,locale) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary,details=EXCLUDED.details,details_url=EXCLUDED.details_url;
 END LOOP;
 PERFORM private.send_app_event_v1('app:releases','release.available',p_commit,NULL,current_note.revision::text);
 RETURN jsonb_build_object('version',p_version,'revision',current_note.revision,'created',created);
END;
$$;

CREATE FUNCTION public.read_app_release_notes_v1(p_max_version text,p_locale text DEFAULT 'en',p_limit integer DEFAULT 5,p_before_version text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,private,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_max_version IS NULL OR p_max_version !~ '^(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})$'
 OR p_locale IS NULL OR p_locale NOT IN ('en','ru','nl') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
 OR (p_before_version IS NOT NULL AND p_before_version !~ '^(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})$') THEN
  RAISE EXCEPTION 'invalid_release_catalog_request' USING ERRCODE='22023'; END IF;
 WITH selected AS MATERIALIZED (
  SELECT n.*,t.title,t.summary,t.details,t.details_url FROM private.app_release_notes n
  JOIN private.app_release_note_translations t ON t.version=n.version AND t.locale=p_locale
  WHERE n.version_key<=string_to_array(p_max_version,'.')::bigint[] AND n.released_at<=now()
   AND (p_before_version IS NULL OR n.version_key<string_to_array(p_before_version,'.')::bigint[])
  ORDER BY n.version_key DESC LIMIT p_limit+1
 ), page AS MATERIALIZED (SELECT * FROM selected ORDER BY version_key DESC LIMIT p_limit)
 SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
  'id','release-'||version,'version',version,'publishedAt',released_at,'locale',p_locale,'title',title,'summary',summary,
  'details',details,'detailsUrl',details_url,'revision',revision)) ORDER BY version_key DESC) FROM page),'[]'::jsonb),
  'nextVersion',CASE WHEN (SELECT count(*) FROM selected)>p_limit THEN (SELECT version FROM page ORDER BY version_key LIMIT 1) END) INTO result;
 RETURN result;
END;
$$;

CREATE FUNCTION public.read_app_release_notes_editor_v1(p_version text) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
 SELECT jsonb_build_object('version',n.version,'commit',n.commit_sha,'publishedAt',n.released_at,'revision',n.revision,
  'translations',(SELECT jsonb_object_agg(t.locale,jsonb_strip_nulls(jsonb_build_object('title',t.title,'summary',t.summary,'details',t.details,'detailsUrl',t.details_url)))
   FROM private.app_release_note_translations t WHERE t.version=n.version)) FROM private.app_release_notes n WHERE n.version=p_version;
$$;
REVOKE ALL ON FUNCTION public.write_app_release_notes_v1(text,text,timestamptz,jsonb,integer,boolean),
 public.read_app_release_notes_v1(text,text,integer,text),public.read_app_release_notes_editor_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.write_app_release_notes_v1(text,text,timestamptz,jsonb,integer,boolean),
 public.read_app_release_notes_v1(text,text,integer,text),public.read_app_release_notes_editor_v1(text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
