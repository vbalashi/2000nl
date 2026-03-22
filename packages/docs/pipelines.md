# Pipelines

## Scrape
- Adapters in `packages/scraper` fetch from sources (e.g., Van Dale NT2) and write artifacts to `data/raw/<dictionary>/<lang>/<YYYYMMDD>/`.
- Each artifact is a single note JSON matching the language schema in `packages/shared/schemas`.
- Include metadata: dictionary code, language code, source URL, version/date.

## Ingest
- Validate artifacts against shared schema; reject with reason when invalid.
- Normalize into tables: `languages`, `dictionaries`, `headwords`, `meanings`, `notes`, `lists`, `list_entries`.
- Apply migrations from `db/migrations` before loading data.
- Maintain a reject log (file or table) for manual cleanup.
- Scripts live in `packages/ingestion/scripts`; shared logic in `packages/ingestion/src/importer`.

## Serve
- The current serving path is primarily Supabase/Postgres plus `apps/ui` server/client code.
- `apps/api` is a reserved boundary for future extraction, not the default place to look for active runtime behavior.
- Shared types derive from `packages/shared` and should remain compatible with both the current UI-led runtime and any future API extraction.

## Learn
- UI (`apps/ui`) consumes Supabase/RPC-backed data flows, renders cards based on card types, and updates progress/events.

## Naming & Layout
- Raw artifacts: `data/raw/<dictionary>/<lang>/<YYYYMMDD>/<headword>.json`.
- Seeds: optional prebuilt lists (e.g., NT2 2k) under `db/seeds/` (future).
- Card types: defined once in `packages/shared/card-types` with per-language field selection.
