# Pipelines

## Scrape
- Adapters in `packages/scraper` fetch or parse source-specific dictionary artifacts.
- The current Van Dale path centers on `packages/scraper/vandale_html_parser.py` and ingestion scripts that produce structured word-entry JSON under repo data directories.
- Keep adapters isolated from UI/runtime code; ingestion owns database loading.

## Ingest
- Validate and normalize source artifacts into `word_entries.raw`, `word_forms`, and curated `word_lists` / `word_list_items`.
- Apply migrations from `db/migrations` before loading data.
- Scripts live in `packages/ingestion/scripts`; see `packages/ingestion/SCRIPTS.md` for the current script inventory.

## Serve
- The current serving path is primarily Supabase/Postgres plus `apps/ui` server/client code.
- `apps/api` is a reserved boundary for future extraction, not the default place to look for active runtime behavior.
- Shared types derive from `packages/shared` and should remain compatible with both the current UI-led runtime and any future API extraction.

## Learn
- UI (`apps/ui`) consumes Supabase/RPC-backed data flows, renders cards for
  active modes/scenarios, and updates card state, review logs, and events
  through RPCs. Card-facing state is stored in `user_card_status`; legacy
  scheduler paths still synchronize through `user_word_status`.

## Naming & Layout
- Structured word content is currently stored under source-data directories such as `packages/ingestion/nl/vandale-nt2/data/words_content/` and loaded by ingestion scripts.
- Curated lists are represented by `word_lists` and `word_list_items`.
- Card types: defined once in `packages/shared/card-types` with per-language field selection.
