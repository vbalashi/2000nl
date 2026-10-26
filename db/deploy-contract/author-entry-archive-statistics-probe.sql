-- Read-only: populated retained tables must have statistics for the new columns.
-- Empty installations legitimately have no pg_stats rows after ANALYZE.
DO $archive_statistics$
BEGIN
  IF (SELECT reltuples > 0 FROM pg_class WHERE oid = 'public.word_entries'::regclass)
     AND (SELECT count(*) FROM pg_stats
          WHERE schemaname = 'public' AND tablename = 'word_entries'
            AND attname IN ('archived_at', 'content_version')) <> 2 THEN
    RAISE EXCEPTION 'Author-entry archive column statistics missing; apply migration 236';
  END IF;
END;
$archive_statistics$;
