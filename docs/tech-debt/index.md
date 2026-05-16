# Tech Debt

## Active Structural Debt

### Historical docs and reports

Live repo docs now treat `apps/api` as a reserved boundary and describe the current `word_entries` / Supabase RPC runtime. Historical reports and archived migration notes may still mention older API-layer or normalized-table assumptions; treat those as snapshots unless they are explicitly refreshed.

### Canonical doc entrypoints were historically missing

The repo historically relied on `README.md`, `docs/`, and `packages/docs/` without a single canonical starting point. Root `AGENTS.md` and `ARCHITECTURE.md` now exist; keep new stable guidance anchored there and link outward to topic docs.

### Flat `docs/` layout

Feature notes, runbooks, and one-off documents still live together in a flat top-level `docs/` folder. Over time, move stable intent into `docs/intent/` and keep runbooks/topic docs grouped deliberately.

### Validation guidance is still somewhat duplicated

Validation commands now have a canonical home in `AGENTS.md`, but related details still exist in `README.md`, `apps/ui/README.md`, and operational notes. Keep the duplication aligned or reduce it over time.
