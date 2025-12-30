# db

Holds SQL migrations and seeds for the canonical schema. Ingestion applies these migrations before loading validated data. See `packages/docs/data-model.md` for table descriptions and `packages/docs/pipelines.md` for how ingestion writes into the schema. FSRS-6 scheduling lives in migrations `0010+` (state, functions, and RPCs); defaults are 10 new cards/day and unlimited reviews.

## Running ad-hoc SQL against Supabase

Use the helper script which reads `SUPABASE_DB_URL` or `DATABASE_URL` from your environment (or falls back to the repo `.env.local`):

- Query: `db/scripts/psql_supabase.sh -c "select now();"`
- File: `db/scripts/psql_supabase.sh -f db/migrations/0008_enable_rls.sql`
