-- #674. Private execution queue; authenticated HTTP facades check dictionary ACL
-- before using these service-role-only RPCs. This migration is not enabled in
-- the deployment manifest until the worker and client contracts are integrated.
-- Local/fresh bootstrap includes it to keep canonical schema coverage complete.
BEGIN;

-- Trusted source and its SQL-derived row revision are read together. The same
-- projection is fenced under the source row lock during ready publication.
CREATE FUNCTION public.dictionary_translation_source_v1(p_entry_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH source AS (
    SELECT jsonb_build_object('id',id,'dictionary_id',dictionary_id,'language_code',language_code,
      'headword',headword,'meaning_id',meaning_id,'part_of_speech',part_of_speech,
      'gender',gender,'raw',raw,'is_nt2_2000',is_nt2_2000) AS word
    FROM public.word_entries WHERE id = p_entry_id
  ) SELECT jsonb_build_object('word',word,'revision',encode(sha256(convert_to(word::text,'UTF8')),'hex')) FROM source;
$$;
REVOKE ALL ON FUNCTION public.dictionary_translation_source_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dictionary_translation_source_v1(uuid) TO service_role;

CREATE TABLE public.dictionary_translation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_entry_id uuid NOT NULL REFERENCES public.word_entries(id) ON DELETE CASCADE,
  target_lang text NOT NULL CHECK (target_lang ~ '^[a-z]{2,3}(-[a-z0-9]{2,8}){0,3}$'),
  provider text NOT NULL CHECK (provider IN ('openai', 'deepl', 'gemini')),
  source_fingerprint text NOT NULL CHECK (length(source_fingerprint) BETWEEN 1 AND 128),
  source_row_revision text NOT NULL CHECK (length(source_row_revision) = 64),
  source_content_revision text NOT NULL CHECK (length(source_content_revision) BETWEEN 1 AND 128),
  translation_policy_version text NOT NULL CHECK (length(translation_policy_version) BETWEEN 1 AND 256),
  provider_revision text NOT NULL CHECK (length(provider_revision) BETWEEN 1 AND 128),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ready', 'failed', 'superseded')),
  priority smallint NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 10),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 3),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  error_code text CHECK (error_code IN ('provider_http_error', 'provider_response_error', 'provider_empty_response', 'provider_timeout', 'provider_network_error', 'provider_fallback_error', 'provider_unknown_error', 'source_changed')),
  CONSTRAINT dictionary_translation_job_identity UNIQUE
    (word_entry_id, target_lang, provider, source_fingerprint, source_content_revision, translation_policy_version, provider_revision, source_row_revision),
  CONSTRAINT dictionary_translation_job_lease CHECK (
    (status = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'running' AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);
CREATE INDEX dictionary_translation_jobs_available_idx
  ON public.dictionary_translation_jobs(priority DESC, available_at, created_at)
  WHERE status = 'queued';
CREATE INDEX dictionary_translation_jobs_expired_idx
  ON public.dictionary_translation_jobs(lease_expires_at)
  WHERE status = 'running';
CREATE UNIQUE INDEX dictionary_translation_jobs_active_identity_idx
  ON public.dictionary_translation_jobs(word_entry_id, target_lang, provider)
  WHERE status IN ('queued', 'running');
ALTER TABLE public.dictionary_translation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dictionary_translation_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dictionary_translation_jobs TO service_role;

CREATE FUNCTION public.enqueue_dictionary_translation_job_v1(
  p_word_entry_id uuid, p_target_lang text, p_provider text,
  p_source_fingerprint text, p_source_content_revision text,
  p_translation_policy_version text, p_provider_revision text,
  p_priority integer DEFAULT 0, p_retry_failed boolean DEFAULT false,
  p_refresh_ready boolean DEFAULT false, p_observed_cache_updated_at timestamptz DEFAULT NULL
) RETURNS public.dictionary_translation_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_job public.dictionary_translation_jobs; v_now timestamptz := clock_timestamp(); v_restart boolean; v_cache_updated_at timestamptz; v_source_revision text;
BEGIN
  -- Match publication/deletion lock order: source first, then job/cache.
  PERFORM id FROM public.word_entries WHERE id = p_word_entry_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'translation_source_missing'; END IF;
  v_source_revision := public.dictionary_translation_source_v1(p_word_entry_id)->>'revision';
  -- Serialize different revisions of the same shared cache slot, not all jobs.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_word_entry_id::text || ':' || p_target_lang || ':' || p_provider, 674));
  v_now := clock_timestamp();
  SELECT * INTO v_job FROM public.dictionary_translation_jobs
  WHERE word_entry_id = p_word_entry_id AND target_lang = p_target_lang AND provider = p_provider
    AND source_fingerprint = p_source_fingerprint AND source_content_revision = p_source_content_revision
    AND translation_policy_version = p_translation_policy_version AND provider_revision = p_provider_revision
    AND source_row_revision = v_source_revision
  FOR UPDATE;
  IF FOUND AND v_job.status <> 'superseded' THEN
    v_restart := v_job.status = 'failed' AND (p_retry_failed OR v_job.error_code = 'source_changed') AND v_job.finished_at <= v_now - interval '1 minute';
    IF v_job.status = 'ready' AND p_refresh_ready THEN
      SELECT updated_at INTO v_cache_updated_at FROM public.word_entry_translations
        WHERE word_entry_id = p_word_entry_id AND target_lang = p_target_lang AND provider = p_provider FOR UPDATE;
      -- An enqueue request that read the cache before a concurrent completion
      -- cannot invalidate the newly published ready result.
      v_restart := v_cache_updated_at IS NOT DISTINCT FROM p_observed_cache_updated_at;
    END IF;
    IF v_restart THEN
      UPDATE public.dictionary_translation_jobs SET status = 'superseded', lease_token = NULL,
        lease_expires_at = NULL, updated_at = v_now, finished_at = v_now
      WHERE word_entry_id = p_word_entry_id AND target_lang = p_target_lang AND provider = p_provider
        AND status IN ('queued', 'running');
    END IF;
    UPDATE public.dictionary_translation_jobs SET
      priority = greatest(priority, least(10, greatest(0, p_priority))),
      status = CASE WHEN v_restart THEN 'queued' ELSE status END,
      attempt = CASE WHEN v_restart THEN 0 ELSE attempt END,
      available_at = CASE WHEN v_restart THEN v_now ELSE available_at END,
      error_code = CASE WHEN v_restart THEN NULL ELSE error_code END,
      finished_at = CASE WHEN v_restart THEN NULL ELSE finished_at END,
      updated_at = CASE WHEN v_restart THEN v_now ELSE updated_at END
    WHERE id = v_job.id RETURNING * INTO v_job;
    RETURN v_job;
  END IF;
  UPDATE public.dictionary_translation_jobs SET status = 'superseded', lease_token = NULL,
    lease_expires_at = NULL, updated_at = v_now, finished_at = v_now
  WHERE word_entry_id = p_word_entry_id AND target_lang = p_target_lang AND provider = p_provider
    AND status IN ('queued', 'running');
  INSERT INTO public.dictionary_translation_jobs (
    word_entry_id, target_lang, provider, source_fingerprint, source_content_revision,
    translation_policy_version, provider_revision, source_row_revision, priority
  ) VALUES (p_word_entry_id, p_target_lang, p_provider, p_source_fingerprint, p_source_content_revision,
    p_translation_policy_version, p_provider_revision, v_source_revision, least(10, greatest(0, p_priority)))
  ON CONFLICT ON CONSTRAINT dictionary_translation_job_identity DO UPDATE SET
    status = 'queued', attempt = 0, available_at = v_now, lease_token = NULL,
    lease_expires_at = NULL, finished_at = NULL, error_code = NULL, updated_at = v_now,
    priority = excluded.priority
  RETURNING * INTO v_job;
  RETURN v_job;
