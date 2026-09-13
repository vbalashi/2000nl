-- One current first-party Training queue per learner.
--
-- This is deliberately unrelated to the rejected local migration-153
-- prototype. It keeps the established ordinary queue as storage, then adds a
-- small authority pointer around it. Queue/history rows remain append-only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.training_active_runs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL UNIQUE REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  generation bigint NOT NULL CHECK (generation > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.training_run_start_receipts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  request_hash text NOT NULL,
  session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);

-- These are authority internals, not client-readable user state. Supabase
-- grants new public tables to API roles by default, so protect them with both
-- RLS (no policies) and explicit privilege revocation. Security-definer RPCs
-- owned by postgres remain the only supported access path.
ALTER TABLE public.training_active_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_run_start_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.training_active_runs
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.training_run_start_receipts
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_session_id uuid
    REFERENCES public.training_sessions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS training_sessions_user_open_created_idx
  ON public.training_sessions(user_id, created_at DESC)
  WHERE completed_at IS NULL;

ALTER TABLE public.training_active_runs
  DROP CONSTRAINT IF EXISTS training_active_runs_session_id_fkey;
ALTER TABLE public.training_active_runs
  ADD CONSTRAINT training_active_runs_session_id_fkey
  FOREIGN KEY (session_id)
  REFERENCES public.training_sessions(id)
  ON DELETE CASCADE;

-- Preserve currently usable queues during the rollout. If a learner happened
-- to own several pending old queues, the most recently created one becomes
-- current; the others retain their membership/history but are not actionable.
INSERT INTO public.training_active_runs (user_id, session_id, generation, updated_at)
SELECT DISTINCT ON (session.user_id)
  session.user_id, session.id, 1, now()
FROM public.training_sessions AS session
WHERE session.completed_at IS NULL
  AND session.expires_at > private.training_reference_now_v1()
ORDER BY session.user_id, session.created_at DESC, session.id DESC
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.training_sessions AS session
SET superseded_at = COALESCE(session.superseded_at, now()),
    superseded_by_session_id = COALESCE(
      session.superseded_by_session_id,
      active.session_id
    )
FROM public.training_active_runs AS active
WHERE active.user_id = session.user_id
  AND active.session_id IS DISTINCT FROM session.id
  AND session.completed_at IS NULL
  AND session.expires_at > private.training_reference_now_v1();

CREATE OR REPLACE FUNCTION private.claim_inserted_training_session_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_previous_session_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('training-active-run:' || NEW.user_id::text)
  );
  SELECT session_id INTO v_previous_session_id
  FROM public.training_active_runs
  WHERE user_id = NEW.user_id
  FOR UPDATE;

  IF v_previous_session_id IS NOT NULL
     AND v_previous_session_id IS DISTINCT FROM NEW.id THEN
    UPDATE public.training_sessions
    SET superseded_at = COALESCE(superseded_at, now()),
        superseded_by_session_id = NEW.id
    WHERE id = v_previous_session_id
      AND completed_at IS NULL;
  END IF;

  INSERT INTO public.training_active_runs (user_id, session_id, generation, updated_at)
  VALUES (NEW.user_id, NEW.id, 1, now())
  ON CONFLICT (user_id) DO UPDATE
  SET session_id = EXCLUDED.session_id,
      generation = public.training_active_runs.generation + 1,
      updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS training_sessions_claim_active_run
  ON public.training_sessions;
CREATE TRIGGER training_sessions_claim_active_run
AFTER INSERT ON public.training_sessions
FOR EACH ROW
EXECUTE FUNCTION private.claim_inserted_training_session_v1();

