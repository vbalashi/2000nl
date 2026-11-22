BEGIN;

ALTER TABLE private.app_release_notes ADD COLUMN audiences text[] NOT NULL DEFAULT '{}';

CREATE FUNCTION public.set_app_release_audiences_v1(p_version text,p_audiences text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_version IS NULL OR p_version !~ '^(0|[1-9][0-9]{0,7})[.](0|[1-9][0-9]{0,7})[.](0|[1-9][0-9]{0,7})$'
 OR p_audiences IS NULL OR cardinality(p_audiences)>12
 OR EXISTS(SELECT 1 FROM unnest(p_audiences) tag WHERE tag IS NULL OR tag !~ '^[a-z][a-z0-9-]{0,31}$')
 OR cardinality(p_audiences)<>(SELECT count(DISTINCT tag) FROM unnest(p_audiences) tag)
 THEN RAISE EXCEPTION 'invalid_release_audiences' USING ERRCODE='22023'; END IF;
 UPDATE private.app_release_notes SET audiences=p_audiences
  WHERE version=p_version AND audiences IS DISTINCT FROM p_audiences;
END;
$$;

CREATE FUNCTION private.read_app_release_catalog(p_max_version text,p_locale text,p_limit integer,p_before_version text,p_public_only boolean)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,private,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_max_version IS NULL OR p_max_version !~ '^(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})$'
 OR p_locale IS NULL OR p_locale NOT IN ('en','ru','nl') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
 OR (p_before_version IS NOT NULL AND p_before_version !~ '^(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})$') THEN
  RAISE EXCEPTION 'invalid_release_catalog_request' USING ERRCODE='22023'; END IF;
 WITH selected AS MATERIALIZED (
  SELECT n.*, COALESCE(t.locale, e.locale) AS content_locale,
   COALESCE(t.title, e.title) AS title, COALESCE(t.summary, e.summary) AS summary,
   CASE WHEN t.locale IS NULL THEN e.details ELSE t.details END AS details,
   CASE WHEN t.locale IS NULL THEN e.details_url ELSE t.details_url END AS details_url
  FROM private.app_release_notes n
  JOIN private.app_release_note_translations e ON e.version=n.version AND e.locale='en'
  LEFT JOIN private.app_release_note_translations t ON t.version=n.version AND t.locale=p_locale
  WHERE n.version_key<=string_to_array(p_max_version,'.')::bigint[] AND n.released_at<=now()
   AND (NOT p_public_only OR n.audiences @> ARRAY['user-app']::text[])
   AND (p_before_version IS NULL OR n.version_key<string_to_array(p_before_version,'.')::bigint[])
  ORDER BY n.version_key DESC LIMIT p_limit+1
 ), page AS MATERIALIZED (SELECT * FROM selected ORDER BY version_key DESC LIMIT p_limit)
 SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
  'id','release-'||version,'version',version,'publishedAt',released_at,'locale',content_locale,'title',title,'summary',summary,
  'details',details,'detailsUrl',details_url,'revision',revision,
  'audiences',CASE WHEN NOT p_public_only THEN to_jsonb(audiences) END)) ORDER BY version_key DESC) FROM page),'[]'::jsonb),
  'nextVersion',CASE WHEN (SELECT count(*) FROM selected)>p_limit THEN (SELECT version FROM page ORDER BY version_key LIMIT 1) END) INTO result;
 RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_app_release_notes_v1(p_max_version text,p_locale text DEFAULT 'en',p_limit integer DEFAULT 5,p_before_version text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
 SELECT private.read_app_release_catalog(p_max_version,p_locale,p_limit,p_before_version,true);
$$;

CREATE FUNCTION public.read_admin_app_release_notes_v1(p_max_version text,p_locale text,p_limit integer,p_before_version text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT private.read_app_release_catalog(p_max_version,p_locale,p_limit,p_before_version,false);
$$;

REVOKE ALL ON FUNCTION private.read_app_release_catalog(text,text,integer,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.set_app_release_audiences_v1(text,text[]),
 public.read_admin_app_release_notes_v1(text,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_app_release_audiences_v1(text,text[]),
 public.read_admin_app_release_notes_v1(text,text,integer,text) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
