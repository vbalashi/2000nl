-- Durable, reversible Platform V2 Known Marks.
--
-- A Known Mark is an overlay on one exact card target. It never rewrites the
-- preserved scheduler/FSRS fields in user_card_status.

BEGIN;

CREATE OR REPLACE FUNCTION private.bump_user_card_state_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.state_revision := COALESCE(NEW.state_revision, gen_random_uuid());
    ELSIF NEW IS DISTINCT FROM OLD
       AND NEW.state_revision IS NOT DISTINCT FROM OLD.state_revision THEN
        NEW.state_revision := gen_random_uuid();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_user_card_state_revision ON public.user_card_status;
CREATE TRIGGER bump_user_card_state_revision
BEFORE INSERT OR UPDATE ON public.user_card_status
FOR EACH ROW
EXECUTE FUNCTION private.bump_user_card_state_revision();

CREATE TABLE IF NOT EXISTS public.user_card_known_marks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entry_id uuid NOT NULL REFERENCES public.word_entries(id) ON DELETE CASCADE,
    card_type_id text NOT NULL,
    revision uuid NOT NULL DEFAULT gen_random_uuid(),
    marked_at timestamptz NOT NULL DEFAULT now(),
    mark_event_id uuid NOT NULL UNIQUE
        REFERENCES public.user_card_action_events(id) ON DELETE RESTRICT,
    cleared_at timestamptz,
    undo_event_id uuid UNIQUE
        REFERENCES public.user_card_action_events(id) ON DELETE RESTRICT,
    CHECK (
        (cleared_at IS NULL AND undo_event_id IS NULL)
        OR (cleared_at IS NOT NULL AND undo_event_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS user_card_known_marks_active_target_uniq
    ON public.user_card_known_marks(user_id, entry_id, card_type_id)
    WHERE cleared_at IS NULL;

CREATE INDEX IF NOT EXISTS user_card_known_marks_target_history_idx
    ON public.user_card_known_marks(
        user_id,
        entry_id,
        card_type_id,
        marked_at DESC
    );

CREATE OR REPLACE FUNCTION private.reject_known_card_scheduler_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_old_is_known boolean := false;
    v_new_is_known boolean := false;
BEGIN
    IF TG_OP = 'DELETE'
       AND (
           NOT EXISTS (
               SELECT 1
                 FROM auth.users u
                WHERE u.id = OLD.user_id
           )
           OR NOT EXISTS (
               SELECT 1
                 FROM public.word_entries e
                WHERE e.id = OLD.entry_id
           )
       ) THEN
        RETURN OLD;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.user_card_known_marks k
         WHERE k.user_id = OLD.user_id
           AND k.entry_id = OLD.entry_id
           AND k.card_type_id = OLD.card_type_id
           AND k.cleared_at IS NULL
    )
    INTO v_old_is_known;

    IF TG_OP = 'UPDATE' THEN
        SELECT EXISTS (
            SELECT 1
              FROM public.user_card_known_marks k
             WHERE k.user_id = NEW.user_id
               AND k.entry_id = NEW.entry_id
               AND k.card_type_id = NEW.card_type_id
               AND k.cleared_at IS NULL
        )
        INTO v_new_is_known;
    END IF;

    IF NOT v_old_is_known AND NOT v_new_is_known THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE'
       AND ROW(NEW.user_id, NEW.entry_id, NEW.card_type_id)
           IS DISTINCT FROM
           ROW(OLD.user_id, OLD.entry_id, OLD.card_type_id) THEN
        RAISE EXCEPTION 'card_is_known';
    END IF;

    IF TG_OP = 'DELETE' OR ROW(
        NEW.fsrs_stability,
        NEW.fsrs_difficulty,
        NEW.fsrs_reps,
        NEW.fsrs_lapses,
        NEW.fsrs_last_grade,
        NEW.fsrs_last_interval,
        NEW.fsrs_target_retention,
        NEW.fsrs_params_version,
        NEW.fsrs_enabled,
        NEW.next_review_at,
        NEW.last_reviewed_at,
        NEW.success_count,
        NEW.last_result,
        NEW.hidden,
        NEW.frozen_until,
        NEW.in_learning,
        NEW.learning_due_at
    ) IS DISTINCT FROM ROW(
        OLD.fsrs_stability,
        OLD.fsrs_difficulty,
        OLD.fsrs_reps,
        OLD.fsrs_lapses,
        OLD.fsrs_last_grade,
        OLD.fsrs_last_interval,
        OLD.fsrs_target_retention,
        OLD.fsrs_params_version,
        OLD.fsrs_enabled,
        OLD.next_review_at,
        OLD.last_reviewed_at,
        OLD.success_count,
        OLD.last_result,
        OLD.hidden,
        OLD.frozen_until,
        OLD.in_learning,
        OLD.learning_due_at
    ) THEN
        RAISE EXCEPTION 'card_is_known';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.reject_known_card_scheduler_mutation()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS reject_known_card_scheduler_mutation
    ON public.user_card_status;
CREATE TRIGGER reject_known_card_scheduler_mutation
BEFORE UPDATE OR DELETE ON public.user_card_status
FOR EACH ROW
EXECUTE FUNCTION private.reject_known_card_scheduler_mutation();

CREATE TABLE IF NOT EXISTS public.platform_v2_action_receipts (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_event_id uuid NOT NULL,
    action_payload_hash text NOT NULL,
    event_id uuid NOT NULL UNIQUE
        REFERENCES public.user_card_action_events(id) ON DELETE RESTRICT,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, client_event_id)
);

