# Tech Debt

## Active Structural Debt

### Documentation drift around `apps/api`

The main high-level docs now treat `apps/api` as a reserved boundary instead of an active service, but older package-level and feature docs may still assume a stronger API layer. Continue cleaning those references as they are touched.

### Canonical doc entrypoints were missing

The repo historically relied on `README.md`, `agents.md`, `docs/`, and `packages/docs/` without a single canonical starting point. Root `AGENTS.md` and `ARCHITECTURE.md` now exist, but older docs still need gradual cleanup.

### Flat `docs/` layout

Feature notes, runbooks, and one-off documents still live together in a flat top-level `docs/` folder. Over time, move stable intent into `docs/intent/` and keep runbooks/topic docs grouped deliberately.

### Validation guidance is still somewhat duplicated

Validation commands now have a canonical home in `AGENTS.md`, but related details still exist in `README.md`, `apps/ui/README.md`, and operational notes. Keep the duplication aligned or reduce it over time.
