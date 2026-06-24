# Van Dale Style Dictionary Search Implementation Plan

Date: 2026-06-24
Status: active planning / issue-ready breakdown
Primary repo: `vbalashi/2000nl`
Related client repo: `vbalashi/audiofilms`

## Objective

Redesign 2000NL dictionary lookup/search so AudioFilms word clicks become fast
and precise, while broader discovery follows a Van Dale-style grouped model.

Architecture split approved by senior review:

- `/api/platform/v1/lookup` and `/api/platform/v1/catalog/lookup` are strict
  lexical lookup endpoints.
- `/api/platform/v1/search` and `/api/platform/v1/catalog/search` are grouped
  discovery endpoints.
- The surfaces share normalization, access scoping, and projections, but not
  one large SQL query.

Reference evidence:

- `docs/discovery/2026-06-24-vandale-style-dictionary-search.md`
- senior review pasted text attached to the originating Codex thread
- existing search-doc plan:
  `docs/exec-plans/active/dictionary-search-v2-search-documents.md`

## Target Behavior

Strict lookup:

- returns exact, normalized, case-insensitive, and accent-insensitive headword
  candidates;
- only if no headword candidate exists, resolves trusted `word_forms`;
- returns every accessible candidate at the selected resolution tier;
- never returns prefix, substring, example, definition, fuzzy, alphabetical, or
  raw JSON fallback matches;
- treats `contextText` and `intent` as metadata, not matcher switches.

Grouped search:

- returns a Van Dale-style grouped DTO:
  `headwords`, `examples`, `definitions`, `alphabetical`;
- has symmetric authenticated and catalog/public surfaces;
- applies access scope in SQL before counts and candidate generation;
- hydrates small preview rows per group;
- paginates each group independently with opaque cursors;
- returns `503 search_index_not_ready` when grouped indexes are not ready.

AudioFilms compatibility:

- keep existing `cards[]` derived only from strict lookup `items`;
- do not put field matches or alphabetical results into lookup `items`;
- introduce grouped search as a separate adapter or additive later response.

## Execution Order

1. Freeze strict lookup policy and grouped result-unit contract.
2. Add schema/extractor changes required for stable field results.
3. Implement strict lookup RPCs and wire `/lookup` + `/catalog/lookup`.
4. Add tests and feature flag/shadow comparison for strict lookup.
5. Add search-document readiness/deep-health fields.
6. Build resumable search-document backfill and freshness policy.
7. Implement grouped search RPCs and API routes dark-launched.
8. Integrate grouped search into AudioFilms after the strict lookup latency fix
   is stable.

## Issue Drafts

### Issue 1: Freeze Platform Lookup And Search Contracts

Repo: `vbalashi/2000nl`
Labels: `2000nl`, `platform-api`, `dictionary`, `architecture`

Goal:
Document the approved split between strict lookup and grouped discovery search,
including request/response contracts and migration compatibility rules.

Scope:

- Update `docs/reference/platform-api.md` with strict lookup semantics.
- Add grouped search contract for:
  - `POST /api/platform/v1/search`
  - `POST /api/platform/v1/catalog/search`
- Define group IDs: `headwords`, `examples`, `definitions`, `alphabetical`.
- Define item types:
  - entry/headword result;
  - field-match result keyed by `(entryId, sourcePath)`;
  - alphabetical browse result.
- Define error behavior, especially `search_index_not_ready`.
- State that `intent` and `contextText` are metadata, not matcher switches.
- State that `cards[]` in AudioFilms remains strict lookup-derived.

Acceptance criteria:

- Docs clearly distinguish lookup from search.
- Docs specify guest vs authenticated scope differences.
- Docs explicitly prohibit broad fallback in lookup.
- Docs define pagination and totals for grouped search.
- The regression corpus is listed in the contract or linked from it.

Dependencies:

- Discovery note and senior review.

### Issue 2: Add Stable Search Field Identity And Extraction Metadata

Repo: `vbalashi/2000nl`
Labels: `2000nl`, `database`, `dictionary-search`, `migration`

Goal:
Prepare `dictionary_search_documents` and `dictionary_search_fields` for stable
grouped field results and resumable backfills.

