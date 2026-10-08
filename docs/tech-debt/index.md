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

### Local QA contract signal and grouped-search readiness

Open evidence from 2026-09-29: [missing deployment ledger and empty search index](local-qa-contract-2026-09-29.md). UI expects `2000nl-db-176`; local health cannot read an actual contract, and the read-only checker confirms at least one ledger table is absent. This must be distinguished from a proven missing migration. Search backfill is a separate issue. The note includes reproduction, counts, repair boundaries and acceptance checks.

### Finite-session attribution benchmark

[Fixture and timing-event alignment](training-attribution-finite-session.md): the opt-in benchmark advances the card but lacks a matched finite-session transition timing event. Keep its performance budget and resolve the observability/test contract in a separate slice; normal browser smoke does not validate this benchmark.
