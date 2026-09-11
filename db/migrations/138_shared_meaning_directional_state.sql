-- One ordinary dictionary meaning owns Learn and Known across its two recall
-- directions. FSRS remains directional: no grade, due date or review history
-- is copied between word-to-definition and definition-to-word.
--
-- Existing Known rows are retained and completed with a sibling row carrying
-- the same original action event. An undo likewise clears the two rows with
-- the one actual undo event. This makes the shared decision reversible without
-- manufacturing historical actions.

BEGIN;

ALTER TABLE public.user_card_known_marks
    DROP CONSTRAINT IF EXISTS user_card_known_marks_mark_event_id_key;
ALTER TABLE public.user_card_known_marks
    DROP CONSTRAINT IF EXISTS user_card_known_marks_undo_event_id_key;

CREATE INDEX IF NOT EXISTS user_card_known_marks_mark_event_idx
    ON public.user_card_known_marks(mark_event_id);
CREATE INDEX IF NOT EXISTS user_card_known_marks_undo_event_idx
    ON public.user_card_known_marks(undo_event_id)
    WHERE undo_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.shared_meaning_other_direction(
    p_card_type_id text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE p_card_type_id
        WHEN 'word-to-definition' THEN 'definition-to-word'
        WHEN 'definition-to-word' THEN 'word-to-definition'
        ELSE NULL
    END;
$$;

CREATE OR REPLACE FUNCTION private.sync_shared_meaning_known_mark()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_other_card_type text := private.shared_meaning_other_direction(NEW.card_type_id);
BEGIN
    -- The sibling write below fires this trigger too. The originating mutation
    -- owns the entry-wide lock and performs the complete pair update.
    IF pg_trigger_depth() > 1 OR v_other_card_type IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext('shared-meaning-known:' || NEW.user_id::text || ':' || NEW.entry_id::text)
    );

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.user_card_known_marks (
            id,
            user_id,
            entry_id,
            card_type_id,
            revision,
            marked_at,
            mark_event_id
        )
        SELECT
            gen_random_uuid(),
            NEW.user_id,
            NEW.entry_id,
            v_other_card_type,
            gen_random_uuid(),
            NEW.marked_at,
            NEW.mark_event_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.user_card_known_marks sibling
            WHERE sibling.user_id = NEW.user_id
              AND sibling.entry_id = NEW.entry_id
              AND sibling.card_type_id = v_other_card_type
              AND sibling.cleared_at IS NULL
        );
    ELSIF OLD.cleared_at IS NULL AND NEW.cleared_at IS NOT NULL THEN
        UPDATE public.user_card_known_marks sibling
           SET cleared_at = NEW.cleared_at,
               undo_event_id = NEW.undo_event_id
         WHERE sibling.user_id = NEW.user_id
           AND sibling.entry_id = NEW.entry_id
           AND sibling.card_type_id = v_other_card_type
           AND sibling.cleared_at IS NULL;
    END IF;

    -- A card state revision is a UI concurrency token. The scheduler payload is
    -- unchanged, but a sibling display must not retain an actionable stale
    -- Known capability after this entry-level decision.
    UPDATE public.user_card_status
       SET state_revision = gen_random_uuid()
     WHERE user_id = NEW.user_id
       AND entry_id = NEW.entry_id
       AND card_type_id = v_other_card_type;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.shared_meaning_other_direction(text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_shared_meaning_known_mark()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS sync_shared_meaning_known_mark
    ON public.user_card_known_marks;
CREATE TRIGGER sync_shared_meaning_known_mark
AFTER INSERT OR UPDATE OF cleared_at ON public.user_card_known_marks
FOR EACH ROW
EXECUTE FUNCTION private.sync_shared_meaning_known_mark();

-- Backfill an active sibling mark for every old one-sided Known decision. The
-- copied row references the original immutable action event; no event is
-- synthesized. Existing two-sided rows remain untouched.
INSERT INTO public.user_card_known_marks (
    id,
    user_id,
    entry_id,
    card_type_id,
    revision,
    marked_at,
    mark_event_id
)
SELECT
    gen_random_uuid(),
    known.user_id,
    known.entry_id,
    private.shared_meaning_other_direction(known.card_type_id),
    gen_random_uuid(),
    known.marked_at,
    known.mark_event_id
FROM public.user_card_known_marks known
WHERE known.card_type_id IN ('word-to-definition', 'definition-to-word')
  AND known.cleared_at IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.user_card_known_marks sibling
      WHERE sibling.user_id = known.user_id
        AND sibling.entry_id = known.entry_id
        AND sibling.card_type_id = private.shared_meaning_other_direction(known.card_type_id)
        AND sibling.cleared_at IS NULL
  );