Scope:

- Treat `(entry_id, source_path)` as the stable field-result identity.
- Add or validate stable ordering fields such as `meaning_ordinal` and
  `item_ordinal`.
- Review idiom extraction and split idiom expression from explanation when
  needed.
- Keep translations out of `definitions` unless cross-language search becomes
  explicit.
- Add or validate browse index:
  `(language_code, normalized_headword_unaccent, normalized_headword,
  dictionary_id, entry_id)`.
- Evaluate partial GIN indexes for:
  - examples/idioms;
  - definitions/context/notes.
- Update extraction versioning so stale documents can be detected.

Acceptance criteria:

- Field matches can be keyed without relying on unstable `bigserial id`.
- Example and definition group rows can be ordered deterministically.
- Migration tests cover the new fields/indexes.
- Existing direct table access restrictions remain intact.

Dependencies:

- Issue 1 contract decisions.

### Issue 3: Implement Strict Authenticated And Catalog Lookup RPCs

Repo: `vbalashi/2000nl`
Labels: `2000nl`, `database`, `platform-api`, `performance`

Goal:
Replace broad search behavior in `/lookup` and `/catalog/lookup` with bounded
strict headword/form lookup.

Scope:

- Add new RPCs rather than modifying broad search RPCs in place.
- Candidate names from senior review:
  - `private.resolve_dictionary_lookup_candidates_v1(...)`
  - `lookup_dictionary_entries_v3(...)`
  - `lookup_public_catalog_entries_v1(...)`
- Query shape:
  1. probe exact/normalized/unaccented headwords;
  2. only if no headwords exist, probe trusted `word_forms`;
  3. dedupe entry IDs;
  4. apply dictionary access in SQL;
  5. hydrate `word_entries` and dictionary metadata for a small capped set.
- Do not materialize all visible entries.
- Do not read `raw` during matching.
- Do not calculate broad totals.
- Do not use `%query%`.

Acceptance criteria:

- `oog` returns only `oog` headword entries, not `ogen`, `oogarts`, or `ooglid`.
- `brandt` resolves to `branden` through trusted forms when no headword exists.
- `de` returns `de`, not `deadline`, `deal`, or other alphabetical neighbors.
- Misses return `items: []`.
- Authenticated and catalog wrappers use the same strict policy.
- Catalog wrapper is SQL-limited to `system` and `public` dictionaries.
- p95 database execution target is under `20ms` for warm strict lookups at
  current scale, with p99 under `50ms`.

Dependencies:

- Issue 1.

### Issue 4: Wire Strict Lookup Into Platform Routes Behind A Feature Flag

Repo: `vbalashi/2000nl`
Labels: `2000nl`, `platform-api`, `feature-flag`, `testing`

Goal:
Make Platform lookup routes use strict RPCs safely, with rollback and shadow
comparison.

Scope:

- Update `apps/ui/lib/platform/platformApi.ts` lookup path.
- Ensure `intent === "external-click"`, `languageCode`, and `contextText` no
  longer switch to broad search.
- Add a server-side feature flag for strict lookup route selection.
- Optionally run shadow comparison against current broad RPC in logs/metrics.
- Preserve `{ query, request, items }` response shape.
- Keep user-state, list membership, action capability, and translation cache
  hydration behavior after strict entry resolution.

Acceptance criteria:

- Existing Platform API tests pass with updated strict expectations.
- New route tests assert no alphabetical neighbors for `de`, `oog`, and `huis`.
- Existing AudioFilms contract shape remains compatible.
- Rollback is possible by toggling the feature flag.
- Lookup latency instrumentation is available.

Dependencies:

- Issue 3.

### Issue 5: Add Lookup/Search Boundary Instrumentation

Repo: `vbalashi/2000nl`
Labels: `2000nl`, `observability`, `performance`

Goal:
Expose enough timing and readiness evidence to diagnose lookup/search behavior
without guessing.

Scope:

- Add `Server-Timing` or equivalent internal timing fields for:
  - `lookup.db`
  - `lookup.projection`
  - `lookup.user-state`
  - `lookup.translation-cache`
  - `search.headwords`
  - `search.examples`
  - `search.definitions`
  - `search.alphabetical`
