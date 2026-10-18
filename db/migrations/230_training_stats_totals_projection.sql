-- #737: keep totals/settings while local daily metrics remain authoritative.
-- Does not change the local daily helper, scheduler, or public signatures.
-- Depends on reserved migration229; deployment manifest intentionally unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION private.training_stats_totals_v1(
    p_user_id uuid,
    p_modes text[] DEFAULT ARRAY['word-to-definition'],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_daily_new_limit int;
    v_total_words_learned int;
    v_total_words_in_list int;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF p_modes IS NULL OR array_length(p_modes, 1) IS NULL THEN
        p_modes := ARRAY['word-to-definition'];
    END IF;

    IF p_list_id IS NOT NULL AND p_list_type IS NULL THEN
        p_list_type := 'curated';
    END IF;

    SELECT COALESCE(daily_new_limit, 10) INTO v_daily_new_limit
    FROM user_settings WHERE user_id = p_user_id;
    v_daily_new_limit := COALESCE(v_daily_new_limit, 10);

    WITH accessible_entries AS (
        SELECT w.id
        FROM word_entries w
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
    )
    SELECT COUNT(DISTINCT s.entry_id)
    INTO v_total_words_learned
    FROM user_card_status s
    JOIN accessible_entries ae ON ae.id = s.entry_id
    WHERE s.user_id = p_user_id
      AND s.card_type_id = ANY(p_modes)
      AND s.fsrs_enabled = true;

    WITH accessible_entries AS (
        SELECT w.id
        FROM word_entries w
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
    )
    SELECT COUNT(*) INTO v_total_words_in_list FROM accessible_entries;

    RETURN jsonb_build_object(
        'dailyNewLimit', v_daily_new_limit,
        'totalWordsLearned', v_total_words_learned,
        'totalWordsInList', v_total_words_in_list
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_detailed_training_stats(
  p_user_id uuid,
  p_modes text[],
  p_list_id uuid,
  p_list_type text,
  p_timezone text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  base_stats jsonb;
  local_stats jsonb;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;

  base_stats := private.training_stats_totals_v1(
    p_user_id, p_modes, p_list_id, p_list_type
  );
  local_stats := private.training_local_daily_stats_v1(
    p_user_id,
    p_modes,
    p_list_id,
    p_list_type,
    private.training_user_timezone_v1(p_user_id)
  );
  RETURN COALESCE(base_stats, '{}'::jsonb) || COALESCE(local_stats, '{}'::jsonb);
END;
$$;

ALTER FUNCTION private.training_stats_totals_v1(uuid, text[], uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.training_stats_totals_v1(uuid, text[], uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION private.training_stats_totals_v1(uuid, text[], uuid, text) IS
  'Private ordinary stats totals/settings projection; preserves migration130 scope and parameter normalization without discarded UTC daily reads.';
-- CREATE OR REPLACE preserves existing overload owner and ACL. The legacy
-- private primitive remains unchanged for compatibility; normal RPCs bypass it.
COMMIT;
