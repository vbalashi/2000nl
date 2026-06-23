-- Defense in depth for source-context-v2 source rows. The HTTP normalizer strips
-- volatile source metadata before calling the RPC, but authenticated clients can
-- execute the definer RPC directly. Keep v2 canonical source rows server-owned.

CREATE OR REPLACE FUNCTION private.normalize_source_context_v2_learning_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
    IF NEW.metadata->>'contractVersion' IS DISTINCT FROM 'source-context-v2' THEN
        RETURN NEW;
    END IF;

    IF NEW.kind IS DISTINCT FROM 'youtube_video'
       OR NEW.provider IS DISTINCT FROM 'youtube'
       OR NEW.external_id IS NULL
       OR NEW.external_id !~ '^[A-Za-z0-9_-]{11}$' THEN
        RAISE EXCEPTION 'invalid_v2_canonical_source';
    END IF;

    NEW.canonical_url := 'https://www.youtube.com/watch?v=' || NEW.external_id;
    NEW.title := NULL;
    NEW.language_code := NULLIF(left(lower(replace(COALESCE(NEW.language_code, ''), '_', '-')), 16), '');
    NEW.metadata := jsonb_build_object('contractVersion', 'source-context-v2');
    NEW.source_identity_key := md5(concat_ws(
        '|',
        NEW.kind,
        NEW.provider,
        NEW.external_id,
        NEW.canonical_url
    ));

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS learning_sources_source_context_v2_normalize
    ON learning_sources;

CREATE TRIGGER learning_sources_source_context_v2_normalize
    BEFORE INSERT OR UPDATE ON learning_sources
    FOR EACH ROW
    EXECUTE FUNCTION private.normalize_source_context_v2_learning_source();
