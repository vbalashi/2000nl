-- Rename misleading column frequency_rank to vandale_id.
--
-- This migration must be safe to run on:
-- - very old DBs that still have frequency_rank
-- - fresh DBs where 0001 already created vandale_id
-- - DBs where this migration already ran
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_entries'
      AND column_name = 'frequency_rank'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_entries'
      AND column_name = 'vandale_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.word_entries RENAME COLUMN frequency_rank TO vandale_id';
  END IF;
END
$$;
