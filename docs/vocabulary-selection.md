# Vocabulary selection

Library and Session builder use the same vocabulary fields and POS catalogue. Training additionally owns exercises, directions, learning status, activity scope, session size and new/review balance. Library sorting affects display order, not the training queue.

The common order is source, vocabulary selection, entry type, part of speech, then meanings per entry. `Other` is a fallback for entries without a recognized POS; it does not claim that unresolved dictionary labels are a reliable expression/idiom/sentence taxonomy. Hidden word POS/article choices are ignored for Other. Abbreviations and prefixes use the existing `afk` and `vv` labels.

Frequency uses the external CGN spoken and SoNaR500 written spelling lists. `from` and `to` are one-based inclusive **retained global ranks**, before intersection with the user's accessible dictionaries. There is no refill outside the range or ranking invented for missing spellings. Corpus data and its loader are supplied separately; no corpus is included in this repository. An independent personal entry has no corpus rank merely because its spelling matches a source word. Without a supported explicit source link, personal entries remain unranked.

A spelling selects all its accessible dictionary units. First N meanings are taken in each existing source group/POS unit's dictionary order, then learning status and existing exercise eligibility narrow that set. A new-only session never replaces an already learned first or second meaning with the third. Existing pointer-only, introduction-order, access, archive and renderability rules remain authoritative. Attached idioms/examples use their explicit parent entry; no relationship is inferred from words occurring in an expression.

Library applies vocabulary predicates before grouping, counts and pagination. Frequency sorting places unknown ranks last, alphabetically; search match tiers retain priority. Cursor identity includes selection, profile and frequency-data revision. Exact article reads still return the authorized full article; the results list carries the selected entry IDs.

“Train these words” copies criteria into a new builder draft, including source, label, search query and active search category. It does not create a collection, save a recipe, launch a run or discard an owned session. Normal search categories are resolved once as a set of IDs using the same server search functions; they are not limited to the first result page. A–Z copies the same 31-entry centered neighborhood as Library. Display label names are excluded from semantic run/count identity. Live access and material preferences are re-evaluated at count/start, so revoked access or changed memberships cannot broaden a selection.

The builder availability strip counts eligible material after exercise-family, direction, source, vocabulary and training eligibility rules are applied. A word is a distinct normalized headword within a dictionary and language; a meaning is a distinct eligible entry; a card is an eligible entry/direction or idiom/direction. Therefore these counts need not match the Library's pre-training article and meaning counts, nor a session's eventual size. Introduced and new cards are separately reported; some eligible cards can have neither status, so those two counts must not be assumed to sum to the card total. The same server-owned eligible set supplies all three totals for ordinary meanings, word-in-context and idioms.

The builder availability strip counts all eligible due-now reviews, introduced reviews and new cards for its current draft. Session size, balance and new/review choice determine the eventual plan, not those three availability totals. Changes debounce for 250 ms, obsolete reads are cancelled, previous-recipe values are hidden, and failures are shown without fabricated zeros. Start is authoritative and does not implicitly save the edited draft.

## Availability validation before release

Changes to selection or counting require both correctness and performance evidence.
Small semantic fixtures, mocked browser responses and schema/permission probes do
not establish that a full dictionary can be counted within the request deadline.

- Run the real availability RPC against a synthetic dictionary with representative
  entry and source-binding counts, multiple meanings per source group, and enough
  unrelated entries to expose repeated scans. Record fixture size and PostgreSQL
  settings; match the actual deployed settings and exercise both JIT on and off.
  Exercise spoken and written ranks 1–100 with meanings `all`, `1`, `2` and `3`.
  Assert correct
  counts and enforce a statement timeout below the route deadline. Repeat after
  warming caches and report first-run and repeated timings separately.
  Include a wider noninitial range such as 400–800, not just the top 100 ranks.
  Measure a new backend connection and repeated calls through the prepared-plan
  threshold; distinguish warmed buffers from physical cold-disk measurements.
  Include All words with each meaning limit and parent-word selection for Idioms
  and word-in-context exercises; a fast frequency path does not establish that
  those paths avoid repeated per-entry work. Compare selected entry IDs against
  the scalar selection contract, including homonyms, mixed parts of speech,
  unbound entries, pointer-only or archived first meanings and ordering ties.
- Exercise the builder with its real availability hook/client: start with ready
  counts, change the meaning limit, return HTTP 503, and verify that loading ends
  with an actionable error without automatic retry. Separately exhaust the bounded
  retries for network errors and HTTP 429. Manual retry must restore counts;
  changing the selection must cancel obsolete work and never show its result.
  Verify the pending state is visible in light and dark themes.
- For a managed release, the operator must run the rank/meaning matrix and broad
  exercise cases on staging with the full operator-supplied dictionary and frequency
  resources, using the exact candidate application revision and database contract.
  Time the authenticated availability route as well as SQL, with production query
  settings and a documented budget below the route deadline. Any timeout,
  unexpected count, or exhausted-retry loading state blocks promotion. Record
  revision, dataset sizes, settings, timings and verdict in private release evidence;
  keep content, account identifiers and request payloads out of public artifacts.

These checks supplement the database contract and access probes. A successful
health check or resource-profile count does not substitute for executing the
filtered availability request. Managed provisioning and promotion still require
the operator's separate release authorization.

DB293 adds private frequency tables and shared selection helpers. Fresh-install bootstrap and read-only probes cover the application contract. Managed forward migration/data provisioning and release authorization remain separate operational work; applying this fresh-install migration in a local QA environment is not a managed deployment.

Library handoff also pins its selected language for a collection, including collections whose primary language differs. A foreign-language draft reads a separate catalog while an owned run stays intact; the parent language switch is deferred until explicit Start. Word-search previews use server article-identity totals instead of hydrating every matching article just to count it. Filter reset keeps the independent display sorting.

## Source words for Idioms and Translation

The builder has a separate `sourceWordStatus` choice for Idioms and word-in-context
Translation. `learning` requires current ordinary-word learning on the exact parent
meaning, excluding active Known meanings. `all` accepts new, learning and Known
source words. Both choices retain source access, selected meanings, material,
content availability and exercise-specific card exclusions. The exercise's
new/review mix is independent of the source-word choice.

New setup/count/start requests explicitly default to `learning`. Stored legacy
runs without the field keep their previous eligibility; editing a setup does not
change an owned run. Ordinary meaning training ignores the remembered source-word
choice. Standalone sentence training remains paused.

The verified categories replacing the Other fallback are tracked in
[issue #66](https://github.com/vbalashi/2000nl/issues/66), pending complete dictionary
metadata. No guessed subtype is introduced from article text.

Contextual Translation retains ordinary reverse Known and exclusion behavior.
Including Already Know reverse cards with independently graded context progress is
deferred: changing candidate selection alone would produce cards that cannot be
graded. No Known mark is cleared by choosing All, and no second schedule is created.
The contextual help states this limit explicitly. Idioms already have their own
exercise state and can use Known parent meanings.

## Shared filter presentation

Library and the training builder render `VocabularyFilters` and `VocabularyFilterSummary`.
This shared block owns compact Spoken/Written choices, Top100/200/300/500/1000,
exact range editing, entry type, POS/article selection and1–5/all meaning limits.
Library keeps draft/Apply/Cancel and its independent sorting; training keeps session
controls. The cross-surface regression exercises the actual two adapters and requires
the same accessible choices and equivalent committed content criteria.
