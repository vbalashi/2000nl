-- Additive identity/state storage for idiom and sentence exercises.
--
-- Ordinary meaning state, action history, Known marks, and latched session
-- members remain on their existing entry + card-type contracts. Content-bound
-- exercises use their own target registry so several idioms under one meaning
-- cannot share FSRS state or an action/session identity by accident.

BEGIN;

CREATE TABLE IF NOT EXISTS private.platform_v2_training_exercise_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_version text NOT NULL DEFAULT 'training-exercise-v1'
        CHECK (schema_version = 'training-exercise-v1'),
    entry_id uuid NOT NULL
        REFERENCES public.word_entries(id) ON DELETE RESTRICT,
    content_node_id uuid
        REFERENCES private.platform_v2_content_nodes(id) ON DELETE RESTRICT,
    family text NOT NULL CHECK (family IN ('meaning', 'idiom', 'translation')),
    direction text NOT NULL CHECK (direction IN ('direct', 'reverse', 'recall')),
    source_revision text,
    source_text_fingerprint text,
    visibility_state text NOT NULL DEFAULT 'active'
        CHECK (visibility_state IN ('active', 'retired')),
    retired_at timestamptz,
    retirement_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    target_key text GENERATED ALWAYS AS (
        schema_version || ':' || family || ':' || direction || ':'
            || entry_id::text || ':' || COALESCE(content_node_id::text, 'entry')
    ) STORED,
    CONSTRAINT platform_v2_training_exercise_target_key_uniq
        UNIQUE (target_key),
    CONSTRAINT platform_v2_training_exercise_target_identity_uniq
        UNIQUE (entry_id, content_node_id, family, direction),
    CONSTRAINT platform_v2_training_exercise_target_shape_check
        CHECK (
            (
                family = 'meaning'
                AND direction IN ('direct', 'reverse')
                AND content_node_id IS NULL
                AND source_revision IS NULL
                AND source_text_fingerprint IS NULL
            )
            OR (
                family = 'idiom'
                AND direction IN ('direct', 'reverse')
                AND content_node_id IS NOT NULL
                AND NULLIF(btrim(source_revision), '') IS NOT NULL
                AND NULLIF(btrim(source_text_fingerprint), '') IS NOT NULL
            )
            OR (
                family = 'translation'
                AND direction = 'recall'
                AND content_node_id IS NOT NULL
                AND NULLIF(btrim(source_revision), '') IS NOT NULL
                AND NULLIF(btrim(source_text_fingerprint), '') IS NOT NULL
            )
        ),
    CONSTRAINT platform_v2_training_exercise_target_visibility_check
        CHECK (
            (visibility_state = 'active' AND retired_at IS NULL)
            OR (visibility_state = 'retired' AND retired_at IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS platform_v2_training_exercise_targets_entry_idx
    ON private.platform_v2_training_exercise_targets(entry_id, visibility_state);

CREATE INDEX IF NOT EXISTS platform_v2_training_exercise_targets_node_idx
    ON private.platform_v2_training_exercise_targets(content_node_id, visibility_state)
    WHERE content_node_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.validate_platform_v2_training_exercise_target_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_node record;
BEGIN
    IF NEW.family = 'meaning' THEN
        RETURN NEW;
    END IF;

    SELECT entry_id, kind, binding_state, source_text_fingerprint
      INTO v_node
      FROM private.platform_v2_content_nodes
     WHERE id = NEW.content_node_id;

    IF NOT FOUND OR v_node.entry_id IS DISTINCT FROM NEW.entry_id THEN
        RAISE EXCEPTION 'training_exercise_content_node_entry_mismatch';
    END IF;
    IF v_node.binding_state IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'training_exercise_content_node_not_active';
    END IF;
    IF v_node.source_text_fingerprint IS DISTINCT FROM NEW.source_text_fingerprint THEN
        RAISE EXCEPTION 'training_exercise_source_fingerprint_mismatch';
    END IF;
    IF NEW.family = 'idiom' AND v_node.kind IS DISTINCT FROM 'idiom' THEN
        RAISE EXCEPTION 'training_exercise_idiom_node_required';
    END IF;
    IF NEW.family = 'translation' AND v_node.kind IS DISTINCT FROM 'example' THEN
        RAISE EXCEPTION 'training_exercise_sentence_node_required';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_platform_v2_training_exercise_target_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS validate_platform_v2_training_exercise_target_v1
    ON private.platform_v2_training_exercise_targets;
CREATE TRIGGER validate_platform_v2_training_exercise_target_v1
BEFORE INSERT OR UPDATE OF entry_id, content_node_id, family, direction,
    source_revision, source_text_fingerprint
ON private.platform_v2_training_exercise_targets
FOR EACH ROW
EXECUTE FUNCTION private.validate_platform_v2_training_exercise_target_v1();

CREATE OR REPLACE FUNCTION private.sync_platform_v2_training_exercise_target_visibility_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
BEGIN
    IF NEW.binding_state = 'retired' THEN
        UPDATE private.platform_v2_training_exercise_targets
           SET visibility_state = 'retired',
               retired_at = COALESCE(retired_at, private.training_reference_now_v1()),
               retirement_reason = 'source-node-retired',
               updated_at = private.training_reference_now_v1()
         WHERE content_node_id = NEW.id
           AND visibility_state = 'active';
    ELSIF NEW.binding_state = 'active' THEN
        UPDATE private.platform_v2_training_exercise_targets target
           SET visibility_state = CASE
                   WHEN target.source_text_fingerprint = NEW.source_text_fingerprint
                       THEN 'active'
                   ELSE 'retired'
               END,
               retired_at = CASE
                   WHEN target.source_text_fingerprint = NEW.source_text_fingerprint
                       THEN NULL
                   ELSE COALESCE(target.retired_at, private.training_reference_now_v1())
               END,
               retirement_reason = CASE
                   WHEN target.source_text_fingerprint = NEW.source_text_fingerprint
                       THEN NULL
                   ELSE 'source-node-fingerprint-changed'
               END,
               updated_at = private.training_reference_now_v1()
         WHERE target.content_node_id = NEW.id
           AND (
               target.visibility_state IS DISTINCT FROM CASE
                   WHEN target.source_text_fingerprint = NEW.source_text_fingerprint
                       THEN 'active'
                   ELSE 'retired'
               END
               OR target.source_text_fingerprint = NEW.source_text_fingerprint
                   AND target.retired_at IS NOT NULL
           );
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_platform_v2_training_exercise_target_visibility_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS sync_platform_v2_training_exercise_target_visibility_v1
    ON private.platform_v2_content_nodes;
CREATE TRIGGER sync_platform_v2_training_exercise_target_visibility_v1
AFTER UPDATE OF binding_state, source_text_fingerprint
ON private.platform_v2_content_nodes
FOR EACH ROW
WHEN (
    OLD.binding_state IS DISTINCT FROM NEW.binding_state
    OR OLD.source_text_fingerprint IS DISTINCT FROM NEW.source_text_fingerprint
)
EXECUTE FUNCTION private.sync_platform_v2_training_exercise_target_visibility_v1();

CREATE OR REPLACE FUNCTION private.ensure_platform_v2_training_exercise_target_v1(
    p_entry_id uuid,
    p_content_node_id uuid,
    p_family text,
    p_direction text,
    p_source_revision text,
    p_source_text_fingerprint text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_existing private.platform_v2_training_exercise_targets%rowtype;
    v_target_id uuid;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.word_entries WHERE id = p_entry_id
    ) THEN
        RAISE EXCEPTION 'training_exercise_entry_not_found';
    END IF;

    SELECT *
      INTO v_existing
      FROM private.platform_v2_training_exercise_targets
     WHERE entry_id = p_entry_id
       AND content_node_id IS NOT DISTINCT FROM p_content_node_id
       AND family = p_family
       AND direction = p_direction
     FOR UPDATE;

    IF FOUND THEN
        IF v_existing.source_text_fingerprint IS DISTINCT FROM p_source_text_fingerprint THEN
            RAISE EXCEPTION 'training_exercise_target_rebind_requires_new_node';
        END IF;

        IF p_content_node_id IS NOT NULL AND NOT EXISTS (
            SELECT 1
              FROM private.platform_v2_content_nodes node
             WHERE node.id = p_content_node_id
               AND node.entry_id = p_entry_id
               AND node.binding_state = 'active'
               AND node.source_text_fingerprint = p_source_text_fingerprint
        ) THEN
            RAISE EXCEPTION 'training_exercise_target_source_not_active';
        END IF;

        UPDATE private.platform_v2_training_exercise_targets
           SET source_revision = p_source_revision,
               visibility_state = 'active',
               retired_at = NULL,
               retirement_reason = NULL,
               updated_at = private.training_reference_now_v1()
         WHERE id = v_existing.id
           AND content_node_id IS NOT DISTINCT FROM p_content_node_id;
        RETURN v_existing.id;
    END IF;

    INSERT INTO private.platform_v2_training_exercise_targets (
        entry_id,
        content_node_id,
        family,
        direction,
        source_revision,
        source_text_fingerprint
    )
    VALUES (
        p_entry_id,
        p_content_node_id,
        p_family,
        p_direction,
        p_source_revision,
        p_source_text_fingerprint
    )
    RETURNING id INTO v_target_id;

    RETURN v_target_id;
END;
$$;

REVOKE ALL ON FUNCTION private.ensure_platform_v2_training_exercise_target_v1(
    uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_platform_v2_training_exercise_target_as_principal_v1(
    p_entry_id uuid,
    p_content_node_id uuid,
    p_family text,
    p_direction text,
    p_source_revision text,
    p_source_text_fingerprint text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_jwt_role text := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
    );
BEGIN
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    RETURN private.ensure_platform_v2_training_exercise_target_v1(
        p_entry_id,
        p_content_node_id,
        p_family,
        p_direction,
        p_source_revision,
        p_source_text_fingerprint
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_platform_v2_training_exercise_target_as_principal_v1(
    uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_platform_v2_training_exercise_target_as_principal_v1(
    uuid, uuid, text, text, text, text
) TO service_role;

CREATE TABLE IF NOT EXISTS public.user_training_exercise_state (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_id uuid NOT NULL
        REFERENCES private.platform_v2_training_exercise_targets(id) ON DELETE RESTRICT,
    state_revision uuid NOT NULL DEFAULT gen_random_uuid(),
    fsrs_stability numeric,
    fsrs_difficulty numeric,
    fsrs_reps integer NOT NULL DEFAULT 0,
    fsrs_lapses integer NOT NULL DEFAULT 0,
    fsrs_last_grade smallint,
    fsrs_last_interval numeric,
    fsrs_target_retention numeric NOT NULL DEFAULT 0.9,
    fsrs_params_version text NOT NULL DEFAULT 'fsrs-6-default',
    fsrs_enabled boolean NOT NULL DEFAULT false,
    next_review_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz,
    last_reviewed_at timestamptz,
    seen_count integer NOT NULL DEFAULT 0,
    success_count integer NOT NULL DEFAULT 0,
    last_result text,
    hidden boolean NOT NULL DEFAULT false,
    frozen_until timestamptz,
    in_learning boolean NOT NULL DEFAULT false,
    learning_due_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, target_id)
);

CREATE INDEX IF NOT EXISTS user_training_exercise_state_due_idx
    ON public.user_training_exercise_state(user_id, next_review_at);

CREATE OR REPLACE FUNCTION private.bump_user_training_exercise_state_revision_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW IS DISTINCT FROM OLD THEN
        NEW.state_revision := gen_random_uuid();
        NEW.updated_at := private.training_reference_now_v1();
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.bump_user_training_exercise_state_revision_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS bump_user_training_exercise_state_revision_v1
    ON public.user_training_exercise_state;
CREATE TRIGGER bump_user_training_exercise_state_revision_v1
BEFORE INSERT OR UPDATE ON public.user_training_exercise_state
FOR EACH ROW
EXECUTE FUNCTION private.bump_user_training_exercise_state_revision_v1();

CREATE TABLE IF NOT EXISTS public.training_session_exercise_members (
    session_id uuid NOT NULL
        REFERENCES public.training_sessions(id) ON DELETE CASCADE,
    target_id uuid NOT NULL
        REFERENCES private.platform_v2_training_exercise_targets(id) ON DELETE RESTRICT,
    ordinal integer NOT NULL CHECK (ordinal > 0),
    queue_source text NOT NULL
        CHECK (queue_source IN ('new', 'learning', 'review', 'practice')),
    consumed_at timestamptz,
    unavailable_at timestamptz,
    unavailable_reason text,
    PRIMARY KEY (session_id, target_id),
    UNIQUE (session_id, ordinal),
    CHECK (
        (unavailable_at IS NULL AND unavailable_reason IS NULL)
        OR (unavailable_at IS NOT NULL AND unavailable_reason IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS training_session_exercise_members_next_idx
    ON public.training_session_exercise_members(
        session_id, consumed_at, unavailable_at, ordinal
    );

CREATE OR REPLACE FUNCTION private.prevent_training_session_exercise_membership_identity_update_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           OLD.session_id IS DISTINCT FROM NEW.session_id
           OR OLD.target_id IS DISTINCT FROM NEW.target_id
           OR OLD.ordinal IS DISTINCT FROM NEW.ordinal
           OR OLD.queue_source IS DISTINCT FROM NEW.queue_source
       ) THEN
        RAISE EXCEPTION 'training_exercise_session_membership_immutable';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_training_session_exercise_membership_identity_update_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS training_session_exercise_members_identity_immutable
    ON public.training_session_exercise_members;
CREATE TRIGGER training_session_exercise_members_identity_immutable
BEFORE UPDATE OR DELETE ON public.training_session_exercise_members
FOR EACH ROW
EXECUTE FUNCTION private.prevent_training_session_exercise_membership_identity_update_v1();

CREATE TABLE IF NOT EXISTS public.user_training_exercise_action_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_id uuid NOT NULL
        REFERENCES private.platform_v2_training_exercise_targets(id) ON DELETE RESTRICT,
    session_id uuid REFERENCES public.training_sessions(id) ON DELETE SET NULL,
    action text NOT NULL CHECK (
        action IN ('record-view', 'start-learning', 'mark-known', 'undo-known', 'review-card')
    ),
    result text CHECK (
        result IS NULL OR result IN ('fail', 'hard', 'success', 'easy', 'hide', 'freeze')
    ),
    client_event_id uuid NOT NULL,
    action_payload_hash text NOT NULL,
    source_context jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS user_training_exercise_action_events_target_idx
    ON public.user_training_exercise_action_events(user_id, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_v2_training_exercise_action_receipts (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_event_id uuid NOT NULL,
    target_id uuid NOT NULL
        REFERENCES private.platform_v2_training_exercise_targets(id) ON DELETE RESTRICT,
    action_payload_hash text NOT NULL,
    event_id uuid NOT NULL UNIQUE
        REFERENCES public.user_training_exercise_action_events(id) ON DELETE RESTRICT,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS platform_v2_training_exercise_action_receipts_target_idx
    ON public.platform_v2_training_exercise_action_receipts(user_id, target_id, created_at DESC);

ALTER TABLE public.user_training_exercise_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_session_exercise_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_training_exercise_action_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_v2_training_exercise_action_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
    public.user_training_exercise_state,
    public.training_session_exercise_members,
    public.user_training_exercise_action_events,
    public.platform_v2_training_exercise_action_receipts
FROM PUBLIC, anon, service_role;

GRANT SELECT ON TABLE
    public.user_training_exercise_state,
    public.training_session_exercise_members,
    public.user_training_exercise_action_events,
    public.platform_v2_training_exercise_action_receipts
TO authenticated;

DROP POLICY IF EXISTS user_training_exercise_state_select_self
    ON public.user_training_exercise_state;
CREATE POLICY user_training_exercise_state_select_self
    ON public.user_training_exercise_state
    FOR SELECT TO authenticated
    USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS training_session_exercise_members_select_self
    ON public.training_session_exercise_members;
CREATE POLICY training_session_exercise_members_select_self
    ON public.training_session_exercise_members
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1
          FROM public.training_sessions session
         WHERE session.id = training_session_exercise_members.session_id
           AND session.user_id = (select auth.uid())
    ));

DROP POLICY IF EXISTS user_training_exercise_action_events_select_self
    ON public.user_training_exercise_action_events;
CREATE POLICY user_training_exercise_action_events_select_self
    ON public.user_training_exercise_action_events
    FOR SELECT TO authenticated
    USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS platform_v2_training_exercise_action_receipts_select_self
    ON public.platform_v2_training_exercise_action_receipts;
CREATE POLICY platform_v2_training_exercise_action_receipts_select_self
    ON public.platform_v2_training_exercise_action_receipts
    FOR SELECT TO authenticated
    USING (user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.read_platform_v2_training_exercise_target_v1(
    p_user_id uuid,
    p_target_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_jwt_role text := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
    );
    v_result jsonb;
BEGIN
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    IF p_user_id IS NULL OR NULLIF(btrim(p_target_key), '') IS NULL THEN
        RETURN jsonb_build_object('error', 'training_exercise_target_not_found');
    END IF;

    SELECT jsonb_build_object(
        'targetKey', target.target_key,
        'entryId', target.entry_id,
        'contentNodeId', target.content_node_id,
        'family', target.family,
        'direction', target.direction,
        'sourceRevision', target.source_revision,
        'sourceTextFingerprint', target.source_text_fingerprint,
        'visibilityState', target.visibility_state,
        'sourceNodeState', node.binding_state,
        'state', CASE WHEN state.target_id IS NULL THEN NULL ELSE jsonb_build_object(
            'stateRevision', state.state_revision,
            'fsrsStability', state.fsrs_stability,
            'fsrsDifficulty', state.fsrs_difficulty,
            'fsrsReps', state.fsrs_reps,
            'fsrsLapses', state.fsrs_lapses,
            'fsrsLastGrade', state.fsrs_last_grade,
            'fsrsLastInterval', state.fsrs_last_interval,
            'fsrsTargetRetention', state.fsrs_target_retention,
            'fsrsParamsVersion', state.fsrs_params_version,
            'fsrsEnabled', state.fsrs_enabled,
            'nextReviewAt', state.next_review_at,
            'lastSeenAt', state.last_seen_at,
            'lastReviewedAt', state.last_reviewed_at,
            'seenCount', state.seen_count,
            'successCount', state.success_count,
            'lastResult', state.last_result,
            'hidden', state.hidden,
            'frozenUntil', state.frozen_until,
            'inLearning', state.in_learning,
            'learningDueAt', state.learning_due_at
        ) END
    )
      INTO v_result
      FROM private.platform_v2_training_exercise_targets target
      LEFT JOIN private.platform_v2_content_nodes node
        ON node.id = target.content_node_id
      LEFT JOIN public.user_training_exercise_state state
        ON state.user_id = p_user_id
       AND state.target_id = target.id
     WHERE target.target_key = p_target_key;

    RETURN COALESCE(v_result, jsonb_build_object(
        'error', 'training_exercise_target_not_found'
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.read_platform_v2_training_exercise_target_v1(uuid, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_training_exercise_target_v1(uuid, text)
    TO service_role;

COMMIT;
