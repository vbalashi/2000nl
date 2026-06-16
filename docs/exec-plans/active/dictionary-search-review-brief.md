# Dictionary Search Review Brief

Last updated: 2026-06-16
Status: review input

## Purpose

This brief describes the current dictionary search implementation, the data it
searches, and the ranking behavior that users see in `2000.dilum.io`.

It is intended as input for a senior review of search quality. The immediate
bug fix for stale UI results is already separate from this broader search
design review.

## Reviewer Prompt

Please review whether the current dictionary search model is good enough for a
dictionary-backed learning product, and recommend the next implementation path.

Focus on:

- whether we search the right fields;
- whether `word_forms` coverage is enough for Dutch morphology;
- whether ranking matches dictionary-user expectations;
- whether the current Postgres RPC approach should be improved or replaced by
  extracted search documents, Postgres full-text/trigram indexes, or another
  search layer;
- how global dictionary lookup, list filtering, and exact platform lookup
  should differ contractually.

## Production Facts From 2026-06-16

Observed against production `2000.dilum.io`:

- The UI search calls Supabase RPCs directly from the browser client.
- The production app was running version `0.18.227`, commit
  `3bcf929cd16308859f1f9d49ea91dba5063d1401`.
- Production health reported `database.target: remote`.
- Production had `word_forms` populated with about `46826` rows.
- `word_forms` contained relevant forms for the reported cases:
  - `ster`, `sterren`;
  - `brandt`, `brandde`, `brandden`, `gebrand`, mapped to `branden`.
- Production RPC `search_word_entries_gated('ster', ..., 'nl')` returned exact
  `STER` and `ster` at the top, with total around `918`.
- The user screenshot for input `ster` showed `3964` results and first entries
  `stedelijk`, `steeds`, `steeg`. Those exactly match the RPC result for
  `search_word_entries_gated('ste', ..., 'nl')`.

Conclusion: the reported `ster` screenshot was most likely caused by an async UI
race where an older `ste` request overwrote the newer `ster` results.

## Stage 1 Quick Fix

Implemented in commit `2d2d0a52 Fix stale dictionary search results`.

Files:

- `apps/ui/components/training/wordlist/DictionarySearchTab.tsx`
- `apps/ui/tests/TrainingScreen.test.tsx`
- `db/migrations/069_search_exact_case_tiebreak.sql`

Changes:

- `DictionarySearchTab` now tracks the latest request id and ignores stale
  results from older searches.
- A regression test simulates `ste` resolving after `ster` and verifies stale
  `ste` rows and count are not rendered.
- `search_word_entries_gated` now adds an exact-case tie-breaker, so query
  `ster` prefers lowercase `ster` before uppercase `STER` inside exact
  case-insensitive headword matches.

Validation:

- `cd apps/ui && npm test -- TrainingScreen.test.tsx`
- `cd apps/ui && npm run typecheck`
- `cd apps/ui && npm run lint`
- local SQL check after migration: query `ster` returned lowercase `ster`
  before uppercase `STER`.

## Search Surfaces

### 1. Global Dictionary Search

User-facing surface:

- `apps/ui/components/training/wordlist/DictionarySearchTab.tsx`
- `apps/ui/components/training/wordlist/WordListTab.tsx`

Client service:

- `apps/ui/lib/training/listService.ts`
- function: `searchWordEntries(filters)`

Database RPC:

- `db/migrations/069_search_exact_case_tiebreak.sql`
- function: `search_word_entries_gated(...)`

This is the main `Woordenboek zoeken` behavior. It accepts query, language, and
dictionary source filters, then returns ranked dictionary rows with match
metadata.

### 2. List-Scoped Filtering

User-facing surface:

- `DictionarySearchTab` when `applyListFilter` is enabled for a viewed list.
- `WordListTab` when the user is inspecting a specific list.

Client service:

- `apps/ui/lib/training/listService.ts`
- function: `fetchWordsForList(listId, listType, filters)`

Database RPC:

- currently latest implementation is derived from
  `db/migrations/050_gated_word_reads_use_card_status.sql`
- function: `fetch_words_for_list_gated(...)`

This is not global dictionary lookup. It filters entries inside one curated or
user list. It currently searches only `w.headword ILIKE '%' || p_query || '%'`
and preserves list order or user-list added order. It does not return
`search_match_group`, `search_match_label`, or snippets.

### 3. Exact Dictionary Entry Lookup

User-facing and integration surfaces:

