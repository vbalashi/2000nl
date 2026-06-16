# Dictionary Search V2: Extracted Search Documents

Last updated: 2026-06-16
Status: active implementation plan

## Decision

Keep Supabase/Postgres RPCs as the access-control boundary, but move search
internals away from ranked scans over `word_entries.raw`.

The target model is extracted search documents in Postgres:

- `dictionary_search_documents`: one row per `word_entries.id`;
- `dictionary_search_fields`: one row per searchable field fragment;
- exact/prefix/full-text/trigram indexes over stored normalized values;
- future versioned matcher RPCs that join back to gated dictionary entries.

Do not introduce an external search service yet. The current scale and product
risk are in extraction, ranking, snippets, morphology, and access-control-safe
contracts, not distributed search infrastructure.

## Stage 2A: Schema Foundation

Implemented by `db/migrations/071_dictionary_search_documents.sql`.

Scope:

- add `pg_trgm` and `unaccent` extensions;
- add normalization helpers;
- add `dictionary_search_documents`;
- add `dictionary_search_fields`;
- add exact, trigram, and full-text indexes;
- add `refresh_dictionary_search_document(entry_id, version)`;
- add `rebuild_dictionary_search_documents(limit, version)`;
- keep direct table access revoked from `anon` and `authenticated`;
- do not route existing UI search to the new tables yet.

Validation:

- apply migration to local Supabase;
- run `select rebuild_dictionary_search_documents(5, 1);`;
- verify documents and field fragments are inserted.

## Stage 2B: Ingestion Integration

Update ingestion so search fields are extracted as part of dictionary import,
not inferred by the runtime search query.

Implemented:

- `packages/ingestion/src/importer/db.py` exposes an optional
  `refresh_dictionary_search_documents(...)` hook.
- `packages/ingestion/src/importer/core.py` refreshes documents after entry
  import/update batches when `--refresh-search-documents` is passed to
  `import_words_db.py`.
- `packages/ingestion/scripts/import_word_forms.py` refreshes touched documents
  after rebuilding `word_forms` when `--refresh-search-documents` is passed, so
  form fragments are included.

Operational note:

- ordinary `word_forms` import stays fast and does not refresh all search
  documents by default;
- full search-document backfill should be run as an explicit controlled job;
- local validation showed `import_word_forms.py` inserts `63137` form rows in a
  few seconds without refresh, and a targeted refresh makes `brandt` resolve to
  `branden` as `Woordvorm`.

Required field groups:

- `headword`;
- `form`;
- `alternate-headword`;
- `definition`;
- `context`;
- `example`;
- `idiom`;
- `translation`;
- `note`;
- filtered `fallback`.

`word_forms` should remain the highest-trust morphology source. Later generated
forms must carry lower confidence and explicit source metadata.

## Stage 2C: Matcher RPC

Add a versioned search RPC, tentatively `search_dictionary_entries_v2`, that:

- enforces `can_access_dictionary(...)`;
- accepts query, language, dictionary IDs, list scope, page, and page size;
- returns entry-level rows;
- returns `search_match_group`, `search_match_label`, `search_matched_text`,
  `search_matched_field`, `search_source_path`, group counts, and query
  normalization metadata;
- ranks lexical relevance before source priority except among equivalent
  matches;
- does not run raw fallback by default.

Global search and list-scoped filtering should share the matcher. Empty
list-scoped browse must preserve list order.

Implemented by `db/migrations/072_dictionary_search_v2_rpcs.sql`.

Client wrapper:

- `apps/ui/lib/training/listService.ts` exposes `searchDictionaryEntriesV2`.

The UI still calls the current production-safe search path until production has
run a full search-document backfill and the v2 regression corpus is green.

Local validation:

- `search_dictionary_entries_v2('huis', 'nl', ...)` returns exact `huis` before
  example matches after the `huis` document is refreshed;
- `search_dictionary_entries_v2('brandt', 'nl', ...)` returns `branden` as
  `lemma-or-inflection` with `search_matched_text = 'brandt'`;
- `lookup_dictionary_entries_v2('brandt', 'nl', ...)` resolves by `word-form`
  to `branden` and returns strict candidates only.

## Stage 2D: Exact Lookup V2

Add strict lookup, tentatively `lookup_dictionary_entries_v2`, with language and
optional dictionary filters.

It should resolve only:

1. exact typed headword;
2. normalized/accent-insensitive headword;
3. source-declared `word_forms`.

It must not return broad substring, example, definition, fuzzy, or fallback
matches.

Implemented by `db/migrations/072_dictionary_search_v2_rpcs.sql`.

## Regression Corpus

Use expected match group and relative ordering, not just "contains":

- `ster`
- `ste`
- `sterren`
- `brandt`
- `brandde`
- `gebrand`
- `huis`
- `huizen`
- `filmster`
- `minister`
- `siesta`
- `siësta`
- `siësta's`
- `'s`
- `bank`
- `toeschrijven aan`

## Open Questions Before V2 RPC

- Should generated Dutch forms be added now or after source-form regression
  coverage is stable?
- Which field policy should list-management search use: headword/forms only, or
  examples/definitions as an optional mode?
- Should fallback run only when stronger groups are empty, or only when the UI
  exposes broad search explicitly?
- How much query normalization metadata should be exposed to the UI?

## Findings And Rules For Next Time

### Findings

- The original `ster` production screenshot was not a database miss. Production
  RPCs already returned exact `ster`; the UI was showing stale `ste` results
  after an older async request overwrote the newer query.
- Production `word_forms` contains the key reported forms for this issue,
  including `ster`/`sterren` and `brandt`/`brandde`/`gebrand` for `branden`.
- Current global search is acceptable only as a short-term patch because it
  still ranks over live `word_entries.raw` paths and broad raw JSON fallback.
- The correct target is extracted Postgres search documents behind RPC access
  control, not browser-side table reads and not an external search service yet.
- `meaning_id` is present in the current consolidated schema. Treat the earlier
  consolidated-drift concern as resolved, not as an active blocker.
- Full `word_forms` import is fast when it only rebuilds `word_forms`; refreshing
  every search document during that same import is too heavy for the default
  path and must be a controlled backfill job.

### Mistakes Or Traps Observed

- Do not assume a visible UI search result reflects the latest typed query until
  request ordering is checked.
- Do not conflate global dictionary search, list-scoped filtering, and exact
  platform lookup; they have different contracts.
- Do not keep archives or old migration concerns in review prompts as if they
  are current blockers after the consolidated schema has been verified.
- Do not place temporary review artifacts in the repository root. Use
  `reports/review-packages/...` for handoff archives.
- Do not make ordinary ingestion unexpectedly run a full search-document
  backfill. Use explicit flags or separate jobs for expensive refresh work.
- Do not switch the UI to V2 by default until production has a full
  search-document backfill and the regression corpus is green.

### Correct Behavior Going Forward

- Keep stale-result protection in every async search surface that can receive
  overlapping requests.
- Keep Supabase/Postgres RPCs as the dictionary access-control boundary.
- Build and validate search in this order:
  1. schema and indexed search documents;
  2. controlled backfill;
  3. V2 matcher RPC validation;
  4. feature-flagged UI switch;
  5. default UI switch only after production QA.
- Use `word_forms` as high-confidence morphology and return the matched form in
  `search_matched_text`.
- Keep broad fallback off by default; fallback should be explicit or used only
  when stronger groups are absent.
- For list-management search, default to headword/forms unless the UI explicitly
  says it searches meanings/examples too.
- Before handing a review package to another agent, include `BUNDLE_INDEX.md`
  and verify the package path, archive contents, current branch, commit, and
  working-tree status.
