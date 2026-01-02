# db

Holds SQL migrations for the canonical schema. This folder contains consolidated migrations organized by domain.

## Migration Structure

```
db/migrations/
├── 001_core_schema.sql       # Tables, indexes, extensions
├── 002_fsrs_engine.sql       # FSRS-6 algorithm, handle_review, handle_click
├── 003_queue_training.sql    # get_next_word, training stats, scenarios
├── 004_user_features.sql     # User settings, lists, translations, notes
├── 005_security.sql          # RLS policies
├── 0038_subscription_tier.sql    # [delta] Subscription tiers, gated word access
├── 0039_add_vandale_all_list.sql # [delta] VanDale (full) word list
├── bootstrap.sql             # Master script that runs all migrations
└── archive/                  # Historical individual migrations (reference only)
```

### Baseline vs Delta Migrations

- **001-005**: Consolidated baseline capturing schema state as of 2025-12-31
- **0038+**: Delta migrations for new features after consolidation

When adding new features, create new delta files (0040_*, 0041_*, etc.) and add them to `bootstrap.sql`.

## Fresh Deploy

For a new database, run the bootstrap script:

```bash
PGPASSWORD=... psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/bootstrap.sql
```

## Running ad-hoc SQL against Supabase

Use the helper script which reads `SUPABASE_DB_URL` or `DATABASE_URL` from your environment (or falls back to the repo `.env.local`):

- Query: `db/scripts/psql_supabase.sh -c "select now();"`
- File: `db/scripts/psql_supabase.sh -f db/migrations/0038_subscription_tier.sql`

## Schema Overview

### Core Tables

- `languages` - Supported languages
- `word_entries` - Dictionary entries with raw JSON data
- `word_lists` / `word_list_items` - Curated word lists
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

The `archive/` folder contains the original 37 individual migrations that were consolidated. These are kept for reference and git history but are not used for fresh deploys.