END $$;

CREATE FUNCTION public.claim_dictionary_translation_job_v1()
RETURNS SETOF public.dictionary_translation_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  -- Fixed global provider concurrency, even if a deploy briefly overlaps workers.
  PERFORM pg_advisory_xact_lock(674, 1);
  v_now := clock_timestamp();
  UPDATE public.dictionary_translation_jobs SET
    status = CASE WHEN attempt >= 3 THEN 'failed' ELSE 'queued' END,
    available_at = v_now + interval '5 seconds', lease_token = NULL, lease_expires_at = NULL,
    error_code = 'provider_timeout', updated_at = v_now,
    finished_at = CASE WHEN attempt >= 3 THEN v_now ELSE NULL END
  WHERE status = 'running' AND lease_expires_at <= v_now;
  IF (SELECT count(*) FROM public.dictionary_translation_jobs WHERE status = 'running') >= 2 THEN RETURN; END IF;
  RETURN QUERY UPDATE public.dictionary_translation_jobs SET status = 'running',
    attempt = attempt + 1, lease_token = gen_random_uuid(),
    lease_expires_at = v_now + interval '60 seconds', started_at = v_now, updated_at = v_now
  WHERE id = (SELECT id FROM public.dictionary_translation_jobs
    WHERE status = 'queued' AND available_at <= v_now AND attempt < 3
      -- Speculation must leave capacity for a later visible-card request.
      AND (priority > 0 OR NOT EXISTS (
        SELECT 1 FROM public.dictionary_translation_jobs active
        WHERE active.status = 'running' AND active.priority = 0))
    ORDER BY priority DESC, available_at, created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING *;
END $$;

CREATE FUNCTION public.heartbeat_dictionary_translation_job_v1(p_job_id uuid, p_lease_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_job public.dictionary_translation_jobs;
BEGIN
  SELECT * INTO v_job FROM public.dictionary_translation_jobs
    WHERE id = p_job_id FOR UPDATE;
  -- Check the clock after acquiring the row lock: waiting for a transaction
  -- must never revive a lease that expired during that wait.
  IF NOT FOUND OR v_job.status <> 'running' OR v_job.lease_token IS DISTINCT FROM p_lease_token
      OR v_job.lease_expires_at <= clock_timestamp() THEN RETURN false; END IF;
  UPDATE public.dictionary_translation_jobs SET lease_expires_at = clock_timestamp() + interval '60 seconds',
    updated_at = clock_timestamp() WHERE id = p_job_id;
  RETURN true;
END $$;

CREATE FUNCTION public.fail_dictionary_translation_job_v1(p_job_id uuid, p_lease_token uuid, p_error_code text, p_retryable boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_job public.dictionary_translation_jobs;
BEGIN
  SELECT * INTO v_job FROM public.dictionary_translation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'running' OR v_job.lease_token IS DISTINCT FROM p_lease_token
      OR v_job.lease_expires_at <= clock_timestamp() THEN RETURN false; END IF;
  UPDATE public.dictionary_translation_jobs SET
    status = CASE WHEN p_retryable AND attempt < 3 THEN 'queued' ELSE 'failed' END,
    available_at = clock_timestamp() + make_interval(secs => CASE attempt WHEN 1 THEN 5 ELSE 20 END),
    error_code = p_error_code, lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp(),
    finished_at = CASE WHEN p_retryable AND attempt < 3 THEN NULL ELSE clock_timestamp() END
  WHERE id = p_job_id;
  RETURN true;
END $$;

-- Publish cache and complete job in one transaction. A replaced/expired owner
-- cannot publish an overlay, even if its provider call returns successfully.
CREATE FUNCTION public.complete_dictionary_translation_job_v1(p_job_id uuid, p_lease_token uuid, p_overlay jsonb, p_note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_job public.dictionary_translation_jobs; v_source_revision text;
BEGIN
  SELECT * INTO v_job FROM public.dictionary_translation_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM id FROM public.word_entries WHERE id = v_job.word_entry_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_source_revision := public.dictionary_translation_source_v1(v_job.word_entry_id)->>'revision';
  SELECT * INTO v_job FROM public.dictionary_translation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'running' OR v_job.lease_token IS DISTINCT FROM p_lease_token
      OR v_job.lease_expires_at <= clock_timestamp() THEN RETURN false; END IF;
  IF v_job.source_row_revision IS DISTINCT FROM v_source_revision THEN
    UPDATE public.dictionary_translation_jobs SET status = 'superseded', error_code = 'source_changed',
      lease_token = NULL, lease_expires_at = NULL, finished_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = p_job_id;
    RETURN false;
  END IF;
  IF p_overlay IS NULL OR jsonb_typeof(p_overlay) <> 'object' THEN
    RAISE EXCEPTION 'invalid translation overlay';
  END IF;
  INSERT INTO public.word_entry_translations (
    word_entry_id, target_lang, provider, status, overlay, note, source_fingerprint,
    source_content_revision, translation_policy_version, provider_revision, error_message, updated_at
  ) VALUES (v_job.word_entry_id, v_job.target_lang, v_job.provider, 'ready', p_overlay, p_note,
    v_job.source_fingerprint, v_job.source_content_revision, v_job.translation_policy_version,
    v_job.provider_revision, NULL, clock_timestamp())
  ON CONFLICT (word_entry_id, target_lang, provider) DO UPDATE SET status = 'ready', overlay = excluded.overlay,
    note = excluded.note, source_fingerprint = excluded.source_fingerprint,
    source_content_revision = excluded.source_content_revision, translation_policy_version = excluded.translation_policy_version,
    provider_revision = excluded.provider_revision, error_message = NULL, updated_at = excluded.updated_at;
  UPDATE public.dictionary_translation_jobs SET status = 'ready', lease_token = NULL, lease_expires_at = NULL,
    finished_at = clock_timestamp(), updated_at = clock_timestamp(), error_code = NULL WHERE id = p_job_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_dictionary_translation_job_v1(uuid,text,text,text,text,text,text,integer,boolean,boolean,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_dictionary_translation_job_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_dictionary_translation_job_v1(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_dictionary_translation_job_v1(uuid,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_dictionary_translation_job_v1(uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_dictionary_translation_job_v1(uuid,text,text,text,text,text,text,integer,boolean,boolean,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_dictionary_translation_job_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_dictionary_translation_job_v1(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_dictionary_translation_job_v1(uuid,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_dictionary_translation_job_v1(uuid,uuid,jsonb,text) TO service_role;
COMMIT;