- card/detail dictionary lookup in `apps/ui/lib/training/dictionaryService.ts`
- platform lookup in `apps/ui/lib/platform/platformApi.ts`
- HTTP endpoint documented as `POST /api/platform/lookup`

Database RPC:

- latest implementation in `db/migrations/049_lookup_uses_card_status.sql`
- function: `fetch_dictionary_entry_gated(p_headword text)`

This is read-only exact lookup, not broad search. It resolves one lookup
headword by trying exact headword, lowercase headword, then `word_forms`, and
returns all accessible candidates for the resolved headword.

## Data Storage Relevant To Search

### `dictionaries`

Holds dictionary source metadata: language, slug, name, kind, visibility,
ownership, editability, and schema identity.

Search uses it for:

- access control through `can_access_dictionary(...)`;
- dictionary source filtering;
- dictionary source display;
- ranking user-owned entries before curated sources when searching all sources.

### `dictionary_schemas`

Registry for raw entry schema variants. It is not searched directly, but it is
important because `word_entries.raw` shape depends on dictionary schema.

Reviewer question: should search know schema-specific paths, or should
ingestion extract searchable fields into normalized columns/tables?

### `word_entries`

Defined in `db/migrations/001_core_schema.sql`.

Important columns:

- `id`
- `dictionary_id`
- `language_code`
- `headword`
- `meaning_id`
- `part_of_speech`
- `gender`
- `is_nt2_2000`
- `vandale_id`
- `raw jsonb`

Rows are meaning-level entries. Multiple rows can share the same headword.

### `word_forms`

Defined in `db/migrations/001_core_schema.sql`, scoped by dictionary in
`db/migrations/012_scope_word_forms_by_dictionary.sql`.

Important columns:

- `language_code`
- `dictionary_id`
- `form`
- `word_id`
- `headword`

Used for lemma and inflection matching in both global search and exact lookup.

### Lists

Tables:

- `word_lists`
- `word_list_items`
- `user_word_lists`
- `user_word_list_items`

These define list membership and ordering. They are not dictionary search
indexes. List filtering currently uses list membership plus headword substring
matching.

## Word Forms Extraction

Implementation:

- `packages/ingestion/src/importer/word_forms.py`
- `packages/ingestion/scripts/import_word_forms.py`

The extractor collects forms from:

- parsed headword;
- `_metadata.headword_raw`;
- `_metadata.search_term`;
- `inflected_form`;
- `plural`;
- `diminutive`;
- `comparative`;
- `superlative`;
- `alternate_headwords`;
- `verb_forms`;
- `conjugation_table`.

It normalizes to lowercase, strips common separators, splits candidates on
commas/semicolons/slashes, and removes auxiliary words from participles such as
`heeft gebrand`.

Observed examples:

- `ster_zn_1.json` extracts `ster`, `sterren`.
- `branden` entries extract `brand`, `brandt`, `brandde`, `brandden`,
  `gebrand`, `branden`.

Reviewer question: this is source-form extraction, not a full Dutch lemmatizer.
Is that sufficient for lookup expectations?

## Current Global Search Ranking

`search_word_entries_gated(...)` currently builds candidates from accessible
entries and assigns each entry to its strongest match group.

Groups, in order:

| Rank | Group | Label | Current match rule |
|---|---|---|---|
| 1 | `exact-headword` | `Exacte match` | `lower(headword) = lower(query)` |
| 2 | `lemma-or-inflection` | `Woordvorm` | exact match in `word_forms.form` for the same word, language, and dictionary |
| 3 | `related-headword` | `Samenstelling` | `lower(headword) LIKE '%query%'` |
| 4 | `example` | `In voorbeeld` | selected raw example/translation paths contain query |
| 5 | `definition` | `In betekenis` | selected raw definition/context/notes paths contain query |
| 6 | `fallback` | `Bladeren` | `lower(raw::text) LIKE '%query%'` or browse with empty query |

Ordering inside ranked entries:

1. `search_group_rank`
2. dictionary priority:
   - current user's dictionary;
   - curated dictionary;
   - other accessible dictionaries
3. headword relevance:
   - exact lowercased headword;
   - prefix;
   - substring;
   - other
4. exact case tie-breaker:
   - exact typed casing;
   - same lowercase form;
   - other
5. `lower(headword)`
6. `meaning_id`

Returned match metadata:

- `search_group_rank`
- `search_match_group`
- `search_match_label`
- `search_matched_text`

Current gap: `search_matched_text` is returned as `NULL::text`, so the UI can
show why a row matched but not the exact snippet that matched.

## Current Raw JSON Paths Searched

