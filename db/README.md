# db

Holds SQL migrations for the canonical schema. This folder contains consolidated migrations organized by domain.

## Migration Structure

```
db/migrations/
├── 001_core_schema.sql       # Tables, indexes, extensions, curated lists
├── 002_fsrs_engine.sql       # FSRS-6 algorithm, handle_review, handle_click
├── 003_queue_training.sql    # get_next_word, training stats, scenarios
├── 004_user_features.sql     # User settings, lists, translations, notes, subscription tiers
├── 005_security.sql          # RLS policies
├── bootstrap.sql             # Master script that runs all migrations
└── archive/                  # Historical individual migrations (reference only)
```

## Fresh Deploy

For a new database, run the bootstrap script:

```bash
PGPASSWORD=... psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/bootstrap.sql
```

## Adding New Features

When adding new features:
1. Add schema changes to the appropriate consolidated file (001-005)
2. Commit the changes

For temporary development migrations, you can create delta files (0040_*, etc.) and add them to `bootstrap.sql`, then merge them into the consolidated files before final commit.

## Migration Workflow

### Creating New Migrations

**IMPORTANT:** All schema changes MUST go through migration files. Never make manual changes in Supabase Dashboard or via adhoc SQL.

1. **Create migration file:**
   ```bash
   # Use sequential numbering: 006, 007, 008, etc.
   touch db/migrations/XXX_descriptive_name.sql
   ```

2. **Make migrations idempotent:**
   Use `DO $$` blocks or `IF NOT EXISTS` clauses:
   ```sql
   -- Good: Idempotent policy creation
   DO $$
   BEGIN
       IF NOT EXISTS (
           SELECT 1 FROM pg_policies
           WHERE tablename = 'my_table' AND policyname = 'my_policy'
       ) THEN
           CREATE POLICY my_policy ON my_table FOR SELECT USING (true);
       END IF;
   END $$;

   -- Good: Idempotent table creation
   CREATE TABLE IF NOT EXISTS my_table (...);

   -- Good: Idempotent column addition
   DO $$
   BEGIN
       IF NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'my_table' AND column_name = 'my_column'
       ) THEN
           ALTER TABLE my_table ADD COLUMN my_column TEXT;
       END IF;
   END $$;
   ```

3. **Test locally/staging:**
   ```bash
   db/scripts/psql_supabase.sh -f db/migrations/XXX_descriptive_name.sql
   ```

4. **Verify migration worked:**
   ```bash
   # Check policies
   db/scripts/psql_supabase.sh -c "SELECT * FROM pg_policies WHERE tablename = 'my_table';"

   # Check columns
   db/scripts/psql_supabase.sh -c "\d my_table"
   ```

5. **Commit to git:**
   ```bash
   git add db/migrations/XXX_descriptive_name.sql
   git commit -m "feat: Add migration for <feature>"
   ```

### ❌ Never Do These

- **Don't** create policies in Supabase Dashboard
- **Don't** run adhoc SQL in production without a migration file
- **Don't** modify schema manually and "fix it later"
- **Don't** skip testing migrations in staging first
- **Don't** forget to make migrations idempotent

### ✅ Always Do These

- **Always** create migration files for schema changes
- **Always** test migrations in staging before production
- **Always** use idempotent patterns (IF NOT EXISTS, DO $$ blocks)
- **Always** commit migrations to version control
- **Always** document why the migration was needed

### Checking for Drift

Before starting new work, check if production DB has drifted from migrations:

```bash
# Export current production schema
db/scripts/psql_supabase.sh -c "
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
" > /tmp/prod_policies.txt

# Compare with what's in migrations
# If you see policies not in your migrations, capture them!
```

### RLS Performance Best Practices

When creating RLS policies, follow these patterns for optimal performance:

```sql
-- ❌ SLOW: auth.uid() called per-row
CREATE POLICY my_policy ON my_table
FOR SELECT
USING (auth.uid() = user_id);

-- ✅ FAST: auth.uid() cached per-query (99% faster)
CREATE POLICY my_policy ON my_table
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);
```

**Key optimizations:**
1. Wrap `auth.uid()` with subquery: `(select auth.uid())`
2. Specify role: `TO authenticated` (not `TO public`)
3. Both changes force query planner to use InitPlan caching

Reference: [Supabase RLS Performance Guide](https://supabase.com/docs/guides/database/database-advisors?lint=0003_auth_rls_initplan)

## Running ad-hoc SQL against Supabase

Use the helper script which reads `SUPABASE_DB_URL` or `DATABASE_URL` from your environment (or falls back to the repo `.env.local`):

- Query: `db/scripts/psql_supabase.sh -c "select now();"`
- File: `db/scripts/psql_supabase.sh -f db/migrations/001_core_schema.sql`

## Schema Overview

### Core Tables

- `languages` - Supported languages
- `word_entries` - Dictionary entries with raw JSON data
- `word_lists` / `word_list_items` - Curated word lists (VanDale, VanDale 2k)
- `word_forms` - Inflections and conjugations

### FSRS State

- `user_word_status` - Per-user, per-word, per-mode FSRS scheduling state
- `user_review_log` - Audit trail of all reviews
- `user_events` - Generic event log

### User Features

- `user_settings` - User preferences (limits, modes, theme, subscription tier)
- `user_word_lists` / `user_word_list_items` - User-created lists
- `word_entry_translations` - Shared translations per word
- `user_word_notes` - Per-user notes on words
- `training_scenarios` - Grouped card modes for training

## Key Functions

| Function | Description |
|----------|-------------|
| `fsrs6_compute()` | Core FSRS-6 algorithm |
| `handle_review()` | Grade a card (success/fail/hard/easy) |
| `handle_click()` | "Show answer" click = lapse |
| `get_next_word()` | Queue-based card selector |
| `get_training_stats()` | Basic session statistics |
| `get_detailed_training_stats()` | Detailed counters for footer |
| `get_scenario_stats()` | Stats aggregated by scenario |
| `get_user_tier()` | Get user subscription tier |
| `search_word_entries_gated()` | Gated word search (free tier limit) |
| `fetch_words_for_list_gated()` | Gated list fetch (free tier limit) |

## Archive

The `archive/` folder contains the original individual migrations that were consolidated. These are kept for reference and git history but are not used for fresh deploys.
