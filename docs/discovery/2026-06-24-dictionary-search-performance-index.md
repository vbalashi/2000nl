# Dictionary Search Performance Index

Date: 2026-06-24

Issue: [#40](https://github.com/vbalashi/2000nl/issues/40)

## Purpose

This is the quick return point for the dictionary lookup/search performance
work. The detailed evidence lives in discovery notes, GitHub issue comments,
and commits. This file summarizes where to start, what changed, what was
measured, and what remains worth trying.

## Current State

The original multi-second lookup/search behavior has been reduced materially.
Grouped search and Van Dale-style result groups should remain enabled.

The current live direction is:

- use indexed dictionary search projections for catalog and authenticated
  lookup/search;
- keep grouped search split into headwords, examples, definitions, and
  alphabetical;
- keep exact counts out of the blocking path;
- measure user-visible AudioFilms extension latency through full nested
  `Server-Timing`;
- do not add speculative caches or extra queries unless a benchmark proves the
  tradeoff.

## Canonical Evidence Trail

Read in this order when returning to the task:

1. `docs/discovery/2026-06-24-vandale-style-dictionary-search.md`
   - Van Dale reference model.
   - Initial evidence that the old catalog lookup path took seconds.
   - Product grouping model: headwords, examples, definitions, alphabetical.
2. `docs/discovery/2026-06-24-dictionary-performance-diagnostics.md`
   - First production DB diagnosis.
   - Main early finding: strict lookup bypassed search indexes.
   - Initial slice plan for indexed lookup and alphabetical keyset behavior.
3. `docs/discovery/2026-06-24-dictionary-latency-benchmark-harness.md`
   - Repeatable benchmark harness.
   - Separates direct SQL, 2000NL HTTP, and AudioFilms proxy layers.
4. `docs/discovery/2026-06-24-body-group-cold-latency-fix.md`
   - Common-term examples/definitions cold-latency fix.
   - Page-order indexes and bounded body-group query branches.
5. `docs/discovery/2026-06-24-service-client-reuse-attribution.md`
   - Server-side Supabase service-client reuse attribution.
   - Low-risk cleanup for route/runtime churn.
6. GitHub issue #40
   - Running work log with live measurements, deployed commits, failed
     hypotheses, and current next-step recommendations.

## Major Changes Already Shipped

### Search Index and Grouped Search

- Built and backfilled `dictionary_search_documents` and
  `dictionary_search_fields`.
- Added Van Dale-style grouped search path.
- Added readiness/health checks for the dictionary search index.
- Made alphabetical search keyset-first and avoided blocking exact counts.
- Cleaned empty grouped-search items.

Representative commits:

- `a3e85105` / `a9df3ac0` - route public lookup through search index.
- `4b1ef429` / `886ce2e1` - make alphabetical search keyset first.
- `3c789291` / `1610fbc8` - bound grouped search body queries.

### Benchmarking and Attribution

- Added `db/scripts/dictionary_latency_benchmark.mjs`.
- Added route-level latency headers and request attribution.
- Used nuc host diagnostics to compare direct SQL with HTTP/PostgREST path.
- Exposed full nested 2000NL timings through AudioFilms diagnostics.

Representative commits:

- `7837b4cf` / `15301c77` - dictionary latency benchmark.
- `4f2f0fb5` / `fab1e5e9` - platform route latency headers.
- AudioFilms `1095149` - expose full dictionary platform timings.

### Body-Group Cold Latency

- Refactored examples/definitions body-group search so preview pages do not
  materialize complete common-term match sets before pagination.
- Added page-order partial indexes for examples/idioms and
  definitions/context/notes.
- Ran `ANALYZE dictionary_search_fields`.

Representative commits:

- `d9e31e4b` / `39934782` - optimize grouped body search cold latency.

### Authenticated Lookup Hot Path

- Authenticated lookup now resolves normal catalog entries through indexed
  search projections.
- Legacy fallback remains only for unindexed user dictionary entries.
- User-state list memberships and card states are fetched in parallel.
- Platform auth checks are timed and successful bearer/principal validations
  use a short in-memory cache.
- Lookup user-state and translation-cache enrichment run concurrently.

Representative commits:

- `27061759` / `1e06ed93` - indexed authenticated dictionary lookup.
- `2403435b` - fetch lookup user state in parallel.
- `b4153ee4` - instrument and parallelize platform auth checks.
- `916e3724` - short platform auth cache.
- `8778cac5` - parallelize lookup enrichment reads.

### Lookup Enrichment Indexes

- Added supporting indexes for authenticated lookup enrichment reads:
  - `word_list_items(word_id, list_id)`
  - `user_word_list_items(word_id, list_id)`
  - `word_entry_translations(word_entry_id, target_lang, provider)`

Representative commit:

- `41eb2ea2` - index lookup enrichment reads.

## Important Failed or Limited Hypotheses

- Optimistic default translation prefetch was tried and reverted.
  - Commit `cef0967c` regressed live lookup timing.
  - Commit `32d8ece8` reverted it.
- Direct pooled PostgreSQL was prototyped locally as a possible bypass for the
  Supabase/PostgREST boundary, but it did not beat the deployed path in that
  environment and was not shipped.
- The latest lookup enrichment index slice is safe scale hygiene, but it did
  not materially improve the current `Hoog` Chrome extension sample.

## Latest User-Visible Timing Snapshot

After `41eb2ea2` was live as version `0.18.327`, AudioFilms Chrome extension
timing for clicked word `Hoog` showed:

| Path | Timing |
| --- | ---: |
| lookup total | about 370 ms |
| AudioFilms fetch | 368 ms |
| 2000NL `route.total` | 265.0 ms |
| `route.auth` | 1.0 ms cache hit |
| `route.operation` | 261.3 ms |
| `lookup.db` | 100.1 ms |
| `lookup.translation-cache` | 123.0 ms |
| `lookup.user-state` | 156.1 ms |
| search total | about 177 ms |
| `search.db` | 79.9 ms |

Interpretation: search/index work is no longer the dominant blocker for this
sample. Remaining visible lookup latency is the operation payload plus proxy and
network overhead.

## Current Working Conclusion

Do not keep looking for isolated single-table indexes unless an `EXPLAIN` plan
proves one is missing. The main remaining opportunity is reducing blocking work
for the first visible dictionary card.

Best next candidates:

1. Fused lookup enrichment payload/RPC for external clicked-word cards.
   - Resolve entries, user state, and default translation context in one
     backend-shaped call if this can reduce round trips without adding
     speculative work.
2. Staged lookup response.
   - Return the first visible dictionary card as soon as lexical content is
     ready.
   - Hydrate user-state and translation after initial card render.
3. Request coalescing for repeated/bursty lookup/search.
   - Useful only after preserving freshness and user-state correctness.
4. Generation-aware public catalog caching.
   - Later optimization keyed by search-index generation/readiness metadata.
   - Should not hide unexplained first-request outliers.
5. AudioFilms-side UX mitigation.
   - If backend stays around 250-350 ms, improve perceived latency with
     immediate selected-word state and progressive card hydration.

## Do Not Reopen Without New Evidence

- Do not roll back grouped search.
- Do not restore exact blocking counts.
- Do not add external search infrastructure before exhausting the current
  Postgres/search-projection path.
- Do not re-add default translation prefetch in its previous form.
- Do not cache authenticated lookup responses wholesale; they include user
  state and potentially private entries.

## Useful Commands

Benchmark:

```bash
node db/scripts/dictionary_latency_benchmark.mjs \
  --queries ontdekken,de,het,zijn \
  --samples 30 \
  --hot-queries de,het \
  --hot-samples 100 \
  --layers sql,http-2000nl,audiofilms \
  --insecure-tls \
  --output tmp/dictionary-latency.jsonl \
  --summary-output tmp/dictionary-latency-summary.json
```

Live health:

```bash
curl -fsS 'https://2000.dilum.io/api/health?deep=1'
```

AudioFilms extension smoke:

```bash
cd /Users/khrustal/dev/audiofilms
node extensions/youtube-shadowing/scripts/smoke-chrome.mjs \
  --skip-backend-check \
  --reload-extension \
  --only=4EE7m94mJpk \
  --wait-ms 25000
```