The global search checks these raw paths:

Example group:

- `raw#>>'{example}'`
- `raw#>>'{meanings,0,example}'`
- `raw#>>'{meanings,0,examples}'`
- `raw#>>'{translation,text}'`

Definition group:

- `raw#>>'{definition}'`
- `raw#>>'{meanings,0,definition}'`
- `raw#>>'{meanings,0,context}'`
- `raw#>>'{notes}'`

Fallback group:

- `raw::text`

Reviewer question: this is schema-path specific and incomplete by design. It
may miss nested examples, idioms, labels, phrases, translations, and non-VanDale
schema shapes unless raw fallback catches them noisily.

## Current List Filtering

`fetch_words_for_list_gated(...)` has a different contract:

- requires list membership first;
- for curated lists, orders by `word_list_items.rank`, then `headword`;
- for user lists, orders by `added_at DESC`, then `headword`;
- query filter is only `w.headword ILIKE '%' || p_query || '%'`;
- does not search `word_forms`;
- does not search examples or definitions;
- does not return match metadata.

This means query `brandt` in a list view may fail or behave differently even if
global dictionary search can find `branden` through `word_forms`.

## Security And Access Control

All three read surfaces are gated:

- unauthenticated callers get empty or locked results;
- dictionary access is checked with `can_access_dictionary(...)`;
- user list reads check ownership for user lists;
- platform lookup uses the caller's Supabase JWT and remains read-only.

Reviewer question: as search grows, we must preserve these access boundaries in
any extracted search table or external search index.

## Known Gaps

1. `search_matched_text` is always null.
2. Example and definition search are hard-coded to a small set of raw JSON
   paths.
3. Broad `raw::text` fallback can produce noisy matches, for example query
   `brandt` matching unrelated raw fields or names like `Rembrandt`.
4. Substring matching is not token-aware or word-boundary-aware.
5. There is no `unaccent` or punctuation-insensitive normalization.
6. There is no fuzzy typo tolerance.
7. `word_forms` extraction depends on imported source fields and does not do
   general Dutch morphological analysis.
8. List filtering does not use `word_forms` or match metadata.
9. Group counts are not returned, so the UI cannot explain distribution without
   counting current page rows.
10. Search uses raw JSON scanning for example/definition/fallback groups, which
    may become expensive and difficult to tune.
11. Ranking does not yet distinguish prefix compounds from arbitrary substring
    matches inside `related-headword`.
12. There is no stable regression corpus for dictionary search quality.
13. Search behavior for user-owned dictionaries with different raw schemas is
    only partially covered by the current path-based raw search.

## Recommended Review Questions

1. Should global dictionary search remain a Postgres RPC, or should we add an
   extracted `dictionary_search_documents` table with weighted fields?
2. If staying in Postgres, should we use `pg_trgm`, full-text search, `unaccent`,
   generated columns, or a combination?
3. Should `raw::text` fallback remain enabled by default, or only run when
   stronger groups are empty?
4. Should list filtering reuse global search ranking inside the list scope?
5. How should Dutch morphology be handled beyond source-provided forms?
6. What should be the exact ranking between:
   - exact headword;
   - same headword with different case;
   - inflection;
   - prefix compound;
   - suffix compound;
   - arbitrary substring;
   - example;
   - definition;
   - raw fallback?
7. Should search return one row per meaning-level entry, or grouped headwords
   with expandable meanings?
8. Should snippets be extracted at ingestion time or computed at query time?
9. How should dictionary source priority work when the user selects one source
   versus all accessible sources?
10. What external dictionary products should we benchmark for expected
    behavior, and which scenarios matter most for Dutch learners?

## Suggested Regression Corpus

Use this corpus for manual probes and automated tests:

| Query | Expected behavior |
|---|---|
| `ster` | exact lowercase noun `ster` before broad `ste*` rows; uppercase `STER` should not hide noun result |
| `ste` | broad prefix/substring results are acceptable; must not overwrite later `ster` query |
| `sterren` | should resolve to `ster` via `word_forms` |
| `brandt` | should resolve to `branden` via `word_forms`; unrelated `Rembrandt` should be lower |
| `brandde` | should resolve to `branden` via `word_forms` |
| `gebrand` | should resolve to `branden` via `word_forms` |
| `huis` | exact `huis` before compounds such as `bejaardenhuis` |
| `huizen` | should resolve to `huis` via forms if present |
| `filmster` | related/compound behavior should be intentional |
| `minister` | should not outrank exact `ster` for query `ster` |
| `siesta` / `siësta` | clarify diacritic behavior |
| `'s` | clarify punctuation/apostrophe behavior |
| `toeschrijven aan` | clarify multi-word expression behavior |

