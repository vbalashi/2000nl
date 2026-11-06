# Library search

Entering a query in the normal account Library opens four categories: Words,
Examples, Definitions and A–Z. Clearing the query restores ordinary browsing.
The selected category stays in the Library's owned search state. The feature
has no prototype flag or separate search route in the interface.

All categories retain the selected language, dictionary, collection or label,
part of speech and noun article. Server reads also apply account language pauses,
disabled dictionaries and current source/sharing access. Collection filtering is
by saved entry identity: saving one meaning does not silently include other
meanings of that headword in the match set. Opening an article remains a normal
complete article read under its existing access rules.

Words and A–Z use the normal article row, including article, part of speech and
meaning count. Exact headwords precede inflections and indexed fuzzy suggestions.
A–Z shows the word's alphabetical neighborhood. Examples and Definitions lead
with the matching fragment and identify its headword below. All share result-row
spacing, reading font, separators, hover, selection and focus behavior. Literal
query matches use text weight, without adding a highlight color.

Short category names contain no counts. A single counter sits beside the source
line, above the categories. Ordinary browsing, Words and A–Z show separate
localized article and selected-meaning totals (for example, `73 articles · 115
meanings`). Articles are dictionary article groups, not unique spellings: homonyms
or different parts of speech can form separate articles. Meanings count the
selected entry identities after source and vocabulary filters, before pagination;
they do not count a complete article opened separately. Reducing meanings per
entry can therefore change the meaning total while the article total stays the
same. Examples and Definitions retain their loaded-match counter described below.
The counter remains visible while results scroll. Filter drafts preview the same
active category and use the same counter format. Drafts do not alter the applied
main search until Apply. Older servers without a meaning total retain their
existing single counter rather than showing a guessed value.

Ordinary filter previews use one count-only request under the same authenticated
scope. They consume both exact totals from the same request without continuing through result pages
or projecting articles, learning state or translations. Count requests have no
cursor and do not change the normal 50-group result page. Examples and definitions
retain their loaded-match counter policy below.

Examples and definitions load 50 matches at a time. More pages require an explicit
“More 50” action; opening a category or filter draft never enumerates unseen
matches for a total. The counter shows the loaded matches with “+” while more
exist, and an exact count only when the last page is reached. A continuation
failure retains the current list and retries the same cursor. Requests are cancelled when query,
account, filters, material preferences or refresh ownership changes. Changes to selected sources, account material preferences and collection
membership invalidate scope-bound cursors rather than broadening results.

The first-party `/api/library/category-search` endpoint validates a bounded body
and pins the database principal to the authenticated account. Only its service
role can execute `search_library_category_v1`; connected clients cannot use this
first-party boundary. Selection predicates run before ranking, counting and
pagination. Exact article projection stays in the shared V2 read path.

The agreed presentation is an open list, without an outer frame. Words,
alphabetical neighbors and matching fragments share the same row geometry,
separators and selected-row marker. The temporary framed comparison and its
URL override have been removed from the Library owner.

The fixed part-of-speech catalog also includes Abbreviations and Prefixes. The
`afk`/`abbreviation` and `vv`/`prefix` labels have the same meaning in the UI
preview predicate and every Library server read (ordinary, collection, material
and category search). Source permissions and noun-only article rules still apply.

Written frequency keeps the global normalized-spelling ranks and all inclusive
rank ranges unchanged. Optional POS observations only order entries sharing a
ranked spelling: observed POS counts descend, then unobserved POS retain their
existing stable tie order. Match tier precedes frequency; spoken and alphabetical
orders are unchanged. Meanings within each POS retain their source sense order.
This applies to grouped browse/search, material scope, headword category search
and collection entry lists. Body category search retains its existing relevance
order.

Fresh installations include the empty private tables
`vocabulary_written_pos_profiles` and `vocabulary_written_pos_frequencies`.
Operators may supply language, normalized spelling, application POS and a positive
observed count separately. The application accepts its existing normalized POS
codes; source corpus tags require an explicit external mapping. Unsupported labels
(including `determiner`) stay unknown; no linguistic category or count is inferred.
The adjunct contains observations, not replacement global ranks, and is not exposed
to application client roles. Installations without it retain their existing order.
Replace observations and their profile revision atomically. Cursor scope includes
that revision, so a changed resource rejects an old page cursor. The public
migration is a fresh-install contract; managed upgrades use the private release
process.
