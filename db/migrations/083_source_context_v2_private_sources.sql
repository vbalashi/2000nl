-- Extend source-context-v2 source canonicalization to privacy-safe private
-- sources used by external clients such as Pontix. The HTTP boundary already
-- normalizes these fields; this trigger protects direct RPC callers too.

CREATE OR REPLACE FUNCTION private.normalize_source_context_v2_learning_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
    IF NEW.metadata->>'contractVersion' IS DISTINCT FROM 'source-context-v2' THEN
        RETURN NEW;
    END IF;

    IF NEW.kind = 'youtube_video' THEN
        IF NEW.provider IS DISTINCT FROM 'youtube'
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
    END IF;

    IF NEW.kind = 'web_page' THEN
        IF NEW.provider IS DISTINCT FROM 'web'
           OR NEW.external_id IS NULL
           OR NEW.external_id !~ '^private:web_page:[a-f0-9]{64}$'
           OR NEW.canonical_url IS NULL
           OR NEW.canonical_url !~ '^https?://'
           OR NEW.canonical_url ~ '#'
           OR NEW.canonical_url ~ '://[^/]*@' THEN
            RAISE EXCEPTION 'invalid_v2_private_source';
        END IF;
    ELSIF NEW.kind = 'text_document' THEN
        IF NEW.provider IS DISTINCT FROM 'pontix'
           OR NEW.external_id IS NULL
           OR NEW.external_id !~ '^private:text_document:[a-f0-9]{64}$'
           OR NEW.canonical_url IS NOT NULL THEN
            RAISE EXCEPTION 'invalid_v2_private_source';
        END IF;
    ELSIF NEW.kind = 'ebook' THEN
        IF NEW.provider IS NULL
           OR NEW.external_id IS NULL
           OR NEW.external_id !~ '^private:ebook:[a-f0-9]{64}$'
           OR NEW.canonical_url IS NOT NULL THEN
            RAISE EXCEPTION 'invalid_v2_private_source';
        END IF;
    ELSE
        RAISE EXCEPTION 'invalid_v2_canonical_source';
    END IF;

    NEW.title := NULL;
    NEW.language_code := NULLIF(left(lower(replace(COALESCE(NEW.language_code, ''), '_', '-')), 16), '');
    NEW.metadata := jsonb_build_object(
        'contractVersion', 'source-context-v2',
        'privateSource', true
    );
    NEW.source_identity_key := md5(concat_ws(
        '|',
        NEW.kind,
        NEW.provider,
        NEW.external_id,
        COALESCE(NEW.canonical_url, '')
    ));

    RETURN NEW;
END;
$$;
