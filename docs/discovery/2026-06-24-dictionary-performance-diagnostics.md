# Dictionary Lookup/Search Performance Diagnostics

Date: 2026-06-24
Status: active discovery
Owner boundary: 2000NL owns the backend/API/database behavior. AudioFilms is a
connected client and an external timing surface.

## Trigger

After Van Dale-style grouped search was deployed and the production search index
was fully backfilled, dictionary lookup/search started returning correct data
again but still felt very slow in the Chrome extension and in direct 2000NL
search. The test word reported by the user was `ontdekken`.

Production search index health at the start of this diagnostic pass:

- `dictionary_search_documents`: 17,409 rows
- `dictionary_search_fields`: 137,799 rows
- active extraction version: 2
- stale document count: 0
- pending backfill: false

## External Timing Sample

Measured against the live AudioFilms proxy with:

```text
POST https://audiofilms-api.dilum.io/api/dict/lookup
{"clickedForm":"ontdekken","sourceLanguageCode":"nl"}

POST https://audiofilms-api.dilum.io/api/dict/search
{"clickedForm":"ontdekken","sourceLanguageCode":"nl","limit":6}
```

| Path | Request 1 | Request 2 | Request 3 | Notes |
| --- | ---: | ---: | ---: | --- |
| AudioFilms lookup | 1.088s | 0.776s | 0.731s | Warm path is still too slow for click-to-card UI. |
| AudioFilms grouped search | 0.341s | 0.317s | 0.320s | Noticeably better, but still above Van Dale-style backend latency. |

Earlier same-day samples showed the same shape:

- lookup: about `0.74-0.82s` warm, with a cold request around `3.18s`;
- grouped search: about `0.33-0.34s` warm, with a cold request around `2.07s`.

`time_starttransfer` was effectively equal to `time_total`, which means the
delay is server-side preparation, not response download time.

Direct 2000NL catalog HTTP timing could not be captured from the local env in
this pass because the local AudioFilms env does not contain
`DICTIONARY_2000NL_CATALOG_ACCESS_TOKEN`. Attempts with the stale local user
token returned `401 invalid_bearer_token`, so those HTTP numbers are not useful.
Database timings below are the authoritative root-cause evidence.

## Production DB Timing

All DB checks were read-only and run against production through
`db/scripts/psql_supabase.sh`.

Top-level RPC timings:

| SQL | Execution time | Buffers / temp |
| --- | ---: | --- |
| `lookup_public_catalog_entries_v1('ontdekken','nl',10)` | 525.371ms | shared hit=5,675 |
| `search_public_dictionary_groups_v1('ontdekken','nl',NULL,6,NULL)` | 70.413ms | shared hit=3,179; temp read/write=326/326 |

Grouped search broken down by group:

| Group RPC | Execution time | Notes |
| --- | ---: | --- |
| `headwords` | 12.975ms | Uses search index tables. |
| `examples` | 2.627ms | Uses search fields. |
| `definitions` | 1.835ms | Uses search fields. |
| `alphabetical` | 30.139ms | Materializes/counts all visible docs and spills temp blocks. |

## Primary Bottleneck: Strict Lookup Bypasses Search Index

The strict clicked-word lookup resolver currently filters `word_entries` like
this:

```sql
lower(w.headword) = v_query
OR normalize_dictionary_search_text_unaccent(w.headword) = v_query_unaccent
```

The second predicate calls a normalization function per row. Postgres chooses a
sequential scan over `word_entries`:

| Candidate path | Execution time | Plan shape |
| --- | ---: | --- |
| Current `word_entries` resolver query | 1011.451ms | `Seq Scan on public.word_entries`; 17,407 rows removed by filter |
| Equivalent exact lookup via `dictionary_search_documents` | 0.277ms | `Bitmap Index Scan` on existing exact headword indexes |

This is the main reason click-to-card lookup feels slow. With only about 17k
entries it already costs roughly half a second to one second inside Postgres. At
hundreds of thousands or millions of entries this path will not scale.

Relevant existing indexes already present:

- `dictionary_search_documents_exact_headword_idx`
- `dictionary_search_documents_exact_headword_unaccent_idx`
- `dictionary_search_documents_browse_idx`
- `dictionary_search_fields_exact_text_idx`
- `dictionary_search_fields_exact_text_unaccent_idx`

