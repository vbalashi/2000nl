BEGIN;

-- New Known decisions belong to one recall direction. Preserve historical
-- meaning-wide decisions and their paired Undo without rewriting receipts/FSRS.
ALTER TABLE public.user_card_known_marks
    ADD COLUMN IF NOT EXISTS mark_scope text NOT NULL DEFAULT 'meaning'
    CHECK (mark_scope IN ('direction', 'meaning'));

-- Existing audio marks have always been directional. Only ordinary recall
-- marks were mirrored by migration 138. This classification is retry-safe.
UPDATE public.user_card_known_marks
   SET mark_scope = 'direction'
 WHERE card_type_id NOT IN ('word-to-definition', 'definition-to-word')
   AND mark_scope = 'meaning';

ALTER TABLE public.user_card_known_marks
    ALTER COLUMN mark_scope SET DEFAULT 'direction';

COMMENT ON COLUMN public.user_card_known_marks.mark_scope IS
    'Server-owned scope: direction for new decisions; meaning preserves pre-193 paired decisions and Undo.';

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
    IF pg_trigger_depth() > 1 OR v_other_card_type IS NULL
       OR NEW.mark_scope <> 'meaning' THEN
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
            mark_event_id,
            mark_scope
        )
        SELECT
            gen_random_uuid(),
            NEW.user_id,
            NEW.entry_id,
            v_other_card_type,
            gen_random_uuid(),
            NEW.marked_at,
            NEW.mark_event_id,
            NEW.mark_scope
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
           AND sibling.mark_scope = 'meaning'
           AND sibling.mark_event_id = NEW.mark_event_id
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

REVOKE ALL ON FUNCTION private.sync_shared_meaning_known_mark()
    FROM PUBLIC, anon, authenticated;

COMMIT;
