# Architecture

This document covers the lower-level package/data flow. For the canonical repo-wide system map, start with `ARCHITECTURE.md` at the repo root.

End-to-end flow: scrape → ingest → store → serve → learn.

- Scraper (`packages/scraper`): per-dictionary adapters emit validated JSON artifacts to `data/raw/<dictionary>/<lang>/<date>/headword.json`.
- Ingestion (`packages/ingestion`): validates artifacts against `packages/shared/schemas`, normalizes to relational schema, applies migrations from `db/migrations`, and logs rejects.
- Database (`db`): canonical schema for languages, dictionaries, notes, lists, user progress, and events.
- Serve layer: today this is primarily Supabase/Postgres plus server/client code in `apps/ui`; `apps/api` remains a reserved boundary rather than the main runtime.
- UI (`apps/ui`): feature folders for dictionary browsing, list management, training, and provider-backed flows; uses shared types and card-type registry.
- Shared (`packages/shared`): schemas, types, card-type definitions that bind the stack.

Contracts:
- Artifacts: scraper output must match language template schema and include dictionary metadata/version.
- Shared types: keep DB-adjacent code, ingestion, and UI expectations aligned.
- Card rendering: UI uses card-type registry to decide which fields show on prompt vs reveal; registry is language-agnostic with per-language field choices.
