# UI Database Notes

This file is only a local pointer for UI developers. The canonical database documentation lives in:

- `db/README.md` for migration workflow and fresh deploys.
- `db/migrations/001_core_schema.sql` through `007_review_idempotency.sql` for current schema/RPC behavior.
- `packages/docs/data-model.md` for table-level orientation.

Current UI-facing tables/RPCs:

- `word_entries`, `word_forms`, `word_lists`, `word_list_items`
- `user_card_status`, `user_review_log`, `user_events`
- `user_settings`, `user_word_lists`, `user_word_list_items`
- `word_entry_translations`, `user_word_notes`
- `get_next_card`, `record_card_view`, `handle_card_review`, `start_learning_entry_card`, stats/scenario RPCs

Fresh database setup should use:

```bash
PGPASSWORD=... psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/bootstrap.sql
```

Current ingestion should use scripts under `packages/ingestion/scripts`, especially `import_words_db.py` and `import_word_forms.py`.
