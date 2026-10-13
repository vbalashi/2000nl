-- #674. Successful bounded provider parts survive leases/retries. No client access.
BEGIN;
CREATE TABLE public.dictionary_translation_job_parts (
 job_id uuid NOT NULL REFERENCES public.dictionary_translation_jobs(id) ON DELETE CASCADE,
 part_key text NOT NULL CHECK (length(part_key) BETWEEN 1 AND 128),
 part_fingerprint text NOT NULL CHECK (part_fingerprint ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL CHECK (jsonb_typeof(result)='object' AND octet_length(result::text)<=524288),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(job_id,part_key)
);
ALTER TABLE public.dictionary_translation_job_parts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dictionary_translation_job_parts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.dictionary_translation_job_parts TO service_role;

CREATE FUNCTION public.checkpoint_dictionary_translation_part_v1(
 p_job_id uuid,p_lease_token uuid,p_part_key text,p_part_fingerprint text,p_result jsonb,p_continue boolean DEFAULT true
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_job public.dictionary_translation_jobs; v_entry_id uuid; v_now timestamptz;
BEGIN
 SELECT word_entry_id INTO v_entry_id FROM public.dictionary_translation_jobs WHERE id=p_job_id;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Preserve source -> job lock order used by enqueue and final publication.
 PERFORM id FROM public.word_entries WHERE id=v_entry_id FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO v_job FROM public.dictionary_translation_jobs WHERE id=p_job_id FOR UPDATE;
 v_now:=clock_timestamp();
 IF v_job.status<>'running' OR v_job.lease_token IS DISTINCT FROM p_lease_token OR v_job.lease_expires_at<=v_now
 OR v_job.source_row_revision IS DISTINCT FROM (public.dictionary_translation_source_v1(v_entry_id)->>'revision')
 THEN RETURN false; END IF;
 INSERT INTO public.dictionary_translation_job_parts(job_id,part_key,part_fingerprint,result)
 VALUES(p_job_id,p_part_key,p_part_fingerprint,p_result)
 ON CONFLICT(job_id,part_key) DO UPDATE SET part_fingerprint=EXCLUDED.part_fingerprint,result=EXCLUDED.result;
 IF p_continue THEN
   -- Successful continuation consumes no failure retry. Yield between parts so
   -- foreground cards can use the existing global concurrency/priority ceiling.
   UPDATE public.dictionary_translation_jobs SET status='queued',attempt=greatest(0,attempt-1),
     lease_token=NULL,lease_expires_at=NULL,available_at=v_now,updated_at=v_now
   WHERE id=p_job_id;
 END IF;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.checkpoint_dictionary_translation_part_v1(uuid,uuid,text,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_dictionary_translation_part_v1(uuid,uuid,text,text,jsonb,boolean) TO service_role;
COMMIT;