ALTER TABLE public.user_card_known_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_v2_action_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_card_known_marks FROM anon, authenticated;
REVOKE ALL ON public.platform_v2_action_receipts FROM anon, authenticated;

DROP POLICY IF EXISTS user_card_known_marks_select_self
    ON public.user_card_known_marks;
CREATE POLICY user_card_known_marks_select_self
    ON public.user_card_known_marks
    FOR SELECT TO authenticated
    USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS platform_v2_action_receipts_select_self
    ON public.platform_v2_action_receipts;
CREATE POLICY platform_v2_action_receipts_select_self
    ON public.platform_v2_action_receipts
    FOR SELECT TO authenticated
    USING (user_id = (select auth.uid()));

DO $$
BEGIN
    IF to_regprocedure(
        'public.get_next_card_without_known(uuid,text[],uuid[],uuid,text,text,text,text[])'
    ) IS NULL THEN
        ALTER FUNCTION public.get_next_card(
            uuid,
            text[],
            uuid[],
            uuid,
            text,
            text,
            text,
            text[]
        ) RENAME TO get_next_card_without_known;
    END IF;

    IF to_regprocedure(
        'public.get_next_filtered_card_without_known(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb)'
    ) IS NULL THEN
        ALTER FUNCTION public.get_next_filtered_card(
            uuid,
            text[],
            uuid[],
            uuid,
            text,
            text,
            text,
            text[],
            jsonb
        ) RENAME TO get_next_filtered_card_without_known;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_card_without_known(
    uuid,
    text[],
    uuid[],
    uuid,
    text,
    text,
    text,
    text[]
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_next_filtered_card_without_known(
    uuid,
    text[],
    uuid[],
    uuid,
    text,
    text,
    text,
    text[],
    jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_next_card(
    p_user_id uuid,
    p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'::text],
    p_exclude_entry_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL::uuid,
    p_list_type text DEFAULT 'curated'::text,
    p_card_filter text DEFAULT 'both'::text,
    p_queue_turn text DEFAULT 'auto'::text,
    p_exclude_card_keys text[] DEFAULT ARRAY[]::text[]
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_card_type_ids text[] := CASE
        WHEN p_card_type_ids IS NULL
          OR array_length(p_card_type_ids, 1) IS NULL
            THEN ARRAY['word-to-definition'::text]
        ELSE p_card_type_ids
    END;
    v_known_card_keys text[];
BEGIN
    SELECT COALESCE(
        array_agg(k.entry_id::text || ':' || k.card_type_id),
        ARRAY[]::text[]
    )
      INTO v_known_card_keys
      FROM public.user_card_known_marks k
     WHERE k.user_id = p_user_id
       AND k.card_type_id = ANY(v_card_type_ids)
       AND k.cleared_at IS NULL;

    RETURN QUERY
    SELECT *
      FROM public.get_next_card_without_known(
          p_user_id,
          v_card_type_ids,
          p_exclude_entry_ids,
          p_list_id,
          p_list_type,
          p_card_filter,
          p_queue_turn,
          COALESCE(p_exclude_card_keys, ARRAY[]::text[])
              || v_known_card_keys
      );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_filtered_card(
    p_user_id uuid,
    p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'::text],
    p_exclude_entry_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL::uuid,
    p_list_type text DEFAULT 'curated'::text,
    p_card_filter text DEFAULT 'both'::text,
    p_queue_turn text DEFAULT 'auto'::text,
    p_exclude_card_keys text[] DEFAULT ARRAY[]::text[],
    p_training_filter jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_card_type_ids text[] := CASE
        WHEN p_card_type_ids IS NULL
          OR array_length(p_card_type_ids, 1) IS NULL
            THEN ARRAY['word-to-definition'::text]
        ELSE p_card_type_ids
    END;
    v_known_card_keys text[];
BEGIN
    SELECT COALESCE(
        array_agg(k.entry_id::text || ':' || k.card_type_id),
        ARRAY[]::text[]
    )
      INTO v_known_card_keys
      FROM public.user_card_known_marks k
     WHERE k.user_id = p_user_id
       AND k.card_type_id = ANY(v_card_type_ids)
       AND k.cleared_at IS NULL;

    RETURN QUERY
    SELECT *
      FROM public.get_next_filtered_card_without_known(
          p_user_id,
          v_card_type_ids,
          p_exclude_entry_ids,
          p_list_id,
          p_list_type,
          p_card_filter,
          p_queue_turn,
          COALESCE(p_exclude_card_keys, ARRAY[]::text[])
              || v_known_card_keys,
          p_training_filter
      );
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_card(
    uuid,
    text[],
    uuid[],
    uuid,
    text,
    text,
    text,
    text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_card(
    uuid,
    text[],
    uuid[],
    uuid,
    text,
    text,
    text,
    text[]
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_next_filtered_card(
    uuid,
    text[],
    uuid[],
    uuid,
    text,
    text,
    text,
    text[],
    jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_filtered_card(
    uuid,
    text[],
    uuid[],
    uuid,
    text,
    text,
    text,
    text[],
    jsonb
) TO authenticated;

DROP FUNCTION IF EXISTS public.get_user_card_states_for_entries(
    uuid,
    uuid[],
    text[]
);
CREATE FUNCTION public.get_user_card_states_for_entries(
    p_user_id uuid,
    p_entry_ids uuid[],
    p_card_type_ids text[] DEFAULT NULL
)
RETURNS TABLE (
    entry_id uuid,
    card_type_id text,
    click_count int,
    seen_count int,
    success_count int,
    last_seen_at timestamptz,
    last_reviewed_at timestamptz,
    next_review_at timestamptz,
    hidden boolean,
    frozen_until timestamptz,
    in_learning boolean,
    learning_due_at timestamptz,
    fsrs_stability numeric,
    fsrs_difficulty numeric,
    fsrs_reps int,
    fsrs_lapses int,
    fsrs_last_grade smallint,
    fsrs_last_interval numeric,
    fsrs_params_version text,
    state_revision uuid,
    known_mark_id uuid,
    known_mark_revision uuid,
    known_marked_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
    IF (select auth.uid()) IS NULL
       OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF p_entry_ids IS NULL OR array_length(p_entry_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        s.entry_id,
        s.card_type_id,
        s.click_count,
        s.seen_count,
        s.success_count,
        s.last_seen_at,
        s.last_reviewed_at,
        s.next_review_at,
        s.hidden,
        s.frozen_until,
        s.in_learning,
        s.learning_due_at,
        s.fsrs_stability,
        s.fsrs_difficulty,
        s.fsrs_reps,
        s.fsrs_lapses,
        s.fsrs_last_grade,
        s.fsrs_last_interval,
        s.fsrs_params_version,
        s.state_revision,
        k.id,
        k.revision,
        k.marked_at
    FROM public.user_card_status s
    JOIN public.word_entries w ON w.id = s.entry_id
    LEFT JOIN public.user_card_known_marks k
      ON k.user_id = s.user_id
     AND k.entry_id = s.entry_id
     AND k.card_type_id = s.card_type_id
     AND k.cleared_at IS NULL
    WHERE s.user_id = p_user_id
      AND s.entry_id = ANY(p_entry_ids)
      AND (
        p_card_type_ids IS NULL
        OR array_length(p_card_type_ids, 1) IS NULL
        OR s.card_type_id = ANY(p_card_type_ids)
      )
      AND (
        w.dictionary_id IS NULL
        OR public.can_access_dictionary(
            p_user_id,
            w.dictionary_id,
            'read'
        )
      );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_card_states_for_entries(
    uuid,
    uuid[],
    text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_card_states_for_entries(
    uuid,
    uuid[],
    text[]
) TO authenticated;

CREATE OR REPLACE FUNCTION private.platform_v2_card_state_json(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, private, pg_temp
AS $$
    SELECT jsonb_build_object(
        'entryId', p_entry_id,
        'cardTypeId', p_card_type_id,
        'scheduler', jsonb_strip_nulls(jsonb_build_object(
            'phase', CASE
                WHEN COALESCE(s.hidden, false) THEN 'hidden'
                WHEN s.frozen_until IS NOT NULL AND s.frozen_until > now()
                    THEN 'frozen'
                WHEN COALESCE(s.in_learning, false) THEN 'learning'
                WHEN COALESCE(s.fsrs_reps, 0) > 0
                  OR s.last_reviewed_at IS NOT NULL THEN 'reviewing'
                WHEN COALESCE(s.seen_count, 0) > 0
                  OR COALESCE(s.click_count, 0) > 0 THEN 'encountered'
                ELSE 'not-started'
            END,
            'repeatCount', COALESCE(s.click_count, 0),
            'lastSeenAt', s.last_seen_at,
            'frozenUntil', s.frozen_until
        )),
        'knownMark', CASE
            WHEN k.id IS NULL THEN 'null'::jsonb
            ELSE jsonb_build_object(
                'markId', k.id,
                'revision', k.revision,
                'markedAt', k.marked_at
            )
        END,
        'stateRevision', COALESCE(s.state_revision::text, 'untracked')
    )
    FROM (SELECT 1) seed
    LEFT JOIN public.user_card_status s
      ON s.user_id = p_user_id
     AND s.entry_id = p_entry_id
     AND s.card_type_id = p_card_type_id
    LEFT JOIN public.user_card_known_marks k
      ON k.user_id = p_user_id
     AND k.entry_id = p_entry_id
     AND k.card_type_id = p_card_type_id
     AND k.cleared_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.perform_platform_v2_card_action(
    p_user_id uuid,
    p_action_id text,
    p_entry_id uuid,
    p_card_type_id text,
    p_state_revision text,
    p_active_known_mark_id uuid,
    p_known_mark_revision text,
    p_review_result text,
    p_client_event_id uuid,
    p_source_context jsonb,
    p_auth_kind text,
    p_connected_client_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_dictionary_id uuid;
    v_status_revision text;
    v_scheduler_phase text;
    v_existing_receipt public.platform_v2_action_receipts%rowtype;
    v_existing_event public.user_card_action_events%rowtype;
    v_active_mark public.user_card_known_marks%rowtype;
    v_action_payload jsonb;
    v_action_payload_hash text;
    v_event_id uuid := gen_random_uuid();
    v_mark_id uuid := gen_random_uuid();
    v_mark_revision uuid := gen_random_uuid();
    v_response jsonb;
    v_source jsonb;
    v_artifact jsonb;
    v_location jsonb;
    v_context jsonb;
    v_source_id uuid;
    v_artifact_id uuid;
    v_location_id uuid;
    v_source_identity_key text;
    v_artifact_identity_key text;
    v_locator_key text;
    v_locator_kind text;
    v_context_text text;
    v_context_text_hash text;
    v_clicked_form text;
    v_start_ms integer;
    v_end_ms integer;
    v_phrase_index integer;
    v_jwt_role text := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        (
            NULLIF(
                current_setting('request.jwt.claims', true),
                ''
            )::jsonb
        )->>'role'
    );
BEGIN
    IF NOT (
        (
            (select auth.uid()) IS NOT NULL
            AND p_user_id IS NOT DISTINCT FROM (select auth.uid())
        )
        OR v_jwt_role = 'service_role'
    ) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    IF p_action_id NOT IN (
        'start-learning',
        'mark-known',
        'undo-known',
        'review-card'
    ) THEN
        RAISE EXCEPTION 'unsupported_action';
    END IF;
    IF p_action_id = 'review-card'
       AND (
           p_review_result IS NULL
           OR p_review_result NOT IN ('fail', 'hard', 'success', 'easy')
       ) THEN
        RAISE EXCEPTION 'missing_or_invalid_result';
    END IF;
    IF p_action_id <> 'review-card' AND p_review_result IS NOT NULL THEN
        RAISE EXCEPTION 'unexpected_review_result';
    END IF;
    IF p_client_event_id IS NULL THEN
        RAISE EXCEPTION 'missing_client_event_id';
    END IF;
    IF COALESCE(NULLIF(trim(p_auth_kind), ''), 'first_party')
       NOT IN ('first_party', 'connected_client') THEN
        RAISE EXCEPTION 'invalid_platform_auth_kind';
    END IF;
    IF p_auth_kind = 'connected_client'
       AND NULLIF(trim(p_connected_client_id), '') IS NULL THEN
        RAISE EXCEPTION 'missing_connected_client_id';
    END IF;
    IF p_auth_kind = 'connected_client'
       AND NOT EXISTS (
           SELECT 1
             FROM public.connected_clients c
             JOIN public.connected_client_grants g
               ON g.client_id = c.client_id
            WHERE c.client_id = trim(p_connected_client_id)
              AND c.status = 'active'
              AND g.user_id = p_user_id
              AND g.revoked_at IS NULL
              AND 'platform:write' = ANY(g.scopes)
       ) THEN
        RAISE EXCEPTION 'invalid_connected_client_grant';
    END IF;
    IF p_auth_kind = 'connected_client'
       AND NULLIF(p_source_context#>>'{client,id}', '') IS NOT NULL
       AND p_source_context#>>'{client,id}'
           IS DISTINCT FROM p_connected_client_id THEN
        RAISE EXCEPTION 'client_identity_mismatch';
    END IF;
    IF p_source_context IS NOT NULL
       AND p_source_context->>'contractVersion'
           IS DISTINCT FROM 'source-context-v2' THEN
        RAISE EXCEPTION 'invalid_source_context_version';
    END IF;

    SELECT dictionary_id
      INTO v_dictionary_id
      FROM public.word_entries
     WHERE id = p_entry_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry_not_found';
    END IF;
    IF v_dictionary_id IS NOT NULL
       AND NOT public.can_access_dictionary(
           p_user_id,
           v_dictionary_id,
           'read'
       ) THEN
        RAISE EXCEPTION 'entry_not_accessible';
    END IF;

    v_action_payload := jsonb_strip_nulls(jsonb_build_object(
        'contractVersion', 'platform-action-v2',
        'userId', p_user_id,
        'actionId', p_action_id,
        'entryId', p_entry_id,
        'cardTypeId', p_card_type_id,
        'stateRevision', p_state_revision,
        'activeKnownMarkId', p_active_known_mark_id,
        'knownMarkRevision', p_known_mark_revision,
        'reviewResult', p_review_result,
        'authKind', COALESCE(NULLIF(trim(p_auth_kind), ''), 'first_party'),
        'connectedClientId', CASE
            WHEN p_auth_kind = 'connected_client'
                THEN NULLIF(trim(p_connected_client_id), '')
            ELSE NULL
        END,
        'source', p_source_context->'source',
        'artifact', p_source_context->'artifact',
        'location', p_source_context->'location',
        'selection', p_source_context->'selection',
        'context', p_source_context->'context'
    ));
    v_action_payload_hash := encode(
        digest(v_action_payload::text, 'sha256'),
        'hex'
    );

    PERFORM pg_advisory_xact_lock(
        hashtext(p_user_id::text || ':' || p_client_event_id::text)
    );

    SELECT *
      INTO v_existing_receipt
      FROM public.platform_v2_action_receipts
     WHERE user_id = p_user_id
       AND client_event_id = p_client_event_id;
    IF FOUND THEN
        IF v_existing_receipt.action_payload_hash <> v_action_payload_hash THEN
            RAISE EXCEPTION 'platform_action_idempotency_conflict';
        END IF;
        RETURN v_existing_receipt.response || jsonb_build_object(
            'status', 'duplicate'
        );
    END IF;

    SELECT *
      INTO v_existing_event
      FROM public.user_card_action_events
     WHERE user_id = p_user_id
       AND client_event_id = p_client_event_id::text;
    IF FOUND THEN
        RAISE EXCEPTION 'platform_action_idempotency_conflict';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext(
            p_user_id::text
            || ':'
            || p_entry_id::text
            || ':'
            || p_card_type_id
        )
    );

    SELECT
        state_revision::text,
        CASE
            WHEN COALESCE(hidden, false) THEN 'hidden'
            WHEN frozen_until IS NOT NULL AND frozen_until > now()
                THEN 'frozen'
            WHEN COALESCE(in_learning, false) THEN 'learning'
            WHEN COALESCE(fsrs_reps, 0) > 0
              OR last_reviewed_at IS NOT NULL THEN 'reviewing'
            WHEN COALESCE(seen_count, 0) > 0
              OR COALESCE(click_count, 0) > 0 THEN 'encountered'
            ELSE 'not-started'
        END
      INTO v_status_revision, v_scheduler_phase
      FROM public.user_card_status
     WHERE user_id = p_user_id
       AND entry_id = p_entry_id
       AND card_type_id = p_card_type_id
     FOR UPDATE;

    IF NOT FOUND THEN
        IF p_state_revision <> 'untracked' THEN
            RAISE EXCEPTION 'platform_card_state_conflict';
        END IF;
        INSERT INTO public.user_card_status (
            user_id,
            entry_id,
            card_type_id,
            next_review_at,
            last_seen_at,
            click_count,
            seen_count,
            success_count,
            hidden,
            in_learning,
            fsrs_reps,
            fsrs_lapses,
            fsrs_enabled
        )
        VALUES (
            p_user_id,
            p_entry_id,
            p_card_type_id,
            NULL,
            NULL,
            0,
            0,
            0,
            false,
            false,
            0,
            0,
            false
        )
        RETURNING state_revision::text, 'not-started'
        INTO v_status_revision, v_scheduler_phase;
    ELSIF v_status_revision IS DISTINCT FROM p_state_revision THEN
        RAISE EXCEPTION 'platform_card_state_conflict';
    END IF;

    SELECT *
      INTO v_active_mark
      FROM public.user_card_known_marks
     WHERE user_id = p_user_id
       AND entry_id = p_entry_id
       AND card_type_id = p_card_type_id
       AND cleared_at IS NULL
     FOR UPDATE;

    IF p_action_id = 'mark-known' AND FOUND THEN
        RAISE EXCEPTION 'platform_card_already_known';
    END IF;
    IF p_action_id IN ('start-learning', 'review-card') AND FOUND THEN
        RAISE EXCEPTION 'card_is_known';
    END IF;
    IF p_action_id = 'undo-known' THEN
        IF NOT FOUND
           OR v_active_mark.id IS DISTINCT FROM p_active_known_mark_id
           OR v_active_mark.revision::text
              IS DISTINCT FROM p_known_mark_revision THEN
            RAISE EXCEPTION 'platform_known_mark_conflict';
        END IF;
    END IF;

    IF (
        p_action_id = 'start-learning'
        AND v_scheduler_phase NOT IN ('not-started', 'encountered')
    ) OR (
        p_action_id = 'review-card'
        AND v_scheduler_phase NOT IN ('learning', 'reviewing')
    ) OR (
        p_action_id = 'mark-known'
        AND v_scheduler_phase NOT IN (
            'not-started',
            'encountered',
            'learning',
            'reviewing'
        )
    ) THEN
        RAISE EXCEPTION 'platform_action_not_available';
    END IF;

    v_source := CASE
        WHEN jsonb_typeof(p_source_context->'source') = 'object'
            THEN p_source_context->'source'
        ELSE NULL
    END;
    v_artifact := CASE
        WHEN jsonb_typeof(p_source_context->'artifact') = 'object'
            THEN p_source_context->'artifact'
        ELSE NULL
    END;
    v_location := CASE
        WHEN jsonb_typeof(p_source_context->'location') = 'object'
            THEN p_source_context->'location'
        ELSE NULL
    END;
    v_context := CASE
        WHEN jsonb_typeof(p_source_context->'context') = 'object'
            THEN p_source_context->'context'
        ELSE NULL
    END;
    v_clicked_form := NULLIF(
        left(
            trim(
                COALESCE(
                    v_context->>'clickedForm',
                    p_source_context#>>'{selection,clickedForm}',
                    ''
                )
            ),
            160
        ),
        ''
    );
    v_context_text := NULLIF(
        left(COALESCE(v_context->>'text', ''), 1000),
        ''
    );
    v_context_text_hash := CASE
        WHEN v_context_text IS NULL THEN NULL
        ELSE md5(v_context_text)
    END;

    IF v_source IS NOT NULL THEN
        v_source_identity_key := md5(concat_ws(
            '|',
            COALESCE(NULLIF(trim(v_source->>'kind'), ''), 'unknown'),
            COALESCE(NULLIF(trim(v_source->>'provider'), ''), ''),
            COALESCE(
                NULLIF(
                    trim(
                        COALESCE(
                            v_source->>'externalId',
                            v_source->>'external_id'
                        )
                    ),
                    ''
                ),
                ''
            ),
            COALESCE(
                NULLIF(
                    trim(
                        COALESCE(
                            v_source->>'url',
                            v_source->>'canonicalUrl',
                            v_source->>'canonical_url'
                        )
                    ),
                    ''
                ),
                ''
            )
        ));

        INSERT INTO public.learning_sources (
            source_identity_key,
            kind,
            provider,
            external_id,
            canonical_url,
            title,
            language_code,
            metadata,
            first_seen_at,
            last_seen_at
        )
        VALUES (
            v_source_identity_key,
            COALESCE(NULLIF(left(trim(v_source->>'kind'), 80), ''), 'unknown'),
            NULLIF(left(trim(v_source->>'provider'), 80), ''),
            NULLIF(
                left(
                    trim(
                        COALESCE(
                            v_source->>'externalId',
                            v_source->>'external_id'
                        )
                    ),
                    240
                ),
                ''
            ),
            NULLIF(
                left(
                    trim(
                        COALESCE(
                            v_source->>'url',
                            v_source->>'canonicalUrl',
                            v_source->>'canonical_url'
                        )
                    ),
                    2048
                ),
                ''
            ),
            NULLIF(left(trim(v_source->>'title'), 500), ''),
            NULLIF(
                left(
                    trim(
                        COALESCE(
                            v_source->>'languageCode',
                            v_source->>'language_code'
                        )
                    ),
                    16
                ),
                ''
            ),
            jsonb_build_object(
                'contractVersion',
                'source-context-v2'
            ),
            now(),
            now()
        )
        ON CONFLICT (source_identity_key) DO UPDATE
        SET last_seen_at = now()
        RETURNING id INTO v_source_id;
    END IF;

    IF v_artifact IS NOT NULL THEN
        IF v_source_id IS NULL THEN
            RAISE EXCEPTION 'artifact_requires_source';
        END IF;
        v_artifact_identity_key := encode(
            digest(
                jsonb_build_object(
                    'sourceId',
                    v_source_id,
                    'artifact',
                    v_artifact
                )::text,
                'sha256'
            ),
            'hex'
        );

        INSERT INTO public.learning_source_artifacts (
            source_id,
            artifact_identity_key,
            artifact_kind,
            producer,
            snapshot_revision_id,
            text_source_id,
            text_source_revision_id,
            text_content_fingerprint,
            timing_evidence_revision_id,
            phrase_set_revision_id,
            builder_version,
            language_code,
            quality,
            metadata,
            first_seen_at,
            last_seen_at
        )
        VALUES (
            v_source_id,
            v_artifact_identity_key,
            left(v_artifact->>'artifactKind', 80),
            left(v_artifact->>'producer', 80),
            NULLIF(left(COALESCE(v_artifact->>'snapshotRevisionId', ''), 160), ''),
            NULLIF(left(COALESCE(v_artifact->>'textSourceId', ''), 160), ''),
            NULLIF(left(COALESCE(v_artifact->>'textSourceRevisionId', ''), 160), ''),
            NULLIF(left(COALESCE(v_artifact->>'textContentFingerprint', ''), 160), ''),
            NULLIF(left(COALESCE(v_artifact->>'timingEvidenceRevisionId', ''), 160), ''),
            NULLIF(left(COALESCE(v_artifact->>'phraseSetRevisionId', ''), 160), ''),
            NULLIF(left(COALESCE(v_artifact->>'builderVersion', ''), 80), ''),
            NULLIF(left(COALESCE(v_artifact->>'languageCode', ''), 16), ''),
            NULLIF(left(COALESCE(v_artifact->>'quality', ''), 80), ''),
            '{}'::jsonb,
            now(),
            now()
        )
        ON CONFLICT (source_id, artifact_identity_key) DO UPDATE
        SET last_seen_at = now(),
            quality = COALESCE(
                excluded.quality,
                learning_source_artifacts.quality
            )
        RETURNING id INTO v_artifact_id;
    END IF;

    IF v_location IS NOT NULL OR v_context_text_hash IS NOT NULL THEN
        IF v_source_id IS NULL THEN
            RAISE EXCEPTION 'location_requires_source';
        END IF;
        v_locator_kind := COALESCE(
            NULLIF(left(trim(v_location->>'kind'), 80), ''),
            'context'
        );
        v_start_ms := private.safe_jsonb_int(
            COALESCE(v_location->>'startMs', v_location->>'start_ms')
        );
        v_end_ms := private.safe_jsonb_int(
            COALESCE(v_location->>'endMs', v_location->>'end_ms')
        );
        v_phrase_index := private.safe_jsonb_int(
            COALESCE(
                v_location->>'phraseIndex',
                v_location->>'phrase_index'
            )
        );
        v_locator_key := md5(jsonb_strip_nulls(jsonb_build_object(
            'kind', v_locator_kind,
            'artifactId', v_artifact_id,
            'startMs', v_start_ms,
            'endMs', v_end_ms,
            'phraseIndex', v_phrase_index,
            'contextTextHash', v_context_text_hash
        ))::text);

        INSERT INTO public.learning_source_locations (
            source_id,
            artifact_id,
            locator_key,
            locator_kind,
            start_ms,
            end_ms,
            phrase_index,
            text_hash,
            context_text,
            metadata,
            first_seen_at,
            last_seen_at
        )
        VALUES (
            v_source_id,
            v_artifact_id,
            v_locator_key,
            v_locator_kind,
            v_start_ms,
            v_end_ms,
            v_phrase_index,
            v_context_text_hash,
            v_context_text,
            jsonb_strip_nulls(jsonb_build_object(
                'diagnostics',
                p_source_context->'diagnostics'
            )),
            now(),
            now()
        )
        ON CONFLICT (source_id, locator_key) DO UPDATE
        SET artifact_id = COALESCE(
                learning_source_locations.artifact_id,
                excluded.artifact_id
            ),
            last_seen_at = now(),
            context_text = COALESCE(
                learning_source_locations.context_text,
                excluded.context_text
            ),
            metadata = learning_source_locations.metadata
                || excluded.metadata
        RETURNING id INTO v_location_id;
    END IF;

    INSERT INTO public.user_card_action_events (
        id,
        user_id,
        entry_id,
        card_type_id,
        action,
        result,
        client_event_id,
        turn_id,
        action_payload_hash,
        source_context,
        source_id,
        artifact_id,
        location_id,
        clicked_form,
        context_text_hash,
        auth_kind,
        connected_client_id,
        created_at
    )
    VALUES (
        v_event_id,
        p_user_id,
        p_entry_id,
        p_card_type_id,
        p_action_id,
        p_review_result,
        p_client_event_id::text,
        CASE
            WHEN p_action_id = 'review-card' THEN p_client_event_id
            ELSE NULL
        END,
        v_action_payload_hash,
        p_source_context,
        v_source_id,
        v_artifact_id,
        v_location_id,
        v_clicked_form,
        v_context_text_hash,
        COALESCE(NULLIF(trim(p_auth_kind), ''), 'first_party'),
        CASE
            WHEN p_auth_kind = 'connected_client'
                THEN NULLIF(trim(p_connected_client_id), '')
            ELSE NULL
        END,
        now()
    );

    IF p_action_id = 'mark-known' THEN
        INSERT INTO public.user_card_known_marks (
            id,
            user_id,
            entry_id,
            card_type_id,
            revision,
            mark_event_id
        )
        VALUES (
            v_mark_id,
            p_user_id,
            p_entry_id,
            p_card_type_id,
            v_mark_revision,
            v_event_id
        );
    ELSIF p_action_id = 'undo-known' THEN
        UPDATE public.user_card_known_marks
           SET cleared_at = now(),
               undo_event_id = v_event_id
         WHERE id = v_active_mark.id
           AND cleared_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'platform_known_mark_conflict';
        END IF;
    ELSIF p_action_id = 'start-learning' THEN
        PERFORM public.start_learning_entry_card(
            p_user_id,
            p_entry_id,
            p_card_type_id
        );
    ELSE
        PERFORM public.handle_card_review(
            p_user_id,
            p_entry_id,
            p_card_type_id,
            p_review_result,
            p_client_event_id
        );
    END IF;

    IF p_action_id IN ('mark-known', 'undo-known') THEN
        UPDATE public.user_card_status
           SET state_revision = gen_random_uuid()
         WHERE user_id = p_user_id
           AND entry_id = p_entry_id
           AND card_type_id = p_card_type_id;
    END IF;

    v_response := jsonb_build_object(
        'status', 'accepted',
        'actionId', p_action_id,
        'clientEventId', p_client_event_id,
        'eventId', v_event_id,
        'sourceId', v_source_id,
        'artifactId', v_artifact_id,
        'locationId', v_location_id,
        'card', private.platform_v2_card_state_json(
            p_user_id,
            p_entry_id,
            p_card_type_id
        )
    );

    INSERT INTO public.platform_v2_action_receipts (
        user_id,
        client_event_id,
        action_payload_hash,
        event_id,
        response
    )
    VALUES (
        p_user_id,
        p_client_event_id,
        v_action_payload_hash,
        v_event_id,
        v_response
    );

    RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.perform_platform_v2_card_action(
    uuid,
    text,
    uuid,
    text,
    text,
    uuid,
    text,
    text,
    uuid,
    jsonb,
    text,
    text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_platform_v2_card_action(
    uuid,
    text,
    uuid,
    text,
    text,
    uuid,
    text,
    text,
    uuid,
    jsonb,
    text,
    text
) TO service_role;

COMMIT;