## Files For Senior Review

Start here:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/intent/search-and-lists/search-ranking-grouping-contract.md`
- `docs/reference/api-functions/search-and-user.md`
- `docs/exec-plans/active/dictionary-schema-and-lookup-review.md`
- `docs/exec-plans/active/dictionary-search-review-brief.md`

Implementation:

- `apps/ui/components/training/wordlist/DictionarySearchTab.tsx`
- `apps/ui/components/training/wordlist/WordListTab.tsx`
- `apps/ui/lib/training/listService.ts`
- `apps/ui/lib/training/dictionaryService.ts`
- `apps/ui/lib/platform/platformApi.ts`
- `db/migrations/001_core_schema.sql`
- `db/migrations/012_scope_word_forms_by_dictionary.sql`
- `db/migrations/049_lookup_uses_card_status.sql`
- `db/migrations/050_gated_word_reads_use_card_status.sql`
- `db/migrations/068_optimize_gated_dictionary_search.sql`
- `db/migrations/069_search_exact_case_tiebreak.sql`
- `packages/ingestion/src/importer/word_forms.py`
- `packages/ingestion/scripts/import_word_forms.py`

Sample source data:

- `db/data/words_content/ster_zn_1.json`
- `db/data/words_content/branden_ww_1.json`
- `db/data/words_content/branden_ww_2.json`
- `db/data/words_content/branden_ww_3.json`
- `db/data/words_content/branden_ww_4.json`
- `db/data/words_content/fiets_zn_1.json`
- `db/data/words_content/bank_zn_1.json`
- `db/data/words_content/bank_zn_2.json`

## Proposed Next Implementation Options

### Option A: Small Postgres RPC Iteration

Scope:

- fill `search_matched_text`;
- search more structured raw paths;
- add group counts;
- add `word_forms` and match metadata to list filtering;
- add regression tests for the corpus above.

Pros:

- fastest path;
- minimal architecture change;
- keeps access control inside existing RPCs.

Cons:

- raw JSON path search will remain hard to tune;
- performance may degrade as dictionaries grow;
- schema-specific search logic stays embedded in SQL.

### Option B: Extracted Search Documents In Postgres

Scope:

- add `dictionary_search_documents` or equivalent;
- ingest weighted fields such as headword, forms, examples, definitions,
  translations, idioms, labels, and raw fallback text;
- add indexes for exact, prefix, full-text, trigram, and unaccent matching;
- keep RPC access control by joining back to `word_entries` and `dictionaries`.

Pros:

- clearer contract;
- easier snippets;
- better performance and ranking control;
- supports multiple dictionary schemas more cleanly.

Cons:

- requires migration and ingestion changes;
- needs backfill and consistency checks.

### Option C: External Search Layer Later

Scope:

- keep Postgres for canonical data and access control;
- index accessible dictionary documents into a search service.

Pros:

- strong relevance tooling for larger datasets.

Cons:

- access-control complexity;
- more operational surface;
- likely premature until corpus and ranking contract are stable.

## Recommendation For Next Slice

Prefer Option B as the design direction, but implement it incrementally.

Before building a new search table, ask the senior reviewer to validate:

- the field model for extracted search documents;
- exact ranking weights;
- whether Postgres FTS/trigram/unaccent is enough;
- how list filtering should reuse the same ranked matching inside list scope.

In parallel, keep the Stage 1 quick fix deployed because it addresses a real UI
race independent of search architecture.

## Senior Expert Verdict

Received 2026-06-16.

Decision:

- Stage 1 stale-result fix is correct and should be kept/deployed.
- The current ranked SQL over `word_entries.raw` is acceptable only as a
  short-term patch.
- Keep Supabase/Postgres RPCs as the access-control boundary.
- Do not move to an external search service yet.
- Build extracted, indexed search documents in Postgres and then route global
  search and list-scoped search through a shared matcher.

Immediate next slice:

1. Add `dictionary_search_documents` and `dictionary_search_fields`.
2. Add extraction versioning and backfill support.
3. Add exact, trigram, and full-text indexes.
4. Keep UI behavior unchanged until the new index can be validated.

Implementation plan:

- `docs/exec-plans/active/dictionary-search-v2-search-documents.md`
- `db/migrations/071_dictionary_search_documents.sql`
- `db/migrations/072_dictionary_search_v2_rpcs.sql`
