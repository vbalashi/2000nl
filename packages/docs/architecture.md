# Architecture

This document covers the lower-level package/data flow. For the canonical repo-wide system map, start with `ARCHITECTURE.md` at the repo root.

End-to-end flow: scrape → ingest → store → serve → learn.

- Scraper (`packages/scraper`): source-specific adapters/parsers extract dictionary source data. The current Van Dale path uses `packages/scraper/vandale_html_parser.py`.
- Ingestion (`packages/ingestion`): normalizes source data from directories such as `packages/ingestion/nl/vandale-nt2/data/` into structured word-entry JSON, then loads `word_entries`, `word_forms`, `word_lists`, and list membership into Postgres.
- Database (`db`): canonical schema for languages, word entries, curated/user lists, user settings, progress, review logs, events, translations, and notes.
- Serve layer: today this is primarily Supabase/Postgres plus server/client code in `apps/ui`; `apps/api` remains a reserved boundary rather than the main runtime.
- UI (`apps/ui`): Next.js app for auth, training, list/settings flows, provider-backed translation/audio, and tests; uses Supabase clients/RPCs plus shared types and card-type registry.
- Shared (`packages/shared`): schemas, types, card-type definitions that bind the stack.

Contracts:
- Artifacts: current structured entries are JSON files under source-data directories such as `packages/ingestion/nl/vandale-nt2/data/words_content/`; preserve the `word_entries.raw` shape expected by UI helpers and ingestion.
- Shared types: keep DB-adjacent code, ingestion, and UI expectations aligned.
- Card rendering: active Dutch modes are implemented in `apps/ui/components/training/TrainingCard.tsx` and related helpers. The shared registry remains the intended extension point, not a complete runtime abstraction.