REVOKE ALL ON FUNCTION private.claim_inserted_training_session_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.require_active_training_session_v1(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_generation bigint;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;

  -- The same advisory lock is used by start/continue and new actions. It
  -- makes takeover-versus-grade deterministic even before the active row
  -- exists for a brand new learner.
  PERFORM pg_advisory_xact_lock(hashtext('training-active-run:' || p_user_id::text));

  SELECT active.generation INTO v_generation
  FROM public.training_active_runs AS active
  WHERE active.user_id = p_user_id
    AND active.session_id = p_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'training_session_superseded';
  END IF;
  RETURN v_generation;
END;
$$;

REVOKE ALL ON FUNCTION private.require_active_training_session_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.training_session_run_response_v1(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT jsonb_build_object(
    'sessionId', session.id,
    'sessionSize', session.session_size,
    'requestedTotal', session.requested_total,
    'plannedNew', session.planned_new,
    'plannedReview', session.planned_review,
    'plannedPractice', session.planned_practice,
    'plannedTotal', session.planned_total,
    'plannedAt', session.created_at,
    'runStatus', CASE
      WHEN active.session_id = session.id THEN 'active'
      ELSE 'superseded'
    END,
    'runGeneration', CASE
      WHEN active.session_id = session.id THEN active.generation
      ELSE NULL
    END
  )
  FROM public.training_sessions AS session
  LEFT JOIN public.training_active_runs AS active
    ON active.user_id = session.user_id
  WHERE session.id = p_session_id
    AND session.user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION private.training_session_run_response_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the working queue-latching implementation behind a private name,
-- then make both old and new public start shapes claim a run before returning.
--
-- Bootstrap can be replayed against a populated database. On the first pass
-- each source function is moved to its private latch name; on a replay the
-- public wrapper and private latch already exist. Guard both the source and
-- destination so the replay does not try to move a second function into an
-- occupied private signature.
DO $$
DECLARE
  v_function record;
  v_source text;
  v_target text;
BEGIN
  FOR v_function IN
    SELECT * FROM (VALUES
      ('start_training_session',
       'uuid, text[], uuid, text, text, jsonb, text',
       'start_training_session_latch_v1'),
      ('get_next_training_session_card',
       'uuid, uuid, text[]',
       'get_next_training_session_card_latch_v1'),
      ('get_training_session_snapshot',
       'uuid, uuid',
       'get_training_session_snapshot_latch_v1'),
      ('mark_training_session_member_unavailable',
       'uuid, uuid, uuid, text, text',
       'mark_training_session_member_unavailable_latch_v1'),
      ('perform_platform_v2_card_action_as_principal',
       'uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text, uuid',
       'perform_platform_v2_card_action_session_latch_v1'),
      ('perform_platform_v2_card_action_as_principal',
       'uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text',
       'perform_platform_v2_card_action_non_session_latch_v1')
    ) AS functions(name, arguments, target_name)
  LOOP
    v_source := format('public.%I(%s)', v_function.name, v_function.arguments);
    v_target := format('private.%I(%s)', v_function.target_name, v_function.arguments);
    IF to_regprocedure(v_source) IS NOT NULL
       AND to_regprocedure(v_target) IS NULL THEN
      EXECUTE format(
        'ALTER FUNCTION %s RENAME TO %I',
        v_source,
        v_function.target_name
      );
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET SCHEMA private',
        v_function.target_name,
        v_function.arguments
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.start_training_session_latch_v1(uuid, text[], uuid, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.claim_training_session_start_v1(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_training_filter jsonb,
  p_session_size text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
  v_request_hash text;
  v_receipt public.training_run_start_receipts%rowtype;
  v_latched jsonb;
  v_session_id uuid;
  v_previous_session_id uuid;
  v_generation bigint;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'missing_training_run_start_request_id';
  END IF;

  v_request_hash := encode(digest(jsonb_build_object(
    'modes', COALESCE(p_card_type_ids, ARRAY[]::text[]),
    'listId', p_list_id,
    'listType', p_list_type,
    'filter', p_card_filter,
    'trainingFilter', COALESCE(p_training_filter, '{}'::jsonb),
    'size', p_session_size
  )::text, 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtext('training-active-run:' || p_user_id::text));
  SELECT * INTO v_receipt
  FROM public.training_run_start_receipts
  WHERE user_id = p_user_id AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_hash <> v_request_hash THEN
      RAISE EXCEPTION 'training_run_start_idempotency_conflict';
    END IF;
    RETURN private.training_session_run_response_v1(p_user_id, v_receipt.session_id);
  END IF;

  v_latched := private.start_training_session_latch_v1(
    p_user_id, p_card_type_ids, p_list_id, p_list_type, p_card_filter,
    p_training_filter, p_session_size
  );
  v_session_id := (v_latched->>'sessionId')::uuid;

  SELECT session_id, generation INTO v_previous_session_id, v_generation
  FROM public.training_active_runs
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_previous_session_id IS DISTINCT FROM v_session_id THEN
    -- The insert trigger normally claims the queue. This fallback only
    -- protects a manually repaired/legacy row that has no trigger state.
    INSERT INTO public.training_active_runs (user_id, session_id, generation, updated_at)
    VALUES (p_user_id, v_session_id, COALESCE(v_generation, 0) + 1, now())
    ON CONFLICT (user_id) DO UPDATE
    SET session_id = EXCLUDED.session_id,
        generation = public.training_active_runs.generation + 1,
        updated_at = EXCLUDED.updated_at;
  END IF;

  INSERT INTO public.training_run_start_receipts (
    user_id, request_id, request_hash, session_id
  ) VALUES (
    p_user_id, p_request_id, v_request_hash, v_session_id
  );

  RETURN private.training_session_run_response_v1(p_user_id, v_session_id);
END;
$$;

REVOKE ALL ON FUNCTION private.claim_training_session_start_v1(
  uuid, text[], uuid, text, text, jsonb, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_training_session(
  p_user_id uuid,
  p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'],
  p_list_id uuid DEFAULT NULL,
  p_list_type text DEFAULT 'curated',
  p_card_filter text DEFAULT 'both',
  p_training_filter jsonb DEFAULT '{}',
  p_session_size text DEFAULT '10'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  PERFORM private.training_reference_now_v1();
  RETURN private.claim_training_session_start_v1(
    p_user_id, p_card_type_ids, p_list_id, p_list_type, p_card_filter,
    p_training_filter, p_session_size, gen_random_uuid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_training_session(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_training_filter jsonb,
  p_session_size text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.claim_training_session_start_v1(
    p_user_id, p_card_type_ids, p_list_id, p_list_type, p_card_filter,
    p_training_filter, p_session_size, p_request_id
  );
$$;

ALTER FUNCTION public.start_training_session(uuid, text[], uuid, text, text, jsonb, text)
  OWNER TO postgres;
ALTER FUNCTION public.start_training_session(uuid, text[], uuid, text, text, jsonb, text, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.start_training_session(uuid, text[], uuid, text, text, jsonb, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_training_session(uuid, text[], uuid, text, text, jsonb, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_training_session(uuid, text[], uuid, text, text, jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_training_session(uuid, text[], uuid, text, text, jsonb, text, uuid)
  TO authenticated;

-- Wrap the established selectors/mutators rather than duplicating their
-- scheduler policy. Stale queues become non-actionable before card projection
-- or unavailable-member mutation.
REVOKE ALL ON FUNCTION private.get_next_training_session_card_latch_v1(uuid, uuid, text[])
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_next_training_session_card(
  p_user_id uuid,
  p_session_id uuid,
  p_exclude_card_keys text[]
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  PERFORM private.training_reference_now_v1();
  IF NOT EXISTS (
    SELECT 1 FROM public.training_active_runs
    WHERE user_id = p_user_id AND session_id = p_session_id
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT * FROM private.get_next_training_session_card_latch_v1(
    p_user_id, p_session_id, p_exclude_card_keys
  );
END;
$$;

ALTER FUNCTION public.get_next_training_session_card(uuid, uuid, text[])
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_next_training_session_card(uuid, uuid, text[])
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_next_training_session_card(uuid, uuid, text[])
  TO authenticated;

REVOKE ALL ON FUNCTION private.get_training_session_snapshot_latch_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_training_session_snapshot(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_snapshot jsonb;
  v_run jsonb;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  v_snapshot := private.get_training_session_snapshot_latch_v1(p_user_id, p_session_id);
  IF v_snapshot IS NULL THEN RETURN NULL; END IF;
  v_run := private.training_session_run_response_v1(p_user_id, p_session_id);
  RETURN v_snapshot || jsonb_build_object(
    'runStatus', v_run->>'runStatus',
    'runGeneration', v_run->'runGeneration'
  );
END;
$$;

ALTER FUNCTION public.get_training_session_snapshot(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_training_session_snapshot(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_training_session_snapshot(uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION private.mark_training_session_member_unavailable_latch_v1(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_training_session_member_unavailable(
  p_user_id uuid,
  p_session_id uuid,
  p_entry_id uuid,
  p_card_type_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  PERFORM private.training_reference_now_v1();
  PERFORM private.require_active_training_session_v1(p_user_id, p_session_id);
  RETURN private.mark_training_session_member_unavailable_latch_v1(
    p_user_id, p_session_id, p_entry_id, p_card_type_id, p_reason
  );
END;
$$;

ALTER FUNCTION public.mark_training_session_member_unavailable(uuid, uuid, uuid, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_training_session_member_unavailable(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_training_session_member_unavailable(uuid, uuid, uuid, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION private.perform_platform_v2_card_action_session_latch_v1(
  uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

-- Keep the established non-session action implementation available to the
-- session-aware wrapper without routing back through the public compatibility
-- guard below.
REVOKE ALL ON FUNCTION private.perform_platform_v2_card_action_non_session_latch_v1(
  uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.perform_platform_v2_card_action_session_latch_v1(
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
  p_connected_client_id text,
  p_training_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
  v_jwt_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
  );
  v_response jsonb;
  v_consumption jsonb;
  v_binding public.training_session_action_bindings%rowtype;
BEGIN
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user_id'; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

  v_response := private.perform_platform_v2_card_action_non_session_latch_v1(
    p_user_id, p_action_id, p_entry_id, p_card_type_id, p_state_revision,
    p_active_known_mark_id, p_known_mark_revision, p_review_result,
    p_client_event_id, p_source_context, p_auth_kind, p_connected_client_id
  );

  IF p_training_session_id IS NOT NULL
     AND p_action_id IN ('start-learning', 'mark-known', 'review-card')
     AND v_response->>'status' IN ('accepted', 'duplicate') THEN
    IF v_response->>'status' = 'accepted' THEN
      INSERT INTO public.training_session_action_bindings (
        user_id, client_event_id, session_id, entry_id, card_type_id
      ) VALUES (
        p_user_id, p_client_event_id, p_training_session_id,
        p_entry_id, p_card_type_id
      ) ON CONFLICT (user_id, client_event_id) DO NOTHING;
    END IF;

    SELECT * INTO v_binding
    FROM public.training_session_action_bindings AS binding
    WHERE binding.user_id = p_user_id
      AND binding.client_event_id = p_client_event_id
    FOR UPDATE;
    IF NOT FOUND
       OR v_binding.session_id IS DISTINCT FROM p_training_session_id
       OR v_binding.entry_id IS DISTINCT FROM p_entry_id
       OR v_binding.card_type_id IS DISTINCT FROM p_card_type_id THEN
      RAISE EXCEPTION 'training_session_action_binding_conflict';
    END IF;

    v_consumption := private.consume_training_session_member(
      p_user_id, p_training_session_id, p_entry_id, p_card_type_id
    );
    IF v_consumption->>'status' NOT IN (
      'consumed', 'consumed-complete', 'duplicate'
    ) THEN
      RAISE EXCEPTION 'training_session_member_not_available';
    END IF;
  END IF;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION private.perform_platform_v2_card_action_session_latch_v1(
  uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

-- Rollout phase 1 keeps the previous app image and cached first-party Library
-- bundles working. Their 12-argument first-party wire format is identical to
-- stale old Training, so this compatibility overload cannot fence that caller
-- without also breaking Library. Do not infer the surface from queue/member
-- state: Library is allowed to act on a queued entry. Current first-party
-- Library uses the 13-argument overload with explicit null; current Training
-- supplies a concrete session id and is fenced below. Issue #399 owns phase 2,
-- after the rollback/cache window, which will reject first_party here.
CREATE OR REPLACE FUNCTION public.perform_platform_v2_card_action_as_principal(
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
  v_jwt_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
  );
BEGIN
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user_id'; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

  IF p_auth_kind NOT IN ('first_party', 'connected_client') THEN
    RAISE EXCEPTION 'invalid_auth_kind';
  END IF;

  RETURN private.perform_platform_v2_card_action_non_session_latch_v1(
    p_user_id, p_action_id, p_entry_id, p_card_type_id, p_state_revision,
    p_active_known_mark_id, p_known_mark_revision, p_review_result,
    p_client_event_id, p_source_context, p_auth_kind, p_connected_client_id
  );
END;
$$;

ALTER FUNCTION public.perform_platform_v2_card_action_as_principal(
  uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.perform_platform_v2_card_action_as_principal(
  uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_platform_v2_card_action_as_principal(
  uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.perform_platform_v2_card_action_as_principal(
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
  p_connected_client_id text,
  p_training_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
  v_receipt_exists boolean;
BEGIN
  IF COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
  ) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user_id'; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

  -- The dedicated first-party Library server route passes an explicit null to
  -- identify an ordinary non-session action. Keep that trusted call path out
  -- of the 12-argument Connected Client compatibility overload.
  IF p_training_session_id IS NULL THEN
    RETURN private.perform_platform_v2_card_action_non_session_latch_v1(
      p_user_id, p_action_id, p_entry_id, p_card_type_id, p_state_revision,
      p_active_known_mark_id, p_known_mark_revision, p_review_result,
      p_client_event_id, p_source_context, p_auth_kind, p_connected_client_id
    );
  END IF;

  -- A completed action remains reconcilable after a takeover. New actions are
  -- fenced before the underlying mutation sees them.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_user_id::text || ':' || p_client_event_id::text)
  );
  SELECT EXISTS (
    SELECT 1 FROM public.platform_v2_action_receipts
    WHERE user_id = p_user_id AND client_event_id = p_client_event_id
  ) INTO v_receipt_exists;
  IF NOT v_receipt_exists THEN
    PERFORM private.require_active_training_session_v1(
      p_user_id, p_training_session_id
    );
  END IF;

  RETURN private.perform_platform_v2_card_action_session_latch_v1(
    p_user_id, p_action_id, p_entry_id, p_card_type_id, p_state_revision,
    p_active_known_mark_id, p_known_mark_revision, p_review_result,
    p_client_event_id, p_source_context, p_auth_kind, p_connected_client_id,
    p_training_session_id
  );
END;
$$;

ALTER FUNCTION public.perform_platform_v2_card_action_as_principal(
  uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.perform_platform_v2_card_action_as_principal(
  uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_platform_v2_card_action_as_principal(
  uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text, uuid
) TO service_role;

-- The immediately previous app image still reaches these exact RPCs as the
-- authenticated learner. Keep only those existing signatures executable for
-- the phase-1 rollback window. They are ambiguous with stale old Training and
-- therefore cannot be fenced honestly. Issue #399 removes this grant together
-- with first-party access to the 12-argument Platform V2 overload. Retired
-- aliases handle_review and start_learning_card remain absent.
REVOKE ALL ON FUNCTION public.handle_card_review(uuid, uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_learning_entry_card(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_card_review(uuid, uuid, text, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_learning_entry_card(uuid, uuid, text)
  TO authenticated;

COMMIT;