The scalable path already exists. The strict lookup resolver just does not use
it yet.

## Secondary Bottleneck: Alphabetical Group Exact Count

Grouped search is much faster than lookup, but the `alphabetical` group has a
separate scaling issue. It currently:

1. materializes all visible `dictionary_search_documents` for the language;
2. computes `COUNT(*)`;
3. then returns the first page near the query.

At 17k entries this costs about `30ms` inside Postgres and spills temp blocks.
At millions, an exact total count on every preview request is the wrong shape.

The page itself should be an indexed keyset query over
`dictionary_search_documents_browse_idx`. Exact counts should be avoided,
cached, capped, or turned into estimates depending on product requirements.

## Working Conclusions

1. The current pain is not explained by having "only" 17k rows. The problem is
   that strict lookup uses a non-index-friendly resolver path.
2. The first backend fix should rewrite
   `private.resolve_dictionary_lookup_candidates_v1` to resolve exact headwords
   from `dictionary_search_documents` and trusted inflections from
   `dictionary_search_fields`.
3. The first fix should keep the same lookup semantics:
   headwords first, form fallback only when no exact headword exists, same
   public catalog/user dictionary access boundary, same output contract.
4. Expected DB target after the first fix: strict lookup candidate resolution in
   low single-digit milliseconds, and top-level catalog lookup no longer bound
   by a 500ms scan.
5. The second backend fix should change alphabetical grouped search from
   materialize-and-count to keyset-first. Returning an exact `Alphabetical
   (17409)` count should not block first paint.
6. Examples and definitions are currently fast for `ontdekken`, but exact counts
   for very common words will also need a cap/estimate strategy before the
   dictionary grows toward millions.

## Recommended Work Slices

### Slice 1: Indexed strict lookup

- Replace the headword candidate subquery in
  `private.resolve_dictionary_lookup_candidates_v1` with
  `dictionary_search_documents` exact normalized lookups.
- Replace the form fallback with `dictionary_search_fields` where
  `field_group = 'form'`.
- Keep hydration from `word_entries` after candidate resolution so the response
  payload remains compatible.
- Add/extend SQL characterization tests for exact headword, diacritic-insensitive
  headword, and inflection fallback.
- Apply to production, then re-measure:
  - `lookup_public_catalog_entries_v1('ontdekken','nl',10)`
  - AudioFilms `/api/dict/lookup` for `ontdekken`

### Slice 2: Scalable alphabetical group

- Make the alphabetical group page query use the browse index directly.
- Stop exact-counting all visible documents per request.
- Decide the response contract for group counts:
  - `total: null` plus `hasMore`;
  - capped total such as `1000+`;
  - cached/periodic dictionary-level count;
  - estimate from planner/statistics.
- Add tests for cursor stability and first page around the query.

### Slice 3: Count policy for large dictionaries

- Define a product/API count policy for examples and definitions before corpus
  growth.
- Prefer `LIMIT + 1` for first paint and optional background/cached counts for
  "More results" UI.
- Keep the Van Dale-style group order and previews, but do not require exact
  total counts in the blocking request path.

## Architect Review Prompt

Please review the 2000NL dictionary lookup/search backend performance plan.
Focus on whether the proposed split is correct:

- strict clicked-word lookup should use exact indexed lexical evidence from
  `dictionary_search_documents` / `dictionary_search_fields`;
- discovery/grouped search should remain a separate Van Dale-style grouped
  search path;
- alphabetical and broad group counts should move away from exact per-request
  counts before the corpus grows.

Key files:

- `db/migrations/088_strict_dictionary_lookup_rpcs.sql`
- `db/migrations/090_dictionary_grouped_search_rpcs.sql`
- `db/migrations/091_clean_grouped_search_empty_items.sql`
- `apps/ui/lib/platform/platformApi.ts`
- `docs/discovery/2026-06-24-dictionary-performance-diagnostics.md`

The main evidence to challenge or confirm is the measured gap:

- current strict lookup candidate path via `word_entries`: about `1011ms`;
- equivalent indexed candidate path via `dictionary_search_documents`: about
  `0.277ms`;
- current top-level catalog lookup RPC: about `525ms`;
- grouped search RPC: about `70ms`, with alphabetical responsible for about
  `30ms`.
