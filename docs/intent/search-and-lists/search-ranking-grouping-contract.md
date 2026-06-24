# Search Ranking And Grouping Contract

Last updated: 2026-06-24
Status: Approved baseline for A4 implementation; count semantics are superseded
by `docs/reference/platform-api.md`.

## Purpose

Dictionary search must behave like lookup first and broad discovery second.
When a user searches `huis`, the exact headword `huis` must not be buried below
alphabetical substring matches such as `bejaardenhuis` or `benedenhuis`.

This contract defines result groups, ordering, row metadata, duplicate-source
behavior, and backend/RPC requirements. It is not an implementation patch.

## Search Modes

This contract applies to global dictionary lookup: `Woordenboek zoeken`.

List-scoped filtering may reuse the same matching metadata, but its primary
scope is different: it filters entries inside a viewed list. List filtering must
not be presented as global dictionary lookup.

## Result Groups

Return or derive these groups in this order:

| Rank | Group | Match rule | Default presentation |
|---|---|---|---|
| 1 | Exact headword | Normalized query equals normalized `word_entries.headword`. | Expanded and first. |
| 2 | Lemma or inflection | Query matches a form in `word_forms`, or a normalized plural/inflected form resolves to an entry headword. | Expanded when exact headword is absent; otherwise visible below exact. |
| 3 | Related headwords and compounds | Headword starts with, ends with, or contains the query as a compound/related headword, but is not exact. | Collapsed after the first few rows when many results exist. |
| 4 | Examples containing query | Query appears in examples or example translations, not in headword/form. | Collapsed by default with count. |
| 5 | Definitions containing query | Query appears in definitions/meaning text, not in headword/form/example. | Collapsed by default with count. |
| 6 | Broad fallback/browse | Alphabetical or fuzzy fallback used when stronger groups are empty or the user explicitly browses. | Collapsed or paginated; never above exact/lemma. |

The UI may combine groups visually on small screens, but each row must still
carry enough metadata to explain why it appeared.

## Ordering Inside Groups

Within each group, order results by:

1. Dictionary source priority: user-owned editable dictionaries first when the
   user is searching all accessible sources, then trusted curated dictionaries,
   then other accessible sources.
2. Exact normalized headword equality before case/accent/punctuation variants.
3. Preferred language/source filters before broader accessible sources.
4. Headword alphabetical order.
5. `meaning_id` or source order for multiple meanings of the same headword.

For list-scoped filtering, preserve list order as the final tie-breaker after
match group and headword relevance, unless the user explicitly chooses another
sort.

## Row Metadata Requirements

Each search result row must expose:

- `entry_id`
- `headword`
- `language_code`
- `dictionary_id`
- dictionary display metadata: name/slug/kind when available
- `part_of_speech`
- `meaning_id` and/or meaning number when useful
- `match_group`, one of:
  - `exact-headword`
  - `lemma-or-inflection`
  - `related-headword`
  - `example`
  - `definition`
  - `fallback`
- `match_label`, a short UI-ready Dutch label such as:
  - `Exacte match`
  - `Woordvorm`
  - `Samenstelling`
  - `In voorbeeld`
  - `In betekenis`
  - `Bladeren`
- `matched_text` or a short snippet for example/definition matches when
  practical
- `rank` or `group_rank` for stable ordering

The client should not infer match group only from list position. If the backend
cannot yet provide all metadata, A4 should add a typed client adapter with a
clear TODO and tests around the temporary inference.

## Duplicate Headwords Across Dictionaries

Duplicate headwords are valid. Do not merge them into one result unless the user
explicitly chooses a grouped-by-headword presentation.

When the same headword appears in multiple dictionaries:

- show one row per meaning-level entry by default;
- display dictionary source on every row;
- keep user-owned entries and curated entries distinct;
- allow the detail panel to show source and membership for the selected entry,
  not for the collapsed headword;
- sort duplicates by dictionary source priority, then meaning/source order.

If the UI groups duplicate headwords visually, expanding the group must reveal
each dictionary/meaning entry separately before the user can add to a list or
train the entry.

## Expected Behavior For `huis`

For query `huis`, the first group must be exact headword matches:

1. `huis` from each accessible dictionary source, with source metadata.
2. Other exact/variant forms only if they are true headword or form matches.

Compounds and related headwords such as `bejaardenhuis`, `benedenhuis`, or
`bijhuis` belong below exact/lemma results in the related-headword group. They
must not appear before `huis`.

Examples containing `huis` and definitions containing `huis` belong in their
own groups below headword/form matches.

If the user filters to a source that does not contain exact `huis`, the result
summary should say the exact group is absent for that source and then show the
next available groups.

## Empty, Loading, And Error States

Empty state must include the searched scope:

- `Geen resultaten in woordenboekbronnen`
- `Geen resultaten in {sourceName}`
- `Geen resultaten in lijst: {listName}` for list filtering

Loading state should not clear the previous query unless the user explicitly
clears it. If stale results remain visible while a new search loads, mark them
as loading/stale.

Error state must distinguish lookup failure from no results and keep the user's
query available for retry.

## Backend/RPC Requirements

The current `search_word_entries_gated` contract is not sufficient for this
behavior because it filters by `headword ILIKE '%query%'` and sorts by
`headword ASC`. A4 needs one of these backend paths:

1. Extend `search_word_entries_gated` to compute match group/rank and include
   dictionary metadata and snippets.
2. Add a new versioned RPC, such as `search_dictionary_entries_ranked`, and
   migrate the UI to it.

The backend must:

- keep `can_access_dictionary(...)` gating on every returned entry;
- accept language and dictionary-source filters when the UI exposes them;
- search exact headword and `word_forms` before broad headword substring;
- support example and definition matches from structured `raw` JSON or indexed
  extracted columns;
- return count metadata per group without blocking first paint on unbounded
  exact counts;
- preserve free-tier caps without hiding exact matches behind broad matches;
- include stable pagination semantics. Pagination should not split stronger
  groups behind weaker groups on page 1.

If example/definition search is expensive, A4 may ship exact/lemma/related
groups first, but the response shape should leave room for example/definition
groups without another UI rewrite.

For Platform grouped search, do not silently put approximate values in `total`.
Use the explicit `count.value` / `count.relation` policy in
`docs/reference/platform-api.md` for exact, lower-bound, estimate, and unknown
counts. Examples, definitions, and alphabetical browse must support `LIMIT + 1`
pagination and `hasMore` without requiring an exact count in the blocking
request.

## Client Requirements

The UI must:

- show exact/lemma groups before broad matches;
- display source metadata on rows where duplicate sources can exist;
- show a match reason label or grouped header;
- preserve selected entry coherently when filters/groups change;
- avoid showing a selected entry as if it belongs to a new query when it is no
  longer in the result set.

## Validation Scenarios

A4 implementation should validate at least:

- `huis` returns exact `huis` before compounds.
- A duplicate headword across two dictionaries shows source metadata for both.
- A query matching only examples appears in the example group.
- A query matching only definitions appears in the definition group.
- A no-results query shows the searched scope.
- Free-tier caps do not remove exact matches while showing broad matches first.

Until A2 fixtures exist, tests may use mocked RPC data for duplicate-source,
example-only, and definition-only states.
