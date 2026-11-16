BEGIN;

-- Fresh-install operator capabilities; managed installations require their own forward migration.
ALTER TABLE public.admin_operators DROP CONSTRAINT admin_operators_permissions_allowed;
ALTER TABLE public.admin_operators ADD CONSTRAINT admin_operators_permissions_allowed CHECK (permissions <@ ARRAY['dictionaries.read','audit.read','publication.manage','dictionary.content.read','users.read','admission.manage','feedback.read','editorial.edit']::text[]);
ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_allowed;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_allowed CHECK (action = ANY (ARRAY['auth.sign_in','auth.sign_in_denied','auth.sign_out','access.denied','dictionary.registry.read','dictionary.metadata.read','dictionary.content.read','dictionary.publication.updated','dictionary.audience.updated','audit.journal.read','user.registry.read','user.profile.read','admission.approve','admission.reject','admission.revoke','admission.invite','admission.mode','admission.auto_approve','feedback.registry.read','feedback.detail.read','operator.permissions.updated']::text[]));

CREATE FUNCTION public.admin_feedback_review_page_v1(p_kind text, p_status text, p_from timestamptz, p_to timestamptz, p_word text, p_comment text, p_sort text, p_ascending boolean, p_page integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result jsonb;
BEGIN
  IF COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role') IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_page NOT BETWEEN 1 AND 10000 OR p_sort NOT IN ('created_at','kind','status') OR p_comment NOT IN ('all','yes','no') OR length(p_word)>100 THEN RAISE EXCEPTION 'invalid_filter'; END IF;
  WITH source AS (
    SELECT f.id, f.report_id, f.created_at, f.kind, f.problem_type, f.status, f.comment_present, e.expires_at,
      e.canonical_payload::jsonb #>> '{feedback,comment}' AS comment,
      (SELECT a->>'text' FROM jsonb_array_elements(COALESCE(e.canonical_payload::jsonb #> '{cardContent,atoms}', '[]'::jsonb)) a WHERE a->>'role'='headword' LIMIT 1) AS word
    FROM public.feedback_items f LEFT JOIN public.diagnostic_envelopes e ON e.feedback_item_id=f.id
    WHERE (p_kind='' OR f.kind=p_kind) AND (p_status='' OR f.status=p_status)
      AND (p_from IS NULL OR f.created_at>=p_from) AND (p_to IS NULL OR f.created_at<p_to)
      AND (p_comment='all' OR f.comment_present=(p_comment='yes'))
  ), filtered AS (
    SELECT * FROM source WHERE p_word='' OR strpos(lower(COALESCE(word,'')),lower(p_word))>0
  ), paged AS (
    SELECT * FROM filtered ORDER BY
      CASE WHEN p_sort='created_at' AND p_ascending THEN created_at END ASC,
      CASE WHEN p_sort='created_at' AND NOT p_ascending THEN created_at END DESC,
      CASE WHEN p_sort='kind' AND p_ascending THEN kind END ASC,
      CASE WHEN p_sort='kind' AND NOT p_ascending THEN kind END DESC,
      CASE WHEN p_sort='status' AND p_ascending THEN status END ASC,
      CASE WHEN p_sort='status' AND NOT p_ascending THEN status END DESC,
      id ASC OFFSET (p_page-1)*25 LIMIT 26
  ) SELECT COALESCE(jsonb_agg(to_jsonb(paged)), '[]'::jsonb) INTO result FROM paged;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_feedback_review_page_v1(text,text,timestamptz,timestamptz,text,text,text,boolean,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_feedback_review_page_v1(text,text,timestamptz,timestamptz,text,text,text,boolean,integer) TO service_role;

COMMIT;
