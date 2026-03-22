# packages/docs

Authoritative documentation for data flow, schemas, and contracts.

These docs are subordinate to the root `AGENTS.md` and `ARCHITECTURE.md`, which now act as the canonical repo entrypoints.

Core files:
- `architecture.md` – package-level layout and end-to-end flow (scrape → ingest → Postgres/Supabase → UI).
- `data-model.md` – tables, relationships, JSON schema links, examples.
- `pipelines.md` – scraper artifact contract, ingestion/validation steps, naming conventions.
- `card-types.md` – scenarios, render rules, per-language overrides.
- `contributing.md` – how to add a dictionary, language, card type, or list.
- `../ingestion/SCRIPTS.md` – ingestion scripts summary with timestamps and purposes.
