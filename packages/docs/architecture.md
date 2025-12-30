# Architecture

End-to-end flow: scrape → ingest → store → serve → learn.

- Scraper (`packages/scraper`): per-dictionary adapters emit validated JSON artifacts to `data/raw/<dictionary>/<lang>/<date>/headword.json`.
- Ingestion (`packages/ingestion`): validates artifacts against `packages/shared/schemas`, normalizes to relational schema, applies migrations from `db/migrations`, and logs rejects.
- Database (`db`): canonical schema for languages, dictionaries, notes, lists, user progress, and events.
- API (`apps/api`): serves notes/search, lists, training sessions, and progress mutations; imports shared types.
- UI (`apps/ui`): feature folders for dictionary browsing, list management, and training; uses shared types and card-type registry.
- Shared (`packages/shared`): schemas, types, card-type definitions that bind the stack.

Contracts:
- Artifacts: scraper output must match language template schema and include dictionary metadata/version.
- API types: derived from shared types to keep UI/API in sync.
- Card rendering: UI uses card-type registry to decide which fields show on prompt vs reveal; registry is language-agnostic with per-language field choices.
