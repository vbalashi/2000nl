# 2000nl Monorepo

This repository hosts the full stack for the 2000nl project. Scheduling for training now uses an FSRS-6 implementation that lives in Postgres (see `db/migrations/0010+`), with a 4-grade UI (again/hard/good/easy) and defaults of 10 new cards/day and unlimited reviews.

Deployed locally on `nuc` via Docker Compose. Caddy is a separate stack in `/srv/caddy` and proxies this app at `http://2000.nuc`.

- Local UI builds/linting require Node 20+ (some dependencies declare `node >= 20`). The Docker build uses `node:22-bookworm-slim`.

- `apps/ui/` – Next.js web client (moved from the original @2000nl-ui project).
- `apps/api/` – API service placeholder.
- `packages/ingestion/` – data validation and loaders (from @2000nl-db importer).
- `packages/scraper/` – scraping adapters (vandale parser included).
- `packages/shared/` – shared schemas, types, card-type registry.
- `packages/docs/` – architecture and contract docs.
- `db/` – SQL migrations and seeds consumed by ingestion/API.
- `ops/` – ops/CI/IaC placeholders.

See `packages/docs/README.md` for documentation pointers.

Helper docs:
- `packages/ingestion/SCRIPTS.md` – ingestion script purposes and timestamps.
- `agents.md` – how to connect with `psql` to Supabase for validating data.