- Add deep-health fields for:
  - search document row count;
  - search field row count;
  - active extraction version;
  - stale document count;
  - pending refresh/backfill state.
- Keep sensitive data out of logs and responses.

Acceptance criteria:

- Production health can distinguish "lookup available" from
  "grouped search index not ready".
- A slow lookup can be attributed to DB, projection, user-state, translation
  cache, or external boundary.
- No secrets or raw private content appear in logs.

Dependencies:

- Can start after Issue 1; useful before or alongside Issues 3 and 6.

### Issue 6: Build Resumable Search Document Backfill And Freshness Policy

Repo: `vbalashi/2000nl`
Labels: `2000nl`, `database`, `operations`, `dictionary-search`

Goal:
Populate and keep fresh `dictionary_search_documents` and
`dictionary_search_fields` safely in production.

Scope:

- Replace one huge `rebuild_dictionary_search_documents(...)` operational run
  with a resumable batch process.
- Process roughly `250-500` entry IDs per batch.
- Commit between batches and record cursor/progress.
- Add extraction-version and source-fingerprint checks.
- Define freshness paths:
  - synchronous refresh for single-entry user CRUD RPCs;
  - batched refresh for dictionary imports;
  - queue or touched-entry batching for `word_forms` rebuilds.
- Add runbook instructions and failure recovery.

Acceptance criteria:

- Backfill can resume after interruption.
- Backfill progress is observable.
- Running a representative sample populates docs and fields correctly.
- Full backfill does not require one long transaction.
- Deep health reports ready/not-ready accurately.

Dependencies:

- Issue 2.
- Issue 5 for readiness reporting is strongly recommended.

### Issue 7: Implement Grouped Search RPCs

Repo: `vbalashi/2000nl`
Labels: `2000nl`, `database`, `platform-api`, `dictionary-search`

Goal:
Implement Van Dale-style grouped search over extracted search tables.

Scope:

- Add private group search function, for example:
  `private.search_dictionary_group_v1(...)`.
- Add wrappers:
  - `search_dictionary_groups_v1(...)`
  - `search_public_dictionary_groups_v1(...)`
- Initial search request returns previews for all groups.
- Group-specific request returns one group page.
- Use four independent bounded subqueries:
  - headwords: normalized document/form probes;
  - examples: `field_group` filter plus text search over examples/idioms;
  - definitions: definition/context/note fields;
  - alphabetical: keyset range scan over ordered headword index.
- Use opaque cursors, not deep offset pagination.
- Avoid global `UNION`, global `DISTINCT ON (entry_id)`, and global sort before
  `LIMIT`.

Acceptance criteria:

- Response follows `dictionary-search-v1`.
- `oog` shows headwords, examples, definitions, and alphabetical as separate
  groups.
- Examples and definitions can both show matches from the same entry when both
  contain the query.
- Alphabetical is a true browse window anchored near the normalized query, not
  `%query%` related-headword search.
- If search index is not ready, endpoint can return `503 search_index_not_ready`.
- p95 database execution target is under `50-60ms` for warm grouped previews,
  with p99 under `100ms` at current scale.

Dependencies:

- Issue 1.
- Issue 2.
- Issue 6 for full production enablement.

### Issue 8: Add Platform Search API Routes

Repo: `vbalashi/2000nl`
Labels: `2000nl`, `platform-api`, `external-client`, `dictionary-search`

Goal:
Expose grouped search through symmetric authenticated and catalog endpoints.

Scope:

- Add:
  - `POST /api/platform/v1/search`
  - `POST /api/platform/v1/catalog/search`
- Authenticated route searches dictionaries accessible to the principal.
- Catalog route searches only `system` and `public` dictionaries.
- Do not hydrate progress, list memberships, actions, translations, full card
  content, or `raw` by default.
- Return grouped DTO and group-specific pagination.
- Return `503 search_index_not_ready` when readiness checks fail.

Acceptance criteria:

- Guest and authenticated routes share schema and group semantics.
- Counts and candidates are access-filtered in SQL.
- API tests cover public/private data separation.
- API tests cover initial preview and group-specific pagination.

