# VanDale full-list materialization follow-up

Observed during the local validation run on 2026-09-20.

The imported `nl-vandale` dictionary contains 18,163 entries. After a clean
local bootstrap, the materialized curated `vandale-all` list was empty; a
controlled local reconciliation was required to populate all 18,163 entries.

The importer currently reconciles the named list using `is_nt2_2000` unless
`--include-all-in-list` is supplied. The guarded local wrapper invokes the
default, NT2-oriented mode, so the full-list collection must have an explicit,
repeatable refresh contract: either reconcile `vandale-all` on every VanDale
import or make the full-list refresh an explicit controlled operation and
report its result.

Acceptance checks:

- after import, `count(vandale-all)` equals the accessible VanDale source-entry
  count for the imported source version;
- rerunning the same import is idempotent and removes stale full-list members;
- a full-list training plan can select entries outside NT2 2K;
- the Training UI either exposes the full list or clearly documents that only
  the 2K curated list is currently trainable.