-- A prior Learn in either direction means the ordinary meaning is already
-- enrolled. Add a blank, learning sibling only when it never had one; the
-- existing direction's FSRS fields are left exactly as stored.
WITH enrolled AS (
    SELECT
        status.user_id,
        status.entry_id,
        bool_or(status.card_type_id = 'word-to-definition') AS has_direct,
        bool_or(status.card_type_id = 'definition-to-word') AS has_reverse
    FROM public.user_card_status status
    WHERE status.card_type_id IN ('word-to-definition', 'definition-to-word')
      AND (
          COALESCE(status.in_learning, false)
          OR COALESCE(status.fsrs_enabled, false)
          OR COALESCE(status.fsrs_reps, 0) > 0
          OR status.last_reviewed_at IS NOT NULL
      )
    GROUP BY status.user_id, status.entry_id
), missing_siblings AS (
    SELECT user_id, entry_id, 'definition-to-word'::text AS card_type_id
    FROM enrolled
    WHERE has_direct AND NOT has_reverse
    UNION ALL
    SELECT user_id, entry_id, 'word-to-definition'::text AS card_type_id
    FROM enrolled
    WHERE has_reverse AND NOT has_direct
)
INSERT INTO public.user_card_status (
    user_id,
    entry_id,
    card_type_id,
    fsrs_enabled,
    next_review_at,
    last_seen_at,
    seen_count,
    in_learning,
    hidden,
    frozen_until
)
SELECT
    user_id,
    entry_id,
    card_type_id,
    true,
    now(),
    NULL,
    0,
    true,
    false,
    NULL
FROM missing_siblings;

-- Learn remains one accepted action on the requested direction, while making
-- the other ordinary direction immediately eligible for self-assessed recall.
CREATE OR REPLACE FUNCTION public.start_learning_entry_card(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_dictionary_id uuid;
    v_other_card_type text := private.shared_meaning_other_direction(p_card_type_id);
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
    FROM public.word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'word entry not found';
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT public.can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RAISE EXCEPTION 'dictionary access denied';
    END IF;

    INSERT INTO public.user_card_status (
        user_id, entry_id, card_type_id, fsrs_enabled, next_review_at,
        last_seen_at, seen_count, in_learning, hidden, frozen_until
    )
    VALUES (
        p_user_id, p_entry_id, p_card_type_id, true, now(), now(), 1,
        true, false, null
    )
    ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
    SET fsrs_enabled = true,
        next_review_at = COALESCE(user_card_status.next_review_at, now()),
        last_seen_at = now(),
        seen_count = public.user_card_status.seen_count + 1,
        in_learning = true,
        hidden = false,
        frozen_until = null;

    IF v_other_card_type IS NOT NULL THEN
        INSERT INTO public.user_card_status (
            user_id, entry_id, card_type_id, fsrs_enabled, next_review_at,
            last_seen_at, seen_count, in_learning, hidden, frozen_until
        )
        VALUES (
            p_user_id, p_entry_id, v_other_card_type, true, now(), null, 0,
            true, false, null
        )
        ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
        SET fsrs_enabled = true,
            next_review_at = COALESCE(user_card_status.next_review_at, now()),
            in_learning = true,
            hidden = false,
            frozen_until = null;
    END IF;
END;
$$;

-- The state read must surface a mirrored Known overlay even if the sibling has
-- no status row (for example an old Known decision on an otherwise untracked
-- reverse direction).
CREATE OR REPLACE FUNCTION public.get_platform_v2_card_states_for_entries(
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
    WITH requested_entries AS (
        SELECT DISTINCT requested.entry_id
        FROM unnest(p_entry_ids) AS requested(entry_id)
    ), requested_card_types AS (
        SELECT DISTINCT requested.entry_id, card_choice.card_type_id
        FROM requested_entries requested
        CROSS JOIN LATERAL (
            SELECT unnest(p_card_type_ids) AS card_type_id
            WHERE p_card_type_ids IS NOT NULL
              AND array_length(p_card_type_ids, 1) IS NOT NULL
            UNION
            SELECT status.card_type_id
            FROM public.user_card_status status
            WHERE (p_card_type_ids IS NULL
                   OR array_length(p_card_type_ids, 1) IS NULL)
              AND status.user_id = p_user_id
              AND status.entry_id = requested.entry_id
            UNION
            SELECT known.card_type_id
            FROM public.user_card_known_marks known
            WHERE (p_card_type_ids IS NULL
                   OR array_length(p_card_type_ids, 1) IS NULL)
              AND known.user_id = p_user_id
              AND known.entry_id = requested.entry_id
              AND known.cleared_at IS NULL
        ) card_choice
    )
    SELECT
        requested.entry_id,
        requested.card_type_id,
        status.click_count,
        status.seen_count,
        status.success_count,
        status.last_seen_at,
        status.last_reviewed_at,
        status.next_review_at,
        status.hidden,
        status.frozen_until,
        status.in_learning,
        status.learning_due_at,
        status.fsrs_stability,
        status.fsrs_difficulty,
        status.fsrs_reps,
        status.fsrs_lapses,
        status.fsrs_last_grade,
        status.fsrs_last_interval,
        status.fsrs_params_version,
        status.state_revision,
        known.id,
        known.revision,
        known.marked_at
    FROM requested_card_types requested
    JOIN public.word_entries entry ON entry.id = requested.entry_id
    LEFT JOIN public.user_card_status status
      ON status.user_id = p_user_id
     AND status.entry_id = requested.entry_id
     AND status.card_type_id = requested.card_type_id
    LEFT JOIN public.user_card_known_marks known
      ON known.user_id = p_user_id
     AND known.entry_id = requested.entry_id
     AND known.card_type_id = requested.card_type_id
     AND known.cleared_at IS NULL
    WHERE entry.dictionary_id IS NULL
       OR public.can_access_dictionary(p_user_id, entry.dictionary_id, 'read');
END;
$$;

REVOKE ALL ON FUNCTION public.start_learning_entry_card(uuid, uuid, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_learning_entry_card(uuid, uuid, text)
    TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_platform_v2_card_states_for_entries(uuid, uuid[], text[])
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_v2_card_states_for_entries(uuid, uuid[], text[])
    TO authenticated;

COMMIT;
