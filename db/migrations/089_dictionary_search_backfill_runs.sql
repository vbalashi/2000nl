-- Resumable dictionary search document backfill.
--
-- Each call to run_dictionary_search_backfill_batch processes a bounded slice.
-- Operators should call it in separate transactions, so production backfills do
-- not require one long transaction.

CREATE TABLE IF NOT EXISTS dictionary_search_backfill_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_version int NOT NULL DEFAULT 2 CHECK (extraction_version > 0),
    batch_size int NOT NULL DEFAULT 500 CHECK (batch_size BETWEEN 1 AND 1000),
    status text NOT NULL DEFAULT 'running' CHECK (
        status IN ('running', 'completed', 'failed')
    ),
    total_entry_count int NOT NULL DEFAULT 0 CHECK (total_entry_count >= 0),
    processed_entry_count int NOT NULL DEFAULT 0 CHECK (processed_entry_count >= 0),
    last_language_code text,
    last_headword text,
    last_meaning_id int,
    last_entry_id uuid,
    last_error text,
    started_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS dictionary_search_backfill_runs_status_idx
    ON dictionary_search_backfill_runs(status, updated_at DESC);

CREATE OR REPLACE FUNCTION start_dictionary_search_backfill(
    p_extraction_version int DEFAULT 2,
    p_batch_size int DEFAULT 500
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_run_id uuid;
BEGIN
    INSERT INTO dictionary_search_backfill_runs (
        extraction_version,
        batch_size,
        total_entry_count
    )
    VALUES (
        GREATEST(COALESCE(p_extraction_version, 2), 1),
        LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 1000),
        (SELECT COUNT(*)::int FROM word_entries)
    )
    RETURNING id INTO v_run_id;

    RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION run_dictionary_search_backfill_batch(
    p_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_run dictionary_search_backfill_runs%rowtype;
    v_entry record;
    v_processed int := 0;
    v_has_more boolean := false;
BEGIN
    SELECT *
    INTO v_run
    FROM dictionary_search_backfill_runs
    WHERE id = p_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'dictionary search backfill run not found: %', p_run_id;
    END IF;

    IF v_run.status <> 'running' THEN
        RETURN jsonb_build_object(
            'runId', v_run.id,
            'status', v_run.status,
            'processedEntryCount', v_run.processed_entry_count,
            'totalEntryCount', v_run.total_entry_count,
            'processedInBatch', 0,
            'hasMore', false
        );
    END IF;

    FOR v_entry IN
        SELECT id, language_code, headword, meaning_id
        FROM word_entries
        WHERE v_run.last_entry_id IS NULL
           OR (language_code, headword, meaning_id, id) >
              (v_run.last_language_code, v_run.last_headword, v_run.last_meaning_id, v_run.last_entry_id)
        ORDER BY language_code, headword, meaning_id, id
        LIMIT v_run.batch_size
    LOOP
        PERFORM refresh_dictionary_search_document(v_entry.id, v_run.extraction_version);
        v_processed := v_processed + 1;
        v_run.last_language_code := v_entry.language_code;
        v_run.last_headword := v_entry.headword;
        v_run.last_meaning_id := v_entry.meaning_id;
        v_run.last_entry_id := v_entry.id;
    END LOOP;

    IF v_processed > 0 THEN
        SELECT EXISTS (
            SELECT 1
            FROM word_entries
            WHERE (language_code, headword, meaning_id, id) >
                  (v_run.last_language_code, v_run.last_headword, v_run.last_meaning_id, v_run.last_entry_id)
        )
        INTO v_has_more;
    ELSE
        v_has_more := false;
    END IF;

    UPDATE dictionary_search_backfill_runs
    SET processed_entry_count = processed_entry_count + v_processed,
        last_language_code = v_run.last_language_code,
        last_headword = v_run.last_headword,
        last_meaning_id = v_run.last_meaning_id,
        last_entry_id = v_run.last_entry_id,
        status = CASE WHEN v_has_more THEN 'running' ELSE 'completed' END,
        completed_at = CASE WHEN v_has_more THEN completed_at ELSE now() END,
        updated_at = now(),
        last_error = NULL
    WHERE id = v_run.id
    RETURNING *
    INTO v_run;

    RETURN jsonb_build_object(
        'runId', v_run.id,
        'status', v_run.status,
        'processedEntryCount', v_run.processed_entry_count,
        'totalEntryCount', v_run.total_entry_count,
        'processedInBatch', v_processed,
        'lastEntryId', v_run.last_entry_id,
        'hasMore', v_has_more
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_dictionary_search_backfill_status(
    p_run_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'runId', id,
                'status', status,
                'extractionVersion', extraction_version,
                'batchSize', batch_size,
                'processedEntryCount', processed_entry_count,
                'totalEntryCount', total_entry_count,
                'lastEntryId', last_entry_id,
                'lastError', last_error,
                'startedAt', started_at,
                'updatedAt', updated_at,
                'completedAt', completed_at
            )
            ORDER BY updated_at DESC
        ),
        '[]'::jsonb
    )
    FROM dictionary_search_backfill_runs
    WHERE p_run_id IS NULL OR id = p_run_id;
$$;

ALTER TABLE dictionary_search_backfill_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dictionary_search_backfill_runs FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION start_dictionary_search_backfill(int, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION run_dictionary_search_backfill_batch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_dictionary_search_backfill_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION start_dictionary_search_backfill(int, int) TO service_role;
GRANT EXECUTE ON FUNCTION run_dictionary_search_backfill_batch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_dictionary_search_backfill_status(uuid) TO service_role;