Dependencies:

- Issue 7.
- Issue 5 readiness reporting.

### Issue 9: AudioFilms Strict Lookup Compatibility Verification

Repo: `vbalashi/audiofilms`
Labels: `audiofilms`, `extension`, `dictionary`, `external-client`

Goal:
Verify AudioFilms remains compatible when 2000NL lookup becomes strict and
faster.

Scope:

- Keep AudioFilms `/api/dict/lookup` and extension `cards[]` behavior derived
  from Platform lookup `items`.
- Verify exact/form cards still render.
- Verify no alphabetical neighbors are shown as clicked-word cards.
- Add focused tests or smoke evidence for:
  - `oog`
  - `de`
  - `huis`
  - `brandt`
- Capture latency before/after strict lookup rollout.

Acceptance criteria:

- Extension click-to-card flow still renders cards.
- Strict no-match cases show the intended empty/fallback UI.
- Existing progress actions still target real headword cards.
- Browser-to-AudioFilms-to-2000NL p95 target is under `250ms`, p99 under
  `500ms`, after strict lookup is enabled and services are warm.

Dependencies:

- 2000NL Issue 4 deployed or available in a test environment.

### Issue 10: AudioFilms Grouped Search Follow-Up

Repo: `vbalashi/audiofilms`
Labels: `audiofilms`, `extension`, `dictionary`, `ux`

Goal:
Introduce optional grouped search previews in the AudioFilms dictionary panel
after 2000NL grouped search is stable.

Scope:

- Add separate AudioFilms adapter such as `/api/dict/search`, or an additive
  grouped response after strict cards are rendered.
- Do not mix examples/definitions/alphabetical into `cards[]`.
- Design UI affordances for:
  - examples;
  - definitions;
  - alphabetical/browse results;
  - group-specific "More results".
- Keep first card render fast and independent from grouped search if needed.

Acceptance criteria:

- Clicked-word cards remain strict lookup cards.
- Grouped previews are visually separate and expandable.
- Group pagination works without blocking initial card render.
- UI handles `search_index_not_ready` gracefully.

Dependencies:

- 2000NL Issues 7 and 8 deployed.
- 2000NL Issue 9 complete.

## Suggested GitHub Issue Creation Order

Create in `vbalashi/2000nl` first:

1. Freeze Platform lookup/search contracts.
2. Add stable search field identity and extraction metadata.
3. Implement strict lookup RPCs.
4. Wire strict lookup into Platform routes behind a feature flag.
5. Add lookup/search instrumentation.
6. Build resumable search-document backfill.
7. Implement grouped search RPCs.
8. Add Platform grouped search API routes.

Then create in `vbalashi/audiofilms`:

9. Verify strict lookup compatibility and latency.
10. Add grouped search UI follow-up.

Add all roadmap-visible issues to the shared GitHub Project:

```text
AudioFilms / 2000NL Roadmap
https://github.com/users/vbalashi/projects/2
```

## Validation Corpus

Use this corpus across DB, API, and AudioFilms smoke checks:

- `echt`
- `écht`
- `oog`
- `de`
- `het`
- `lopen`
- `appel`
- `huis`
- `zijn`
- `maken`
- `kijken`
- `brandt`
- `brandde`
- `gebrand`

Minimum assertions:

- strict lookup never returns alphabetical neighbors for `de`, `oog`, or
  `huis`;
- form resolution works for trusted forms such as `brandt`;
- examples and definitions remain separate groups;
- alphabetical is a browse window, not substring search;
- guest/catalog search never returns private/user dictionaries;
- lookup remains read-only.

## Latency Targets

Warm request targets at current data scale:

- strict lookup DB execution: p95 `<20ms`, p99 `<50ms`;
- grouped preview DB execution: p95 `<50-60ms`, p99 `<100ms`;
- 2000NL strict HTTP endpoint: p95 `<100ms`;
- 2000NL grouped HTTP endpoint: p95 `<150ms`;
- AudioFilms browser-to-backend-to-2000NL click lookup: p95 `<250ms`, p99
  `<500ms`.

